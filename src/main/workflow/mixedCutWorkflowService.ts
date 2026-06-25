import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import {
  OUTPUT_PRESETS,
  type MediaAsset,
  type OutputPreset,
  type PublishingPackage,
  type VideoTask
} from "../../shared/domain";
import {
  calculateGroupedMixedCutBatchPlan,
  type GroupedMixedCutBatchPlan
} from "../../shared/mixedCutPlanning";
import type { AppPathSettings } from "../../shared/appSettings";
import {
  DEFAULT_RUNTIME_PERFORMANCE_PROFILE,
  type RuntimePerformanceProfile
} from "../../shared/performanceProfile";
import { getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { TaskRepository } from "../storage/taskRepository";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);
const MIN_TARGET_DURATION_SECONDS = 12;
const MAX_TARGET_DURATION_SECONDS = 180;
const MAX_AUDIO_TARGET_DURATION_SECONDS = 600;
const SEGMENT_DURATION_SECONDS = 2.4;

interface PathSettingsReader {
  getPathSettings: () => AppPathSettings;
}

interface PerformanceProfileReader {
  getPerformanceProfile: () => RuntimePerformanceProfile;
}

interface MixedCutEditDecisionRecord {
  taskId: string;
  batchIndex: number;
  presetId: string;
  generatedAt: string;
  targetCount: number;
  materialCount: number;
  groupCount: number;
  combinationSignature: string;
  groupedPlan: GroupedMixedCutBatchPlan;
  outputVideo: string;
  subtitleFile: string;
  coverFile: string;
  audioSourcePath?: string;
  targetDurationSeconds: number;
  targetDurationSource: "audio" | "script" | "material";
  warnings: string[];
  performance: {
    mode: RuntimePerformanceProfile["mode"];
    label: RuntimePerformanceProfile["label"];
    ffmpegThreads: number;
  };
  segments: Array<{
    order: number;
    sourceAssetId: string;
    shotId: string;
    groupId: string;
    useCount: number;
    maxUses: number;
    sourcePath: string;
    role: string;
    startSeconds: number;
    durationSeconds: number;
    transform: string;
  }>;
}

interface MixedCutShot {
  id: string;
  asset: MediaAsset;
  groupId: string;
  relativePath: string;
  absolutePath: string;
}

interface MixedCutShotGroup {
  groupId: string;
  reuseRate: number;
  maxUsesPerShot: number;
  shots: MixedCutShot[];
}

interface MixedCutCombination {
  batchIndex: number;
  signature: string;
  shots: MixedCutShot[];
  usageAfterSelection: Map<string, number>;
}

export class MixedCutWorkflowService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly paths: AppPaths,
    private readonly pathSettingsReader?: PathSettingsReader,
    private readonly performanceProfileReader?: PerformanceProfileReader
  ) {}

  prepareMixedCut(taskId: string): VideoTask {
    this.taskRepository.updateStepStatus(taskId, "avatar", "complete");
    this.taskRepository.updateStepStatus(taskId, "subtitles", "running");
    this.taskRepository.updateStepStatus(taskId, "post-production", "running");

    try {
      const task = this.requireTask(taskId);
      if (task.generationMode !== "mixed-cut") {
        throw new Error("当前任务不是混剪视频模式。");
      }

      const taskDirectory = getTaskDirectory(this.paths, taskId);
      const mixedCutAudio = resolveMixedCutAudio(task, taskDirectory);
      if (task.mixedCutChapterMode === "fill-with-bgm" && !mixedCutAudio) {
        throw new Error(
          "为配音填充画面模式需要先导入一条混剪配音/音乐，音频只会作为时长和音轨使用，不会作为画面素材。"
        );
      }

      const shotGroups = buildMixedCutShotGroups(task, taskDirectory);
      const groupedPlan = calculateGroupedMixedCutBatchPlan({
        groups: shotGroups.map((group) => ({
          groupId: group.groupId,
          shotCount: group.shots.length,
          reuseRate: group.reuseRate
        }))
      });
      if (groupedPlan.targetCount <= 0) {
        throw new Error(
          "混剪素材不足：请确认素材根目录下有 1、2、3 等数字文件夹，且每个文件夹至少包含一个可用视频或图片。"
        );
      }
      applyPlanLimitsToShotGroups(shotGroups, groupedPlan);
      const combinations = createUniqueMixedCutCombinations(shotGroups, groupedPlan.targetCount);
      const targetCount = combinations.length;
      const generatedRecords: MixedCutEditDecisionRecord[] = [];
      const performanceProfile =
        this.performanceProfileReader?.getPerformanceProfile() ??
        DEFAULT_RUNTIME_PERFORMANCE_PROFILE;

      for (let batchIndex = 1; batchIndex <= targetCount; batchIndex += 1) {
        const combination = combinations[batchIndex - 1];
        if (!combination) {
          throw new Error(`混剪组合 ${batchIndex} 计算失败，请降低重复率或增加素材。`);
        }
        for (const presetId of task.selectedOutputPresets) {
          const preset = requireOutputPreset(presetId);
          const record = this.renderMixedCutVariant({
            batchIndex,
            combination,
            groupedPlan,
            performanceProfile,
            task,
            taskDirectory,
            preset,
            targetCount
          });
          generatedRecords.push(record);
        }
      }

      const manifestPath = "exports/mixed-cut-batch/manifest.json";
      writeTaskFile(
        this.paths,
        taskId,
        manifestPath,
        JSON.stringify(createBatchManifest(task, generatedRecords, targetCount), null, 2)
      );
      this.taskRepository.addMediaAsset(taskId, "publishing-package", manifestPath);

      const externalDirectory = copyBatchToExportDirectory(
        this.paths,
        taskId,
        this.requireTask(taskId),
        generatedRecords,
        targetCount,
        this.pathSettingsReader?.getPathSettings().generatedVideoDirectory
      );
      this.taskRepository.updatePublishingPackage(taskId, {
        ...createPublishingPackage(this.requireTask(taskId), targetCount),
        exportDirectory: externalDirectory || "exports/mixed-cut-batch"
      });

      this.taskRepository.updateStepStatus(taskId, "subtitles", "complete");
      this.taskRepository.updateStepStatus(taskId, "post-production", "complete");
      return this.taskRepository.updateStepStatus(taskId, "export", "complete");
    } catch (error) {
      const message = error instanceof Error ? error.message : "混剪视频合成准备失败。";
      this.taskRepository.updateStepStatus(taskId, "subtitles", "retry-ready", message);
      this.taskRepository.updateStepStatus(taskId, "post-production", "retry-ready", message);
      return this.taskRepository.updateStepStatus(taskId, "export", "retry-ready", message);
    }
  }

  private renderMixedCutVariant(input: {
    task: VideoTask;
    combination: MixedCutCombination;
    groupedPlan: GroupedMixedCutBatchPlan;
    performanceProfile: RuntimePerformanceProfile;
    taskDirectory: string;
    preset: OutputPreset;
    batchIndex: number;
    targetCount: number;
  }): MixedCutEditDecisionRecord {
    const mixedCutAudio = resolveMixedCutAudio(input.task, input.taskDirectory);
    const subtitleScript =
      input.task.finalScript.trim() || input.task.sourceScript.trim() || input.task.title;
    const selectedShots = input.combination.shots;
    const targetTiming = resolveMixedCutTargetTiming({
      audio: mixedCutAudio,
      selectedShotCount: selectedShots.length,
      task: input.task
    });
    const targetDurationSeconds = targetTiming.seconds;
    const segmentDurationSeconds = Math.max(
      SEGMENT_DURATION_SECONDS / 2,
      targetDurationSeconds / Math.max(1, selectedShots.length)
    );
    const warnings = createBatchWarnings(input.groupedPlan, input.targetCount);
    const segmentDirectory = path.join(
      input.taskDirectory,
      "post",
      "mixed-cut-segments",
      `batch-${input.batchIndex}-${input.preset.id}`
    );
    fs.rmSync(segmentDirectory, { recursive: true, force: true });
    fs.mkdirSync(segmentDirectory, { recursive: true });

    const segmentPaths = selectedShots.map((shot, index) => {
      const sourcePath = shot.absolutePath;
      const asset = shot.asset;
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`混剪素材不存在：${asset.relativePath}`);
      }
      const outputPath = path.join(segmentDirectory, `segment-${index + 1}.mp4`);
      renderSegment({
        sourcePath,
        outputPath,
        preset: input.preset,
        performanceProfile: input.performanceProfile,
        startSeconds: videoStartOffset(input.batchIndex, index),
        durationSeconds: segmentDurationSeconds
      });
      return outputPath;
    });

    const outputVideo = `post/mixed-cut-batch-${input.batchIndex}-${input.preset.id}.mp4`;
    const outputVideoPath = absoluteTaskPath(this.paths, input.task.id, outputVideo);
    const silentVideoPath = mixedCutAudio
      ? path.join(segmentDirectory, "mixed-cut-silent-video.mp4")
      : outputVideoPath;
    concatSegments({
      segmentPaths,
      outputPath: silentVideoPath,
      targetDurationSeconds,
      workingDirectory: segmentDirectory
    });
    if (mixedCutAudio) {
      muxAudio({
        audioPath: mixedCutAudio.absolutePath,
        outputPath: outputVideoPath,
        performanceProfile: input.performanceProfile,
        targetDurationSeconds,
        videoPath: silentVideoPath,
        volumePercent: input.task.mixedCutBgmVolume
      });
    }
    if (input.performanceProfile.cleanupIntermediateFiles) {
      fs.rmSync(segmentDirectory, { recursive: true, force: true });
    }

    const subtitleFile = `subtitles/mixed-cut-batch-${input.batchIndex}-${input.preset.id}.srt`;
    const coverFile = `post/mixed-cut-cover-${input.batchIndex}-${input.preset.id}.svg`;
    const editDecisionFile = `post/edit-decisions-mixed-cut-${input.batchIndex}-${input.preset.id}.json`;

    writeTaskFile(
      this.paths,
      input.task.id,
      subtitleFile,
      createTimedTextSrt(subtitleScript, targetDurationSeconds)
    );
    writeTaskFile(
      this.paths,
      input.task.id,
      coverFile,
      createBatchCoverSvg(input.task, input.preset, input.batchIndex)
    );

    const record: MixedCutEditDecisionRecord = {
      taskId: input.task.id,
      batchIndex: input.batchIndex,
      presetId: input.preset.id,
      generatedAt: new Date().toISOString(),
      targetCount: input.targetCount,
      materialCount: input.groupedPlan.totalShotCount,
      groupCount: input.groupedPlan.groupCount,
      combinationSignature: input.combination.signature,
      groupedPlan: input.groupedPlan,
      outputVideo,
      subtitleFile,
      coverFile,
      audioSourcePath: mixedCutAudio?.relativePath,
      targetDurationSeconds,
      targetDurationSource: targetTiming.source,
      warnings,
      performance: {
        mode: input.performanceProfile.mode,
        label: input.performanceProfile.label,
        ffmpegThreads: input.performanceProfile.ffmpegThreads
      },
      segments: selectedShots.map((shot, index) => ({
        order: index + 1,
        sourceAssetId: shot.asset.id,
        shotId: shot.id,
        groupId: shot.groupId,
        useCount: input.combination.usageAfterSelection.get(shot.id) ?? 0,
        maxUses:
          input.groupedPlan.groups.find((group) => group.groupId === shot.groupId)
            ?.maxUsesPerShot ?? 1,
        sourcePath: shot.relativePath,
        role: segmentRole(index),
        startSeconds: videoStartOffset(input.batchIndex, index),
        durationSeconds: segmentDurationSeconds,
        transform: `${input.preset.aspectRatio} scale/pad, segment-level reorder`
      }))
    };

    writeTaskFile(this.paths, input.task.id, editDecisionFile, JSON.stringify(record, null, 2));
    this.taskRepository.addMediaAsset(input.task.id, "mixed-cut-video", outputVideo);
    this.taskRepository.addMediaAsset(input.task.id, "subtitle-file", subtitleFile);
    this.taskRepository.addMediaAsset(input.task.id, "cover-image", coverFile);
    this.taskRepository.addMediaAsset(input.task.id, "edit-decision-record", editDecisionFile);

    if (input.batchIndex === 1) {
      this.taskRepository.updateOutputVariant(input.task.id, input.preset.id, {
        status: "complete",
        finishedVideoPath: outputVideo,
        coverImagePath: coverFile
      });
    }

    return record;
  }

  private requireTask(taskId: string): VideoTask {
    const task = this.taskRepository.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    return task;
  }
}

function buildMixedCutShotGroups(task: VideoTask, taskDirectory: string): MixedCutShotGroup[] {
  const settings = new Map(
    (task.mixedCutGroupSettings ?? []).map((setting) => [setting.groupId, setting.reuseRate])
  );
  const grouped = new Map<string, MixedCutShot[]>();

  for (const asset of task.mediaAssets) {
    if (asset.kind !== "mixed-cut-material" || !isVisualMixedCutAsset(asset.relativePath)) {
      continue;
    }

    const groupId = mixedCutGroupIdFromRelativePath(asset.relativePath);
    if (!groupId) {
      continue;
    }

    const absolutePath = absoluteTaskPathFromDirectory(taskDirectory, asset.relativePath);
    const shot: MixedCutShot = {
      id: createMixedCutShotId(groupId, asset.relativePath, absolutePath),
      asset,
      groupId,
      relativePath: asset.relativePath,
      absolutePath
    };
    const shots = grouped.get(groupId) ?? [];
    shots.push(shot);
    grouped.set(groupId, shots);
  }

  const groupIds = new Set([...settings.keys(), ...grouped.keys()]);
  const groups = [...groupIds]
    .sort((left, right) => Number(left) - Number(right))
    .map((groupId) => ({
      groupId,
      reuseRate: settings.get(groupId) ?? task.mixedCutReuseRate,
      maxUsesPerShot: 1,
      shots: (grouped.get(groupId) ?? []).sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath)
      )
    }));

  if (groups.length === 0) {
    throw new Error("混剪素材需要按数字文件夹整理：请选择包含 1、2、3 等子文件夹的素材根目录。");
  }

  return groups;
}

function applyPlanLimitsToShotGroups(
  shotGroups: MixedCutShotGroup[],
  plan: GroupedMixedCutBatchPlan
): void {
  const summaryByGroup = new Map(plan.groups.map((group) => [group.groupId, group]));
  for (const group of shotGroups) {
    group.maxUsesPerShot = summaryByGroup.get(group.groupId)?.maxUsesPerShot ?? 1;
  }
}

function createUniqueMixedCutCombinations(
  shotGroups: MixedCutShotGroup[],
  targetCount: number
): MixedCutCombination[] {
  const usageCounts = new Map<string, number>();
  const usedSignatures = new Set<string>();
  const combinations: MixedCutCombination[] = [];

  for (let batchIndex = 1; batchIndex <= targetCount; batchIndex += 1) {
    const selected = findNextCombination(shotGroups, usageCounts, usedSignatures, batchIndex);
    if (!selected) {
      break;
    }

    for (const shot of selected) {
      usageCounts.set(shot.id, (usageCounts.get(shot.id) ?? 0) + 1);
    }

    const signature = createCombinationSignature(selected);
    usedSignatures.add(signature);
    combinations.push({
      batchIndex,
      signature,
      shots: selected,
      usageAfterSelection: new Map(usageCounts)
    });
  }

  if (combinations.length === 0) {
    throw new Error("素材组合不足：请增加每个数字文件夹里的片段，或提高该组重复率。");
  }

  return combinations;
}

function findNextCombination(
  shotGroups: MixedCutShotGroup[],
  usageCounts: Map<string, number>,
  usedSignatures: Set<string>,
  batchIndex: number
): MixedCutShot[] | null {
  const selected: MixedCutShot[] = [];
  let visitedNodes = 0;
  const maxVisitedNodes = 50_000;

  const visit = (groupIndex: number): MixedCutShot[] | null => {
    visitedNodes += 1;
    if (visitedNodes > maxVisitedNodes) {
      return null;
    }

    if (groupIndex >= shotGroups.length) {
      const signature = createCombinationSignature(selected);
      return usedSignatures.has(signature) ? null : [...selected];
    }

    const group = shotGroups[groupIndex];
    const orderedShots = rotateShots(group.shots, batchIndex + groupIndex);
    for (const shot of orderedShots) {
      const currentUse = usageCounts.get(shot.id) ?? 0;
      if (currentUse >= group.maxUsesPerShot) {
        continue;
      }

      selected.push(shot);
      const result = visit(groupIndex + 1);
      if (result) {
        return result;
      }
      selected.pop();
    }

    return null;
  };

  return visit(0);
}

function rotateShots(shots: MixedCutShot[], offset: number): MixedCutShot[] {
  if (shots.length <= 1) {
    return shots;
  }

  const start = offset % shots.length;
  return [...shots.slice(start), ...shots.slice(0, start)];
}

function createCombinationSignature(shots: MixedCutShot[]): string {
  return crypto
    .createHash("sha1")
    .update(shots.map((shot) => `${shot.groupId}:${shot.id}`).join("|"))
    .digest("hex");
}

function createMixedCutShotId(groupId: string, relativePath: string, absolutePath: string): string {
  const hash = crypto.createHash("sha1");
  hash.update(groupId);
  hash.update("|");
  hash.update(relativePath);
  if (fs.existsSync(absolutePath)) {
    const stat = fs.statSync(absolutePath);
    hash.update(`|${stat.size}|${Math.floor(stat.mtimeMs)}`);
    hash.update(fs.readFileSync(absolutePath));
  }
  return hash.digest("hex").slice(0, 16);
}

function mixedCutGroupIdFromRelativePath(relativePath: string): string {
  const parts = relativePath.split("/");
  const markerIndex = parts.indexOf("mixed-materials");
  const groupId = markerIndex >= 0 ? parts[markerIndex + 1] : undefined;
  return groupId && /^\d+$/.test(groupId) ? groupId : "";
}

function isVisualMixedCutAsset(relativePath: string): boolean {
  const extension = path.extname(relativePath).toLowerCase();
  return VIDEO_EXTENSIONS.has(extension) || IMAGE_EXTENSIONS.has(extension);
}

function isAudioMixedCutAsset(relativePath: string): boolean {
  return AUDIO_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

function resolveMixedCutAudio(
  task: VideoTask,
  taskDirectory: string
): { asset: MediaAsset; relativePath: string; absolutePath: string } | null {
  const asset = [...task.mediaAssets]
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .find(
      (candidate) =>
        candidate.kind === "mixed-cut-audio" && isAudioMixedCutAsset(candidate.relativePath)
    );
  if (!asset) {
    return null;
  }

  return {
    asset,
    relativePath: asset.relativePath,
    absolutePath: absoluteTaskPathFromDirectory(taskDirectory, asset.relativePath)
  };
}

function resolveMixedCutTargetTiming(input: {
  task: VideoTask;
  selectedShotCount: number;
  audio: { absolutePath: string } | null;
}): { seconds: number; source: MixedCutEditDecisionRecord["targetDurationSource"] } {
  if (input.task.mixedCutChapterMode === "fill-with-bgm") {
    if (!input.audio) {
      throw new Error("为配音填充画面模式需要先导入一条混剪配音/音乐。");
    }

    return {
      seconds: clampAudioTargetDuration(getMediaDurationSeconds(input.audio.absolutePath)),
      source: "audio"
    };
  }

  if (input.task.mixedCutChapterMode === "fixed-material-count") {
    return {
      seconds: clampMaterialTargetDuration(input.selectedShotCount * SEGMENT_DURATION_SECONDS),
      source: "material"
    };
  }

  return {
    seconds: estimateScriptDurationSeconds(input.task.finalScript),
    source: "script"
  };
}

function absoluteTaskPathFromDirectory(taskDirectory: string, relativePath: string): string {
  return path.join(taskDirectory, ...relativePath.split("/"));
}

function renderSegment(input: {
  sourcePath: string;
  outputPath: string;
  preset: OutputPreset;
  performanceProfile: RuntimePerformanceProfile;
  startSeconds: number;
  durationSeconds: number;
}): void {
  const ffmpegPath = requireFfmpegPath();
  const extension = path.extname(input.sourcePath).toLowerCase();
  const isImage = IMAGE_EXTENSIONS.has(extension);
  const filter = [
    `scale=${input.preset.width}:${input.preset.height}:force_original_aspect_ratio=decrease`,
    `pad=${input.preset.width}:${input.preset.height}:(ow-iw)/2:(oh-ih)/2`,
    "setsar=1",
    "fps=30"
  ].join(",");

  const args = [
    "-y",
    ...(isImage ? ["-loop", "1"] : ["-stream_loop", "-1", "-ss", input.startSeconds.toFixed(2)]),
    "-t",
    input.durationSeconds.toFixed(2),
    "-i",
    input.sourcePath,
    "-vf",
    filter,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    input.performanceProfile.ffmpegPreset,
    "-crf",
    String(22 + input.performanceProfile.crfOffset),
    "-threads",
    String(input.performanceProfile.ffmpegThreads),
    "-pix_fmt",
    "yuv420p",
    input.outputPath
  ];

  const result = spawnSync(ffmpegPath, args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 10 * 60 * 1000
  });

  assertFfmpegSuccess(result, input.outputPath, "混剪片段生成失败");
}

function concatSegments(input: {
  segmentPaths: string[];
  outputPath: string;
  targetDurationSeconds: number;
  workingDirectory: string;
}): void {
  const ffmpegPath = requireFfmpegPath();
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  const concatListPath = path.join(input.workingDirectory, "concat.txt");
  fs.writeFileSync(
    concatListPath,
    input.segmentPaths.map((segmentPath) => `file '${escapeConcatPath(segmentPath)}'`).join("\n"),
    "utf8"
  );

  const result = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-t",
      input.targetDurationSeconds.toFixed(2),
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      input.outputPath
    ],
    {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 10 * 60 * 1000
    }
  );

  assertFfmpegSuccess(result, input.outputPath, "混剪基础视频生成失败");
}

function muxAudio(input: {
  audioPath: string;
  outputPath: string;
  performanceProfile: RuntimePerformanceProfile;
  targetDurationSeconds: number;
  videoPath: string;
  volumePercent: number;
}): void {
  const ffmpegPath = requireFfmpegPath();
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  const volume = Math.max(0, Math.min(100, input.volumePercent)) / 100;
  const result = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-i",
      input.videoPath,
      "-stream_loop",
      "-1",
      "-i",
      input.audioPath,
      "-t",
      input.targetDurationSeconds.toFixed(2),
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-filter:a",
      `volume=${volume.toFixed(2)}`,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-threads",
      String(input.performanceProfile.ffmpegThreads),
      "-shortest",
      "-movflags",
      "+faststart",
      input.outputPath
    ],
    {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 10 * 60 * 1000
    }
  );

  assertFfmpegSuccess(result, input.outputPath, "混剪音频合成失败");
}

function getMediaDurationSeconds(filePath: string): number {
  if (!fs.existsSync(filePath)) {
    throw new Error(`混剪音频不存在：${filePath}`);
  }

  const result = spawnSync(requireFfmpegPath(), ["-hide_banner", "-i", filePath], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    timeout: 30_000
  });
  const output = `${result.stderr || ""}\n${result.stdout || ""}`;
  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) {
    throw new Error("无法读取混剪音频时长，请换用 mp3、wav 或 m4a 音频。");
  }

  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function clampAudioTargetDuration(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("混剪音频时长无效，请换用可正常播放的音频文件。");
  }

  return Math.min(MAX_AUDIO_TARGET_DURATION_SECONDS, Math.max(1, Number(seconds.toFixed(2))));
}

function clampMaterialTargetDuration(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return MIN_TARGET_DURATION_SECONDS;
  }

  return Math.min(
    MAX_TARGET_DURATION_SECONDS,
    Math.max(SEGMENT_DURATION_SECONDS, Number(seconds.toFixed(2)))
  );
}

function assertFfmpegSuccess(
  result: ReturnType<typeof spawnSync>,
  outputPath: string,
  label: string
): void {
  if (result.error) {
    throw new Error(`${label}：${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${label}：${(result.stderr || result.stdout || "").slice(-1200)}`);
  }

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error(`${label}：输出文件为空。`);
  }
}

function createTimedTextSrt(script: string, targetDurationSeconds: number): string {
  const text = script
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
  const chunks = chunkText(text, 34);
  const duration = Math.max(2, targetDurationSeconds / Math.max(1, chunks.length));

  return chunks
    .map((chunk, index) => {
      const start = index * duration;
      const end =
        index === chunks.length - 1
          ? targetDurationSeconds
          : Math.min(targetDurationSeconds, (index + 1) * duration);
      return [String(index + 1), `${formatSrtTime(start)} --> ${formatSrtTime(end)}`, chunk].join(
        "\n"
      );
    })
    .join("\n\n");
}

function estimateScriptDurationSeconds(script: string): number {
  const text = script.replace(/\s+/g, " ").trim();
  if (!text) {
    return MIN_TARGET_DURATION_SECONDS;
  }

  const cjkCharacters = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinWords = (text.replace(/[\u3400-\u9fff]/g, " ").match(/[A-Za-z0-9]+/g) ?? []).length;
  const punctuationPauses = (text.match(/[。！？!?.,，；;]/g) ?? []).length * 0.28;
  const estimatedSeconds = cjkCharacters / 4 + latinWords / 2.5 + punctuationPauses + 2;

  return Math.min(
    MAX_TARGET_DURATION_SECONDS,
    Math.max(MIN_TARGET_DURATION_SECONDS, Math.ceil(estimatedSeconds))
  );
}

function chunkText(value: string, maxLength: number): string[] {
  if (!value.trim()) {
    return ["混剪视频"];
  }

  const chunks: string[] = [];
  let buffer = "";
  for (const character of value) {
    buffer += character;
    if (buffer.length >= maxLength || /[。！？!?]/.test(character)) {
      chunks.push(buffer.trim());
      buffer = "";
    }
  }

  if (buffer.trim()) {
    chunks.push(buffer.trim());
  }

  return chunks;
}

function createBatchCoverSvg(task: VideoTask, preset: OutputPreset, batchIndex: number): string {
  const style = task.coverStyle;
  const title = escapeXml(style.title.trim() || task.title);
  const subtitle = escapeXml(style.subtitle.trim() || `混剪第 ${batchIndex} 条`);
  const titleSize = Math.round((style.fontSize / 1080) * preset.width);
  const subtitleSize = Math.round(titleSize * 0.44);
  const titleY = Math.round(preset.height * (style.verticalPercent / 100));
  const subtitleY = titleY + Math.round(titleSize * 1.12);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${preset.width}" height="${preset.height}" viewBox="0 0 ${preset.width} ${preset.height}">
  <rect width="100%" height="100%" fill="${style.backgroundColor}"/>
  <rect x="${Math.round(preset.width * 0.07)}" y="${Math.round(preset.height * 0.08)}" width="${Math.round(preset.width * 0.86)}" height="${Math.round(preset.height * 0.012)}" fill="${style.accentColor}"/>
  <text x="${Math.round(preset.width * 0.08)}" y="${titleY}" font-family="${escapeXml(style.fontFamily)}" font-size="${titleSize}" fill="${style.textColor}" font-weight="${style.fontWeight === "bold" ? "700" : "400"}">${title}</text>
  <text x="${Math.round(preset.width * 0.08)}" y="${subtitleY}" font-family="${escapeXml(style.fontFamily)}" font-size="${subtitleSize}" fill="${style.textColor}" opacity="0.76">${subtitle}</text>
</svg>
`;
}

function createBatchManifest(
  task: VideoTask,
  records: MixedCutEditDecisionRecord[],
  targetCount: number
) {
  return {
    generatedBy: "Digital Human Studio mixed-cut batch",
    generatedAt: new Date().toISOString(),
    task: {
      id: task.id,
      title: task.title,
      mixedCutTargetCount: targetCount,
      selectedOutputPresets: task.selectedOutputPresets
    },
    records,
    note: "混剪模式只负责批量组合；需要进一步去重时，请把成片导入“视频去重处理”模式。"
  };
}

function createPublishingPackage(task: VideoTask, targetCount: number): PublishingPackage {
  return {
    title: task.coverStyle.title.trim() || task.title,
    description: "批量混剪视频已生成。需要进一步原创度处理时，请进入“视频去重处理”模式。",
    tags: ["混剪视频", "短视频", "素材重组"],
    notes: `本批次按素材组合与重复率自动生成 ${targetCount} 条；原创度评分请在视频去重处理模式中运行。`
  };
}

function copyBatchToExportDirectory(
  paths: AppPaths,
  taskId: string,
  task: VideoTask,
  records: MixedCutEditDecisionRecord[],
  targetCount: number,
  generatedVideoDirectory?: string
): string | undefined {
  const selectedDirectory = task.exportDirectory?.trim() || generatedVideoDirectory?.trim();
  if (!selectedDirectory) {
    return undefined;
  }

  const targetDirectory = path.join(
    path.resolve(selectedDirectory),
    `${safeFileName(task.title)}-mixed-cut-${formatTimestamp(new Date())}`
  );
  fs.mkdirSync(targetDirectory, { recursive: true });

  for (const record of records) {
    copyTaskAsset(
      paths,
      taskId,
      record.outputVideo,
      path.join(targetDirectory, "videos", path.basename(record.outputVideo))
    );
    copyTaskAsset(
      paths,
      taskId,
      record.subtitleFile,
      path.join(targetDirectory, "subtitles", path.basename(record.subtitleFile))
    );
    copyTaskAsset(
      paths,
      taskId,
      record.coverFile,
      path.join(targetDirectory, "covers", path.basename(record.coverFile))
    );
  }

  fs.writeFileSync(
    path.join(targetDirectory, "manifest.json"),
    JSON.stringify(createBatchManifest(task, records, targetCount), null, 2),
    "utf8"
  );

  return targetDirectory;
}

function copyTaskAsset(
  paths: AppPaths,
  taskId: string,
  relativePath: string,
  targetPath: string
): void {
  const sourcePath = absoluteTaskPath(paths, taskId, relativePath);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`导出文件不存在：${relativePath}`);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function createBatchWarnings(plan: GroupedMixedCutBatchPlan, targetCount: number): string[] {
  const warnings: string[] = [];
  if (plan.totalShotCount < 3) {
    warnings.push("素材少于 3 个，批量混剪容易出现同质化。建议补充更多素材。");
  }
  if (targetCount >= plan.combinationCount && plan.combinationCount < 10_000) {
    warnings.push("生成数量明显高于素材数量，建议后续进入视频去重处理模式做原创度评分。");
  }
  for (const warning of plan.warnings) {
    warnings.push(warning);
  }
  return warnings;
}

function videoStartOffset(batchIndex: number, segmentIndex: number): number {
  return ((batchIndex + segmentIndex) % 4) * 0.6;
}

function segmentRole(index: number): string {
  return ["hook", "context", "proof", "detail", "result", "cta"][index] ?? "b-roll";
}

function formatSrtTime(seconds: number): string {
  const normalized = Math.max(0, Math.round(seconds * 1000));
  const milliseconds = normalized % 1000;
  const totalSeconds = Math.floor(normalized / 1000);
  const second = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minute = totalMinutes % 60;
  const hour = Math.floor(totalMinutes / 60);
  return `${pad(hour)}:${pad(minute)}:${pad(second)},${String(milliseconds).padStart(3, "0")}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function requireOutputPreset(presetId: VideoTask["selectedOutputPresets"][number]): OutputPreset {
  const preset = OUTPUT_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) {
    throw new Error(`Unknown output preset: ${presetId}`);
  }
  return preset;
}

function absoluteTaskPath(paths: AppPaths, taskId: string, relativePath: string): string {
  return path.join(getTaskDirectory(paths, taskId), ...relativePath.split("/"));
}

function writeTaskFile(
  paths: AppPaths,
  taskId: string,
  relativePath: string,
  content: string | Buffer
): void {
  const absolutePath = absoluteTaskPath(paths, taskId, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function escapeConcatPath(value: string): string {
  return value.replaceAll("\\", "/").replaceAll("'", "'\\''");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeFileName(value: string): string {
  return (
    Array.from(value.trim())
      .map((character) =>
        character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? "-" : character
      )
      .join("")
      .slice(0, 60) || "mixed-cut"
  );
}

function formatTimestamp(value: Date): string {
  const padPart = (input: number) => String(input).padStart(2, "0");
  return [
    value.getFullYear(),
    padPart(value.getMonth() + 1),
    padPart(value.getDate()),
    "-",
    padPart(value.getHours()),
    padPart(value.getMinutes()),
    padPart(value.getSeconds())
  ].join("");
}

function requireFfmpegPath(): string {
  if (!ffmpegStaticPath) {
    throw new Error("未找到内置 FFmpeg，无法生成混剪视频。");
  }
  return ffmpegStaticPath;
}
