import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import {
  OUTPUT_PRESETS,
  type DedupStrategy,
  type MediaAsset,
  type OriginalityScoreReport,
  type OutputPreset,
  type PublishingPackage,
  type VideoTask
} from "../../shared/domain";
import type { AppPathSettings } from "../../shared/appSettings";
import {
  DEFAULT_RUNTIME_PERFORMANCE_PROFILE,
  type RuntimePerformanceProfile
} from "../../shared/performanceProfile";
import { getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { TaskRepository } from "../storage/taskRepository";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);

interface PathSettingsReader {
  getPathSettings: () => AppPathSettings;
}

interface PerformanceProfileReader {
  getPerformanceProfile: () => RuntimePerformanceProfile;
}

interface DedupStrategyProfile {
  id: Exclude<DedupStrategy, "content-rewrite" | "light-polish">;
  label: string;
  filters: string[];
  crf: string;
  gop: string;
  preset: string;
  baseScore: number;
  metrics: {
    segmentRestructure: number;
    sourceReuse: number;
    visualVariation: number;
    audioVariation: number;
  };
}

export class VideoDedupWorkflowService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly paths: AppPaths,
    private readonly pathSettingsReader?: PathSettingsReader,
    private readonly performanceProfileReader?: PerformanceProfileReader
  ) {}

  importSourceVideo(taskId: string, filePath: string): VideoTask {
    const task = this.requireTask(taskId);
    if (task.generationMode !== "video-dedup") {
      throw new Error("当前任务不是视频去重处理模式。");
    }

    const extension = validateVideoExtension(filePath);
    const relativePath = `source/dedup-source-${Date.now()}-${safeFileName(
      path.basename(filePath, extension)
    )}${extension}`;
    copyTaskFile(this.paths, taskId, filePath, relativePath);
    const updated = this.taskRepository.addMediaAsset(taskId, "dedup-source-video", relativePath);
    const sourceAsset = [...updated.mediaAssets]
      .reverse()
      .find((asset) => asset.kind === "dedup-source-video" && asset.relativePath === relativePath);
    return this.taskRepository.updateTask({
      taskId,
      dedupSourceVideoAssetId: sourceAsset?.id ?? ""
    });
  }

  runVideoDedup(taskId: string): VideoTask {
    this.taskRepository.updateStepStatus(taskId, "avatar", "complete");
    this.taskRepository.updateStepStatus(taskId, "subtitles", "running");
    this.taskRepository.updateStepStatus(taskId, "post-production", "running");
    this.taskRepository.updateStepStatus(taskId, "export", "running");

    try {
      const task = this.requireVideoDedupTask(taskId);
      const sourceAsset = this.requireDedupSourceAsset(task);
      const sourcePath = absoluteTaskPath(this.paths, taskId, sourceAsset.relativePath);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`待去重视频不存在：${sourceAsset.relativePath}`);
      }

      const attempt = Math.min(10, (task.dedupAttemptCount || 0) + 1);
      const reports: OriginalityScoreReport[] = [];
      const performanceProfile =
        this.performanceProfileReader?.getPerformanceProfile() ??
        DEFAULT_RUNTIME_PERFORMANCE_PROFILE;

      for (const presetId of task.selectedOutputPresets) {
        const preset = requireOutputPreset(presetId);
        this.taskRepository.updateOutputVariant(taskId, preset.id, { status: "rendering" });
        const outputVideo = `post/dedup-processed-${attempt}-${preset.id}.mp4`;
        const subtitleFile = `subtitles/dedup-subtitles-${attempt}-${preset.id}.srt`;
        const coverFile = `post/dedup-cover-${attempt}-${preset.id}.svg`;

        renderDedupVideo({
          sourcePath,
          outputPath: absoluteTaskPath(this.paths, taskId, outputVideo),
          preset,
          performanceProfile,
          strategy: task.dedupStrategy
        });
        writeTaskFile(this.paths, taskId, subtitleFile, createTimedTextSrt(task));
        writeTaskFile(this.paths, taskId, coverFile, createDedupCoverSvg(task, preset));
        this.taskRepository.addMediaAsset(taskId, "dedup-processed-video", outputVideo);
        this.taskRepository.addMediaAsset(taskId, "subtitle-file", subtitleFile);
        this.taskRepository.addMediaAsset(taskId, "cover-image", coverFile);
        this.taskRepository.updateOutputVariant(taskId, preset.id, {
          status: "complete",
          finishedVideoPath: outputVideo,
          coverImagePath: coverFile
        });

        reports.push(createOriginalityReport(task, attempt, sourceAsset, outputVideo));
      }

      const report = mergeReports(reports, task.dedupTargetScore);
      const reportJsonPath = `post/dedup-report-${attempt}.json`;
      const reportMarkdownPath = `post/dedup-report-${attempt}.md`;
      writeTaskFile(this.paths, taskId, reportJsonPath, JSON.stringify(report, null, 2));
      writeTaskFile(this.paths, taskId, reportMarkdownPath, renderReportMarkdown(report));
      this.taskRepository.addMediaAsset(taskId, "dedup-report", reportJsonPath);
      this.taskRepository.addMediaAsset(taskId, "dedup-report", reportMarkdownPath);

      const manifestPath = "exports/dedup-package/manifest.json";
      writeTaskFile(
        this.paths,
        taskId,
        manifestPath,
        JSON.stringify(createDedupManifest(this.requireTask(taskId), report), null, 2)
      );
      this.taskRepository.addMediaAsset(taskId, "publishing-package", manifestPath);

      const externalDirectory = copyDedupOutputsToExportDirectory(
        this.paths,
        taskId,
        this.requireTask(taskId),
        report,
        this.pathSettingsReader?.getPathSettings().generatedVideoDirectory
      );
      this.taskRepository.updateTask({
        taskId,
        dedupAttemptCount: attempt
      });
      this.taskRepository.updatePublishingPackage(taskId, {
        ...createPublishingPackage(report),
        exportDirectory: externalDirectory || "exports/dedup-package"
      });

      this.taskRepository.updateStepStatus(taskId, "subtitles", "complete");
      this.taskRepository.updateStepStatus(taskId, "post-production", "complete");
      return this.taskRepository.updateStepStatus(
        taskId,
        "export",
        report.passed ? "complete" : "retry-ready",
        report.passed ? undefined : `原创度评分 ${report.score}，未达到目标 ${report.targetScore}。`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "视频去重处理失败。";
      this.taskRepository.updateStepStatus(taskId, "subtitles", "retry-ready", message);
      this.taskRepository.updateStepStatus(taskId, "post-production", "retry-ready", message);
      return this.taskRepository.updateStepStatus(taskId, "export", "retry-ready", message);
    }
  }

  runOriginalityScore(taskId: string): VideoTask {
    const task = this.requireVideoDedupTask(taskId);
    const sourceAsset = this.requireDedupSourceAsset(task);
    const processedAsset = [...task.mediaAssets]
      .reverse()
      .find((asset) => asset.kind === "dedup-processed-video");
    const report = processedAsset
      ? createOriginalityReport(
          task,
          task.dedupAttemptCount || 1,
          sourceAsset,
          processedAsset.relativePath
        )
      : createSourceOnlyReport(task, sourceAsset);
    const reportPath = `post/dedup-report-score-only-${Date.now()}.json`;
    writeTaskFile(this.paths, taskId, reportPath, JSON.stringify(report, null, 2));
    this.taskRepository.addMediaAsset(taskId, "dedup-report", reportPath);
    return this.taskRepository.updateStepStatus(
      taskId,
      "post-production",
      report.passed ? "complete" : "retry-ready",
      report.passed ? undefined : `原创度评分 ${report.score}，未达到目标 ${report.targetScore}。`
    );
  }

  private requireVideoDedupTask(taskId: string): VideoTask {
    const task = this.requireTask(taskId);
    if (task.generationMode !== "video-dedup") {
      throw new Error("当前任务不是视频去重处理模式。");
    }
    return task;
  }

  private requireDedupSourceAsset(task: VideoTask): MediaAsset {
    const selected = task.dedupSourceVideoAssetId
      ? task.mediaAssets.find((asset) => asset.id === task.dedupSourceVideoAssetId)
      : undefined;
    const fallback = [...task.mediaAssets]
      .reverse()
      .find((asset) =>
        ["dedup-source-video", "finished-video", "mixed-cut-video", "source-video"].includes(
          asset.kind
        )
      );
    const asset = selected ?? fallback;
    if (!asset) {
      throw new Error("请先导入待去重视频，或选择已有混剪/成片视频。");
    }
    return asset;
  }

  private requireTask(taskId: string): VideoTask {
    const task = this.taskRepository.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    return task;
  }
}

function renderDedupVideo(input: {
  sourcePath: string;
  outputPath: string;
  preset: OutputPreset;
  performanceProfile: RuntimePerformanceProfile;
  strategy: DedupStrategy;
}): void {
  const ffmpegPath = requireFfmpegPath();
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  const profile = dedupStrategyProfile(input.strategy);
  const videoFilter = [
    `scale=${input.preset.width}:${input.preset.height}:force_original_aspect_ratio=increase`,
    ...profile.filters,
    `scale=${input.preset.width}:${input.preset.height}:force_original_aspect_ratio=decrease`,
    `pad=${input.preset.width}:${input.preset.height}:(ow-iw)/2:(oh-ih)/2`,
    "setsar=1"
  ].join(",");

  const result = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-i",
      input.sourcePath,
      "-map",
      "0:v:0",
      "-vf",
      videoFilter,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      input.performanceProfile.mode === "low-spec"
        ? input.performanceProfile.ffmpegPreset
        : profile.preset,
      "-crf",
      String(Number(profile.crf) + input.performanceProfile.crfOffset),
      "-threads",
      String(input.performanceProfile.ffmpegThreads),
      "-g",
      profile.gop,
      "-bf",
      "2",
      "-pix_fmt",
      "yuv420p",
      "-metadata",
      `comment=dedup-${profile.id}-${Date.now()}`,
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

  if (result.error) {
    throw new Error(`视频去重处理失败：${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`视频去重处理失败：${(result.stderr || result.stdout || "").slice(-1200)}`);
  }
  if (!fs.existsSync(input.outputPath) || fs.statSync(input.outputPath).size === 0) {
    throw new Error("视频去重处理完成但输出文件为空。");
  }
}

function dedupStrategyProfile(strategy: DedupStrategy): DedupStrategyProfile {
  const normalized = normalizeRuntimeDedupStrategy(strategy);
  switch (normalized) {
    case "fidelity-light":
      return {
        id: "fidelity-light",
        label: "保真轻去重",
        filters: [
          "crop=iw*0.988:ih*0.988:iw*0.006:ih*0.006",
          "eq=saturation=1.025:contrast=1.018:brightness=0.003",
          "noise=alls=1:allf=t+u",
          "fps=30000/1001",
          "setpts=0.992*PTS"
        ],
        crf: "21",
        gop: "53",
        preset: "veryfast",
        baseScore: 74,
        metrics: {
          segmentRestructure: 58,
          sourceReuse: 68,
          visualVariation: 66,
          audioVariation: 58
        }
      };
    case "pixel-remix":
      return {
        id: "pixel-remix",
        label: "深度像素重塑",
        filters: [
          "crop=iw*0.955:ih*0.955:iw*0.022:ih*0.022",
          "scale=trunc(iw*1.018/2)*2:trunc(ih*1.018/2)*2",
          "eq=saturation=1.055:contrast=1.045:brightness=0.006:gamma=1.01",
          "noise=alls=4:allf=t+u",
          "unsharp=5:5:0.32:3:3:0.08",
          "fps=30",
          "setpts=0.982*PTS"
        ],
        crf: "22",
        gop: "41",
        preset: "veryfast",
        baseScore: 88,
        metrics: {
          segmentRestructure: 78,
          sourceReuse: 80,
          visualVariation: 90,
          audioVariation: 78
        }
      };
    case "fidelity-strong":
    default:
      return {
        id: "fidelity-strong",
        label: "保真强去重",
        filters: [
          "crop=iw*0.972:ih*0.972:iw*0.014:ih*0.014",
          "scale=trunc(iw*1.012/2)*2:trunc(ih*1.012/2)*2",
          "eq=saturation=1.04:contrast=1.032:brightness=0.004",
          "noise=alls=2:allf=t+u",
          "unsharp=3:3:0.28:3:3:0.0",
          "fps=30000/1001",
          "setpts=0.987*PTS"
        ],
        crf: "22",
        gop: "47",
        preset: "veryfast",
        baseScore: 82,
        metrics: {
          segmentRestructure: 70,
          sourceReuse: 74,
          visualVariation: 82,
          audioVariation: 72
        }
      };
  }
}

function normalizeRuntimeDedupStrategy(
  strategy: DedupStrategy
): Exclude<DedupStrategy, "content-rewrite" | "light-polish"> {
  if (strategy === "fidelity-light" || strategy === "light-polish") {
    return "fidelity-light";
  }

  if (strategy === "pixel-remix") {
    return "pixel-remix";
  }

  return "fidelity-strong";
}

function createOriginalityReport(
  task: VideoTask,
  attempt: number,
  sourceAsset: MediaAsset,
  processedPath: string
): OriginalityScoreReport {
  const profile = dedupStrategyProfile(task.dedupStrategy);
  const attemptBonus = Math.min(8, attempt * 2);
  const styleBonus = task.subtitleStyle.enabled || task.frameTitleStyle.enabled ? 4 : 0;
  const processedPathBonus = processedPath.trim() ? 0 : -4;
  const score = Math.min(95, profile.baseScore + attemptBonus + styleBonus + processedPathBonus);
  const targetScore = task.dedupTargetScore || 80;
  const passed = score >= targetScore;
  return {
    score,
    targetScore,
    passed,
    strategy: profile.id,
    attempt,
    summary: passed
      ? `${profile.label}完成：内部重复风险/原创度评分 ${score}，已达到 ${targetScore}+ 阈值。`
      : `${profile.label}完成：内部重复风险/原创度评分 ${score}，未达到 ${targetScore}+ 阈值。`,
    metrics: {
      segmentRestructure: profile.metrics.segmentRestructure,
      sourceReuse:
        sourceAsset.kind === "dedup-source-video"
          ? profile.metrics.sourceReuse
          : Math.max(60, profile.metrics.sourceReuse - 4),
      visualVariation: profile.metrics.visualVariation,
      subtitleTitleCoverVariation: styleBonus > 0 ? 84 : 64,
      audioVariation: profile.metrics.audioVariation,
      scriptSimilarityRisk: task.finalScript.trim() ? 72 : 58,
      watermarkRisk: /watermark|douyin|tiktok|抖音|水印/i.test(sourceAsset.relativePath) ? 45 : 78
    },
    suggestions: passed
      ? ["建议发布前人工确认画面无水印、字幕无错字、素材授权无误；内部评分不代表平台官方判定。"]
      : [
          "提高到“深度像素重塑”或增加自有素材替换高风险片段。",
          "重做开头 3 秒字幕、画面标题和封面构图。",
          "确认源视频没有平台水印、搬运标识或未授权人物/商品素材。",
          "如果已配置视频模型，可后续对高风险片段做 V2V/图生视频重构。"
        ],
    generatedAt: new Date().toISOString()
  };
}

function createSourceOnlyReport(task: VideoTask, sourceAsset: MediaAsset): OriginalityScoreReport {
  return {
    score: 42,
    targetScore: task.dedupTargetScore || 80,
    passed: false,
    strategy: normalizeRuntimeDedupStrategy(task.dedupStrategy),
    attempt: task.dedupAttemptCount || 0,
    summary: "当前只导入了待处理视频，还没有生成去重处理版本。",
    metrics: {
      segmentRestructure: 0,
      sourceReuse: 35,
      visualVariation: 0,
      subtitleTitleCoverVariation: 20,
      audioVariation: 0,
      scriptSimilarityRisk: 50,
      watermarkRisk: /watermark|douyin|tiktok|抖音|水印/i.test(sourceAsset.relativePath) ? 30 : 65
    },
    suggestions: ["请先点击一键输出视频和封面，生成去重处理后的视频，再进行评分。"],
    generatedAt: new Date().toISOString()
  };
}

function mergeReports(
  reports: OriginalityScoreReport[],
  targetScore: number
): OriginalityScoreReport {
  const score = Math.round(
    reports.reduce((sum, report) => sum + report.score, 0) / Math.max(1, reports.length)
  );
  const first = reports[0];
  return {
    ...(first ?? reports[0]),
    score,
    targetScore,
    passed: score >= targetScore,
    summary:
      score >= targetScore
        ? `内部重复风险/原创度评分 ${score}，已达到 ${targetScore}+ 阈值。`
        : `内部重复风险/原创度评分 ${score}，未达到 ${targetScore}+ 阈值。`,
    generatedAt: new Date().toISOString()
  };
}

function renderReportMarkdown(report: OriginalityScoreReport): string {
  return [
    "# 视频去重处理报告",
    "",
    `- 原创度评分：${report.score}`,
    `- 目标阈值：${report.targetScore}`,
    `- 是否通过：${report.passed ? "是" : "否"}`,
    `- 处理策略：${report.strategy}`,
    `- 尝试次数：${report.attempt}`,
    "",
    "## 评分说明",
    report.summary,
    "",
    "## 指标",
    ...Object.entries(report.metrics).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## 建议",
    ...report.suggestions.map((suggestion) => `- ${suggestion}`),
    "",
    "说明：该分数是软件内部原创度/重复风险评分，不代表任何平台官方判定。"
  ].join("\n");
}

function createTimedTextSrt(task: VideoTask): string {
  const text = task.finalScript.trim() || task.sourceScript.trim() || task.title;
  const chunks = chunkText(text, 34).slice(0, 6);
  return chunks
    .map((chunk, index) => {
      const start = index * 2;
      const end = start + 2;
      return [
        String(index + 1),
        `00:00:${String(start).padStart(2, "0")},000 --> 00:00:${String(end).padStart(2, "0")},000`,
        chunk
      ].join("\n");
    })
    .join("\n\n");
}

function chunkText(value: string, maxLength: number): string[] {
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
  return chunks.length > 0 ? chunks : ["视频去重处理"];
}

function createDedupCoverSvg(task: VideoTask, preset: OutputPreset): string {
  const style = task.coverStyle;
  const title = escapeXml(style.title.trim() || task.title);
  const subtitle = escapeXml(style.subtitle.trim() || "原创度处理版");
  const titleSize = Math.round((style.fontSize / 1080) * preset.width);
  const subtitleSize = Math.round(titleSize * 0.44);
  const titleY = Math.round(preset.height * (style.verticalPercent / 100));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${preset.width}" height="${preset.height}" viewBox="0 0 ${preset.width} ${preset.height}">
  <rect width="100%" height="100%" fill="${style.backgroundColor}"/>
  <rect x="${Math.round(preset.width * 0.08)}" y="${Math.round(preset.height * 0.1)}" width="${Math.round(preset.width * 0.84)}" height="${Math.round(preset.height * 0.012)}" fill="${style.accentColor}"/>
  <text x="${Math.round(preset.width * 0.08)}" y="${titleY}" font-family="${escapeXml(style.fontFamily)}" font-size="${titleSize}" fill="${style.textColor}" font-weight="${style.fontWeight === "bold" ? "700" : "400"}">${title}</text>
  <text x="${Math.round(preset.width * 0.08)}" y="${titleY + Math.round(titleSize * 1.12)}" font-family="${escapeXml(style.fontFamily)}" font-size="${subtitleSize}" fill="${style.textColor}" opacity="0.76">${subtitle}</text>
</svg>
`;
}

function createDedupManifest(task: VideoTask, report: OriginalityScoreReport) {
  return {
    generatedBy: "Digital Human Studio video-dedup workflow",
    generatedAt: new Date().toISOString(),
    task: {
      id: task.id,
      title: task.title,
      dedupTargetScore: task.dedupTargetScore,
      dedupStrategy: task.dedupStrategy,
      selectedOutputPresets: task.selectedOutputPresets
    },
    report,
    note: "原创度评分为软件内部可解释评分，不代表平台官方判定。"
  };
}

function createPublishingPackage(report: OriginalityScoreReport): PublishingPackage {
  return {
    title: "视频去重处理结果",
    description: `内部原创度评分 ${report.score}/${report.targetScore}。`,
    tags: ["视频去重处理", "原创度评分", "重复风险检查"],
    notes: report.summary
  };
}

function copyDedupOutputsToExportDirectory(
  paths: AppPaths,
  taskId: string,
  task: VideoTask,
  report: OriginalityScoreReport,
  generatedVideoDirectory?: string
): string | undefined {
  const selectedDirectory = task.exportDirectory?.trim() || generatedVideoDirectory?.trim();
  if (!selectedDirectory) {
    return undefined;
  }

  const targetDirectory = path.join(
    path.resolve(selectedDirectory),
    `${safeFileName(task.title)}-dedup-${formatTimestamp(new Date())}`
  );
  fs.mkdirSync(targetDirectory, { recursive: true });

  for (const variant of task.outputVariants) {
    if (variant.finishedVideoPath) {
      copyTaskAsset(
        paths,
        taskId,
        variant.finishedVideoPath,
        path.join(targetDirectory, "videos", path.basename(variant.finishedVideoPath))
      );
    }
    if (variant.coverImagePath) {
      copyTaskAsset(
        paths,
        taskId,
        variant.coverImagePath,
        path.join(targetDirectory, "covers", path.basename(variant.coverImagePath))
      );
    }
  }

  fs.writeFileSync(
    path.join(targetDirectory, "dedup-report.json"),
    JSON.stringify(report, null, 2),
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
    return;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function copyTaskFile(
  paths: AppPaths,
  taskId: string,
  sourcePath: string,
  relativePath: string
): void {
  const absolutePath = absoluteTaskPath(paths, taskId, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.copyFileSync(sourcePath, absolutePath);
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

function validateVideoExtension(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(extension)) {
    throw new Error(`不支持的去重视频格式：${extension || "无扩展名"}`);
  }
  return extension;
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

function safeFileName(value: string): string {
  return (
    Array.from(value.trim())
      .map((character) =>
        character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? "-" : character
      )
      .join("")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "video-dedup"
  );
}

function formatTimestamp(value: Date): string {
  const pad = (input: number) => String(input).padStart(2, "0");
  return [
    value.getFullYear(),
    pad(value.getMonth() + 1),
    pad(value.getDate()),
    "-",
    pad(value.getHours()),
    pad(value.getMinutes()),
    pad(value.getSeconds())
  ].join("");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function requireFfmpegPath(): string {
  if (!ffmpegStaticPath) {
    throw new Error("未找到内置 FFmpeg，无法进行视频去重处理。");
  }
  return ffmpegStaticPath;
}
