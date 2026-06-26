import fs from "node:fs";
import path from "node:path";
import { OUTPUT_PRESETS, type OutputPreset, type VideoTask } from "../../shared/domain";
import { getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { TaskRepository } from "../storage/taskRepository";
import type { SubtitleFallbackProvider } from "../subtitles/subtitleFallbackProvider";
import type { AvatarProvider, AvatarRenderResult } from "./avatarProvider";

interface SubtitleFallbackWorkItem {
  preset: OutputPreset;
  avatarVideoPath: string;
}

export class AvatarWorkflowService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly paths: AppPaths,
    private readonly avatarProvider: AvatarProvider,
    private readonly subtitleFallbackProvider?: SubtitleFallbackProvider
  ) {}

  async renderHeyGenAvatar(taskId: string): Promise<VideoTask> {
    const task = this.requireTask(taskId);
    this.taskRepository.updateStepStatus(taskId, "avatar", "running");
    const subtitleFallbacks: SubtitleFallbackWorkItem[] = [];

    try {
      for (const presetId of task.selectedOutputPresets) {
        const preset = requireOutputPreset(presetId);
        const currentTask = this.requireTask(taskId);
        this.taskRepository.updateOutputVariant(taskId, preset.id, { status: "rendering" });

        const result = await this.avatarProvider.renderAvatar({
          task: currentTask,
          preset,
          imagePath: findGeneratedPresenterImagePath(this.paths, taskId, currentTask, preset)
        });
        const shouldSaveSubtitles = currentTask.subtitleStyle.enabled;
        const persisted = await this.persistAvatarResult(taskId, preset, result, {
          saveSubtitles: shouldSaveSubtitles
        });
        if (shouldSaveSubtitles && !persisted.subtitleSaved) {
          subtitleFallbacks.push({
            preset,
            avatarVideoPath: persisted.avatarVideoPath
          });
        }
        this.taskRepository.updateOutputVariant(taskId, preset.id, { status: "waiting" });
      }
    } catch (error) {
      this.markSelectedVariantsFailed(taskId);
      return this.taskRepository.updateStepStatus(
        taskId,
        "avatar",
        "retry-ready",
        error instanceof Error ? error.message : "HeyGen 数字人生成失败。"
      );
    }

    this.taskRepository.updateStepStatus(taskId, "avatar", "complete");

    if (subtitleFallbacks.length === 0) {
      return this.taskRepository.updateStepStatus(taskId, "subtitles", "complete");
    }

    return this.createFallbackSubtitles(taskId, subtitleFallbacks);
  }

  private async persistAvatarResult(
    taskId: string,
    preset: OutputPreset,
    result: AvatarRenderResult,
    options: { saveSubtitles: boolean }
  ): Promise<{ avatarVideoPath: string; subtitleSaved: boolean }> {
    const avatarPath = `avatar/avatar-${preset.id}.mp4`;
    const absoluteAvatarPath = absoluteTaskPath(this.paths, taskId, avatarPath);
    await downloadFile(result.videoUrl, absoluteAvatarPath);
    this.taskRepository.addMediaAsset(taskId, "avatar-video", avatarPath);

    if (result.thumbnailUrl) {
      const coverPath = `post/video-frame-cover-${preset.id}${thumbnailExtensionFromUrl(
        result.thumbnailUrl
      )}`;
      try {
        await downloadFile(result.thumbnailUrl, absoluteTaskPath(this.paths, taskId, coverPath));
        this.taskRepository.addMediaAsset(taskId, "cover-image", coverPath);
        this.taskRepository.updateOutputVariant(taskId, preset.id, { coverImagePath: coverPath });
      } catch {
        // Thumbnail download is a best-effort default cover; video generation can still continue.
      }
    }

    if (options.saveSubtitles && result.captionUrl) {
      const captionPath = `subtitles/provider-subtitles-${preset.id}.srt`;
      try {
        await downloadFile(result.captionUrl, absoluteTaskPath(this.paths, taskId, captionPath));
        this.taskRepository.addMediaAsset(taskId, "subtitle-file", captionPath);
        return { avatarVideoPath: absoluteAvatarPath, subtitleSaved: true };
      } catch {
        return { avatarVideoPath: absoluteAvatarPath, subtitleSaved: false };
      }
    }

    return { avatarVideoPath: absoluteAvatarPath, subtitleSaved: false };
  }

  private async createFallbackSubtitles(
    taskId: string,
    fallbackItems: SubtitleFallbackWorkItem[]
  ): Promise<VideoTask> {
    this.taskRepository.updateStepStatus(taskId, "subtitles", "running");

    try {
      if (!this.subtitleFallbackProvider) {
        throw new Error("HeyGen 未返回字幕，ASR 兜底尚未接入。");
      }

      for (const item of fallbackItems) {
        const currentTask = this.requireTask(taskId);
        const result = await this.subtitleFallbackProvider.createSubtitleFile({
          task: currentTask,
          preset: item.preset,
          avatarVideoPath: item.avatarVideoPath
        });
        const captionPath = `subtitles/asr-subtitles-${item.preset.id}.srt`;
        writeTaskFile(this.paths, taskId, captionPath, result.srt);
        this.taskRepository.addMediaAsset(taskId, "subtitle-file", captionPath);
      }

      return this.taskRepository.updateStepStatus(taskId, "subtitles", "complete");
    } catch (error) {
      return this.taskRepository.updateStepStatus(
        taskId,
        "subtitles",
        "retry-ready",
        error instanceof Error ? error.message : "ASR 字幕兜底失败。"
      );
    }
  }

  private markSelectedVariantsFailed(taskId: string): void {
    const task = this.requireTask(taskId);
    for (const presetId of task.selectedOutputPresets) {
      this.taskRepository.updateOutputVariant(taskId, presetId, { status: "failed" });
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

async function downloadFile(url: string, absolutePath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`文件下载失败 (${response.status})。`);
  }

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, Buffer.from(await response.arrayBuffer()));
}

function thumbnailExtensionFromUrl(url: string): string {
  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
      return extension;
    }
  } catch {
    // Fall through to the safest common thumbnail extension.
  }

  return ".jpg";
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

function requireOutputPreset(presetId: VideoTask["selectedOutputPresets"][number]): OutputPreset {
  const preset = OUTPUT_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) {
    throw new Error(`Unknown output preset: ${presetId}`);
  }

  return preset;
}

function findGeneratedPresenterImagePath(
  paths: AppPaths,
  taskId: string,
  task: VideoTask,
  preset: OutputPreset
): string | undefined {
  if (task.avatarMode !== "image-presenter") {
    return undefined;
  }

  if (task.generationMode === "image-lipsync") {
    const referenceAsset = task.referenceImageAssetId
      ? task.mediaAssets.find((asset) => asset.id === task.referenceImageAssetId)
      : task.mediaAssets.find((asset) => asset.kind === "reference-image");

    if (!referenceAsset) {
      throw new Error("请先上传人物图片。");
    }

    return absoluteTaskPath(paths, taskId, referenceAsset.relativePath);
  }

  const matchingAsset =
    (task.generatedPresenterImageSelections?.[preset.id]
      ? task.mediaAssets.find(
          (asset) =>
            asset.id === task.generatedPresenterImageSelections?.[preset.id] &&
            asset.kind === "generated-presenter-image"
        )
      : undefined) ??
    task.mediaAssets.find(
      (asset) =>
        asset.kind === "generated-presenter-image" &&
        asset.relativePath.includes(`generated-presenter-${preset.id}.`)
    ) ??
    task.mediaAssets.find((asset) => asset.id === task.generatedPresenterImageAssetId);

  if (!matchingAsset) {
    throw new Error("请先生成人物商品图。");
  }

  return absoluteTaskPath(paths, taskId, matchingAsset.relativePath);
}
