import fs from "node:fs";
import path from "node:path";
import {
  OUTPUT_PRESETS,
  type MediaAsset,
  type OutputPreset,
  type VideoTask
} from "../../shared/domain";
import { getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { TaskRepository } from "../storage/taskRepository";
import type { ImageProvider } from "./imageProvider";

const SUPPORTED_PRODUCT_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const SUPPORTED_FONT_EXTENSIONS = new Set([".ttf", ".otf", ".woff", ".woff2"]);
const CUSTOM_FONT_FAMILY = "DHS Custom Font";

export class PresenterImageWorkflowService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly paths: AppPaths,
    private readonly imageProvider: ImageProvider
  ) {}

  importProductImage(taskId: string, sourcePath: string): VideoTask {
    const extension = normalizeImageExtension(path.extname(sourcePath));
    const relativePath = `source/product-image${extension}`;
    const absolutePath = absoluteTaskPath(this.paths, taskId, relativePath);

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.copyFileSync(sourcePath, absolutePath);

    const taskWithAsset = this.taskRepository.addMediaAsset(taskId, "product-image", relativePath);
    const asset = requireAsset(taskWithAsset, "product-image", relativePath);

    return this.taskRepository.updateTask({
      taskId,
      generationMode: "product-avatar",
      avatarMode: "image-presenter",
      productImageAssetId: asset.id,
      generatedPresenterImageAssetId: null
    });
  }

  importReferenceImage(taskId: string, sourcePath: string): VideoTask {
    const extension = normalizeImageExtension(path.extname(sourcePath));
    const relativePath = `source/reference-image${extension}`;
    const absolutePath = absoluteTaskPath(this.paths, taskId, relativePath);

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.copyFileSync(sourcePath, absolutePath);

    const taskWithAsset = this.taskRepository.addMediaAsset(
      taskId,
      "reference-image",
      relativePath
    );
    const asset = requireAsset(taskWithAsset, "reference-image", relativePath);

    return this.taskRepository.updateTask({
      taskId,
      generationMode: "image-lipsync",
      avatarMode: "image-presenter",
      referenceImageAssetId: asset.id,
      generatedPresenterImageAssetId: null
    });
  }

  importCustomFont(taskId: string, sourcePath: string): VideoTask {
    const extension = normalizeFontExtension(path.extname(sourcePath));
    const relativePath = `source/custom-font${extension}`;
    const absolutePath = absoluteTaskPath(this.paths, taskId, relativePath);

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.copyFileSync(sourcePath, absolutePath);

    const taskWithAsset = this.taskRepository.addMediaAsset(taskId, "custom-font", relativePath);
    const asset = requireAsset(taskWithAsset, "custom-font", relativePath);

    return this.taskRepository.updateTask({
      taskId,
      customFontAssetId: asset.id,
      customFontFamily: CUSTOM_FONT_FAMILY,
      subtitleStyle: {
        ...taskWithAsset.subtitleStyle,
        fontFamily: CUSTOM_FONT_FAMILY
      },
      coverStyle: {
        ...taskWithAsset.coverStyle,
        fontFamily: CUSTOM_FONT_FAMILY
      }
    });
  }

  async generatePresenterImages(taskId: string): Promise<VideoTask> {
    const task = this.requireTask(taskId);
    this.taskRepository.updateStepStatus(taskId, "avatar", "running");

    try {
      if (task.avatarMode !== "image-presenter") {
        throw new Error("请先切换到 AI 商品图数字人模式。");
      }

      if (!task.avatarDescriptionPrompt.trim()) {
        throw new Error("请先填写数字人描述提示词。");
      }

      const productAsset = findAssetById(task, task.productImageAssetId);
      if (!productAsset) {
        throw new Error("请先上传商品图片。");
      }

      let latestGeneratedAsset: MediaAsset | undefined;
      for (const presetId of task.selectedOutputPresets) {
        const preset = requireOutputPreset(presetId);
        const currentTask = this.requireTask(taskId);
        const result = await this.imageProvider.generateProductPresenterImage({
          task: currentTask,
          preset,
          productImagePath: absoluteTaskPath(this.paths, taskId, productAsset.relativePath)
        });
        const relativePath = `avatar/generated-presenter-${preset.id}.${result.extension}`;
        const absolutePath = absoluteTaskPath(this.paths, taskId, relativePath);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, result.imageBytes);
        writeTaskFile(
          this.paths,
          taskId,
          `avatar/generated-presenter-${preset.id}-prompt.txt`,
          result.promptPreview
        );
        const taskWithAsset = this.taskRepository.addMediaAsset(
          taskId,
          "generated-presenter-image",
          relativePath
        );
        latestGeneratedAsset = requireAsset(
          taskWithAsset,
          "generated-presenter-image",
          relativePath
        );
      }

      if (latestGeneratedAsset) {
        this.taskRepository.updateTask({
          taskId,
          generatedPresenterImageAssetId: latestGeneratedAsset.id
        });
      }

      return this.taskRepository.updateStepStatus(taskId, "avatar", "waiting");
    } catch (error) {
      return this.taskRepository.updateStepStatus(
        taskId,
        "avatar",
        "retry-ready",
        error instanceof Error ? error.message : "人物商品图生成失败。"
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

function normalizeImageExtension(extension: string): ".png" | ".jpg" | ".jpeg" | ".webp" {
  const normalized = extension.toLowerCase();
  if (!SUPPORTED_PRODUCT_IMAGE_EXTENSIONS.has(normalized)) {
    throw new Error("商品图片仅支持 PNG、JPG、JPEG 或 WEBP。");
  }

  return normalized as ".png" | ".jpg" | ".jpeg" | ".webp";
}

function normalizeFontExtension(extension: string): ".ttf" | ".otf" | ".woff" | ".woff2" {
  const normalized = extension.toLowerCase();
  if (!SUPPORTED_FONT_EXTENSIONS.has(normalized)) {
    throw new Error("字体文件仅支持 TTF、OTF、WOFF 或 WOFF2。");
  }

  return normalized as ".ttf" | ".otf" | ".woff" | ".woff2";
}

function findAssetById(task: VideoTask, assetId: string | undefined): MediaAsset | undefined {
  return assetId ? task.mediaAssets.find((asset) => asset.id === assetId) : undefined;
}

function requireAsset(task: VideoTask, kind: MediaAsset["kind"], relativePath: string): MediaAsset {
  const asset = task.mediaAssets.find(
    (candidate) => candidate.kind === kind && candidate.relativePath === relativePath
  );
  if (!asset) {
    throw new Error(`Media asset ${relativePath} was not saved.`);
  }
  return asset;
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
