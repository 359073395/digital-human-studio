import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import { OUTPUT_PRESETS, type OutputPreset, type VideoTask } from "../../shared/domain";
import { getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { TaskRepository } from "../storage/taskRepository";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export class MixedCutWorkflowService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly paths: AppPaths
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

      const sourceAsset = findMixedCutVisualAsset(task);
      if (!sourceAsset) {
        throw new Error("请先上传至少一个视频或图片素材，再生成混剪视频。");
      }

      if (!task.finalScript.trim()) {
        throw new Error("请先生成或填写混剪视频文案。");
      }

      const sourcePath = absoluteTaskPath(this.paths, taskId, sourceAsset.relativePath);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`混剪素材不存在：${sourceAsset.relativePath}`);
      }

      for (const presetId of task.selectedOutputPresets) {
        const preset = requireOutputPreset(presetId);
        const baseVideoPath = `post/mixed-cut-base-${preset.id}.mp4`;
        const subtitlePath = `subtitles/mixed-cut-subtitles-${preset.id}.srt`;

        renderBaseMixedCutVideo({
          sourcePath,
          outputPath: absoluteTaskPath(this.paths, taskId, baseVideoPath),
          preset
        });
        writeTaskFile(this.paths, taskId, subtitlePath, createTimedTextSrt(task.finalScript));
        this.taskRepository.addMediaAsset(taskId, "mixed-cut-video", baseVideoPath);
        this.taskRepository.addMediaAsset(taskId, "subtitle-file", subtitlePath);
      }

      this.taskRepository.updateStepStatus(taskId, "subtitles", "complete");
      return this.taskRepository.updateStepStatus(taskId, "post-production", "waiting");
    } catch (error) {
      const message = error instanceof Error ? error.message : "混剪视频合成准备失败。";
      this.taskRepository.updateStepStatus(taskId, "subtitles", "retry-ready", message);
      return this.taskRepository.updateStepStatus(
        taskId,
        "post-production",
        "retry-ready",
        message
      );
    }
  }

  private requireTask(taskId: string): VideoTask {
    const task = this.taskRepository.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    return task;
  }
}

function findMixedCutVisualAsset(task: VideoTask): VideoTask["mediaAssets"][number] | undefined {
  return task.mediaAssets.find((asset) => {
    if (asset.kind !== "mixed-cut-material") {
      return false;
    }

    const extension = path.extname(asset.relativePath).toLowerCase();
    return VIDEO_EXTENSIONS.has(extension) || IMAGE_EXTENSIONS.has(extension);
  });
}

function renderBaseMixedCutVideo(input: {
  sourcePath: string;
  outputPath: string;
  preset: OutputPreset;
}): void {
  const ffmpegPath = requireFfmpegPath();
  const extension = path.extname(input.sourcePath).toLowerCase();
  const isImage = IMAGE_EXTENSIONS.has(extension);
  const filter = [
    `scale=${input.preset.width}:${input.preset.height}:force_original_aspect_ratio=decrease`,
    `pad=${input.preset.width}:${input.preset.height}:(ow-iw)/2:(oh-ih)/2`,
    "setsar=1"
  ].join(",");

  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  const args = [
    "-y",
    ...(isImage ? ["-loop", "1", "-t", "12"] : []),
    "-i",
    input.sourcePath,
    ...(isImage ? [] : ["-t", "12"]),
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "21",
    "-pix_fmt",
    "yuv420p",
    ...(isImage ? ["-an"] : ["-map", "0:v:0", "-map", "0:a?", "-c:a", "aac", "-b:a", "128k"]),
    "-movflags",
    "+faststart",
    input.outputPath
  ];

  const result = spawnSync(ffmpegPath, args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 10 * 60 * 1000
  });

  if (result.error) {
    throw new Error(`混剪基础视频生成失败：${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`混剪基础视频生成失败：${(result.stderr || result.stdout || "").slice(-1200)}`);
  }

  if (!fs.existsSync(input.outputPath) || fs.statSync(input.outputPath).size === 0) {
    throw new Error("混剪基础视频生成完成但文件为空。");
  }
}

function createTimedTextSrt(script: string): string {
  const text = script
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
  const chunks = chunkText(text, 36).slice(0, 6);
  const duration = Math.max(2, Math.floor(12 / Math.max(1, chunks.length)));

  return chunks
    .map((chunk, index) => {
      const start = index * duration;
      const end = index === chunks.length - 1 ? 12 : (index + 1) * duration;
      return [String(index + 1), `${formatSrtTime(start)} --> ${formatSrtTime(end)}`, chunk].join(
        "\n"
      );
    })
    .join("\n\n");
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
  content: string
): void {
  const absolutePath = absoluteTaskPath(paths, taskId, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf8");
}

function requireFfmpegPath(): string {
  if (!ffmpegStaticPath) {
    throw new Error("未找到内置 FFmpeg，无法生成混剪视频。");
  }
  return ffmpegStaticPath;
}
