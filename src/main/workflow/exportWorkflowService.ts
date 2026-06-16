import fs from "node:fs";
import path from "node:path";
import {
  OUTPUT_PRESETS,
  type OutputPreset,
  type OutputPresetId,
  type PublishingPackage,
  type VideoTask
} from "../../shared/domain";
import { getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { TaskRepository } from "../storage/taskRepository";

export class ExportWorkflowService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly paths: AppPaths
  ) {}

  exportTask(taskId: string): VideoTask {
    this.taskRepository.updateStepStatus(taskId, "post-production", "running");

    try {
      const task = this.requireTask(taskId);
      const publishingPackage = createPublishingPackage(task);

      for (const presetId of task.selectedOutputPresets) {
        const preset = requireOutputPreset(presetId);
        this.taskRepository.updateOutputVariant(taskId, preset.id, { status: "rendering" });
        const avatarVideoPath = requireAvatarVideoPath(
          this.paths,
          taskId,
          this.requireTask(taskId),
          preset
        );
        const relativePath = `exports/${preset.id}/finished-${preset.id}.mp4`;
        const absolutePath = absoluteTaskPath(this.paths, taskId, relativePath);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.copyFileSync(avatarVideoPath, absolutePath);
        this.taskRepository.addMediaAsset(taskId, "finished-video", relativePath);
        this.taskRepository.updateOutputVariant(taskId, preset.id, {
          status: "complete",
          finishedVideoPath: relativePath
        });
      }

      this.taskRepository.updateStepStatus(taskId, "post-production", "complete");
      this.taskRepository.updateStepStatus(taskId, "export", "running");

      const manifestPath = "exports/publishing-package/manifest.json";
      writeTaskFile(
        this.paths,
        taskId,
        manifestPath,
        JSON.stringify(
          createPublishingManifest(this.requireTask(taskId), publishingPackage),
          null,
          2
        )
      );
      this.taskRepository.addMediaAsset(taskId, "publishing-package", manifestPath);
      this.taskRepository.updatePublishingPackage(taskId, {
        ...publishingPackage,
        exportDirectory: "exports/publishing-package"
      });

      return this.taskRepository.updateStepStatus(taskId, "export", "complete");
    } catch (error) {
      this.markSelectedVariantsFailed(taskId);
      this.taskRepository.updateStepStatus(
        taskId,
        "post-production",
        "retry-ready",
        error instanceof Error ? error.message : "成片导出失败。"
      );
      return this.taskRepository.updateStepStatus(
        taskId,
        "export",
        "retry-ready",
        error instanceof Error ? error.message : "成片导出失败。"
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

function requireAvatarVideoPath(
  paths: AppPaths,
  taskId: string,
  task: VideoTask,
  preset: OutputPreset
): string {
  const matchingAsset = task.mediaAssets.find(
    (asset) =>
      asset.kind === "avatar-video" && asset.relativePath === `avatar/avatar-${preset.id}.mp4`
  );
  if (!matchingAsset) {
    throw new Error(`请先生成 ${preset.label} 的 HeyGen 数字人视频。`);
  }

  const absolutePath = absoluteTaskPath(paths, taskId, matchingAsset.relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`数字人视频文件不存在：${matchingAsset.relativePath}`);
  }

  const header = fs.readFileSync(absolutePath).subarray(0, 32).toString("utf8");
  if (header.startsWith("Digital Human Studio mock")) {
    throw new Error("当前数字人视频仍是 Mock 占位文件，请先生成 HeyGen 数字人视频。");
  }

  return absolutePath;
}

function createPublishingPackage(task: VideoTask): PublishingPackage {
  if (task.contentLanguage === "id-ID") {
    return {
      title: createPublishingTitle(task),
      description: "Video final dari alur API Digital Human Studio.",
      tags: ["digitalhuman", "videopendek", "tiktokshop"],
      notes: "Final video berasal dari output digital human API, bukan mock placeholder."
    };
  }

  if (task.contentLanguage === "en-US") {
    return {
      title: createPublishingTitle(task),
      description: "Final video exported from the Digital Human Studio API workflow.",
      tags: ["digitalhuman", "shortvideo", "creator"],
      notes: "The final video is copied from the real avatar render output, not a mock placeholder."
    };
  }

  return {
    title: createPublishingTitle(task),
    description: "由 Digital Human Studio API 全流程导出的最终视频。",
    tags: ["数字人口播", "短视频", "带货"],
    notes: "最终视频来自真实数字人渲染结果，不是 Mock 占位文件。"
  };
}

function createPublishingTitle(task: VideoTask): string {
  const base =
    (task.finalScript || task.sourceScript || task.title).split(/\r?\n/)[0] ?? task.title;
  return base.length > 48 ? `${base.slice(0, 48)}...` : base;
}

function createPublishingManifest(task: VideoTask, publishingPackage: PublishingPackage) {
  return {
    generatedBy: "Digital Human Studio API workflow",
    generatedAt: new Date().toISOString(),
    task: {
      id: task.id,
      title: task.title,
      contentLanguage: task.contentLanguage,
      selectedOutputPresets: task.selectedOutputPresets
    },
    publishingPackage,
    outputVariants: task.outputVariants,
    mediaAssets: task.mediaAssets
  };
}

function requireOutputPreset(presetId: OutputPresetId): OutputPreset {
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
