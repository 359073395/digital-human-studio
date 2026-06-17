import fs from "node:fs";
import path from "node:path";
import {
  OUTPUT_PRESETS,
  type CoverStyle,
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

        const coverPath = `post/cover-${preset.id}.svg`;
        writeTaskFile(
          this.paths,
          taskId,
          coverPath,
          createCoverSvg(task, preset, findDefaultCoverFramePath(this.paths, taskId, task, preset))
        );
        this.taskRepository.addMediaAsset(taskId, "cover-image", coverPath);
        this.taskRepository.updateOutputVariant(taskId, preset.id, {
          status: "complete",
          finishedVideoPath: relativePath,
          coverImagePath: coverPath
        });
      }

      this.taskRepository.updateStepStatus(taskId, "post-production", "complete");
      this.taskRepository.updateStepStatus(taskId, "export", "running");

      const internalExportDirectory = "exports/publishing-package";
      const internalPublishingPackage = {
        ...publishingPackage,
        exportDirectory: internalExportDirectory
      };
      const manifestPath = `${internalExportDirectory}/manifest.json`;
      writeTaskFile(
        this.paths,
        taskId,
        manifestPath,
        JSON.stringify(
          createPublishingManifest(this.requireTask(taskId), internalPublishingPackage),
          null,
          2
        )
      );
      this.taskRepository.addMediaAsset(taskId, "publishing-package", manifestPath);
      this.taskRepository.updatePublishingPackage(taskId, internalPublishingPackage);

      const externalExportDirectory = copyToSelectedExportDirectory(
        this.paths,
        taskId,
        this.requireTask(taskId),
        publishingPackage
      );
      if (externalExportDirectory) {
        this.taskRepository.updatePublishingPackage(taskId, {
          ...publishingPackage,
          exportDirectory: externalExportDirectory
        });
      }

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
    subtitleStyle: task.subtitleStyle,
    frameTitleStyle: task.frameTitleStyle,
    coverStyle: task.coverStyle,
    publishingPackage,
    outputVariants: task.outputVariants,
    mediaAssets: task.mediaAssets
  };
}

function copyToSelectedExportDirectory(
  paths: AppPaths,
  taskId: string,
  task: VideoTask,
  publishingPackage: PublishingPackage
): string | undefined {
  const selectedDirectory = task.exportDirectory?.trim();
  if (!selectedDirectory) {
    return undefined;
  }

  const targetDirectory = path.join(
    path.resolve(selectedDirectory),
    `${safeFileName(task.title)}-${formatTimestamp(new Date())}`
  );
  fs.mkdirSync(targetDirectory, { recursive: true });

  for (const variant of task.outputVariants) {
    if (!task.selectedOutputPresets.includes(variant.presetId)) {
      continue;
    }

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

  const copiedSubtitlePaths = new Set<string>();
  for (const asset of task.mediaAssets) {
    if (asset.kind !== "subtitle-file" || copiedSubtitlePaths.has(asset.relativePath)) {
      continue;
    }

    copiedSubtitlePaths.add(asset.relativePath);
    copyTaskAsset(
      paths,
      taskId,
      asset.relativePath,
      path.join(targetDirectory, "subtitles", path.basename(asset.relativePath))
    );
  }

  fs.writeFileSync(
    path.join(targetDirectory, "manifest.json"),
    JSON.stringify(
      createPublishingManifest(task, {
        ...publishingPackage,
        exportDirectory: targetDirectory
      }),
      null,
      2
    ),
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

function safeFileName(value: string): string {
  const invalidCharacters = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);
  const normalized = Array.from(value.trim())
    .map((character) =>
      invalidCharacters.has(character) || character.charCodeAt(0) < 32 ? "-" : character
    )
    .join("");
  return (normalized || "video-task").slice(0, 60);
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

function createCoverSvg(
  task: VideoTask,
  preset: OutputPreset,
  backgroundImagePath?: string
): string {
  const style = task.coverStyle;
  const title = escapeXml(style.title.trim() || createPublishingTitle(task));
  const subtitle = escapeXml(style.subtitle.trim());
  const titleSize = Math.round((style.fontSize / 1080) * preset.width);
  const subtitleSize = Math.round(titleSize * 0.42);
  const fontWeight = fontWeightValue(style);
  const titleY = Math.round(preset.height * (style.verticalPercent / 100));
  const subtitleY = titleY + Math.round(titleSize * 1.15);
  const underlineY = subtitleY + Math.round(subtitleSize * 1.8);
  const background = createCoverBackgroundMarkup(style, preset, backgroundImagePath);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${preset.width}" height="${preset.height}" viewBox="0 0 ${preset.width} ${preset.height}">
${background}
  <rect x="${Math.round(preset.width * 0.08)}" y="${Math.round(preset.height * 0.1)}" width="${Math.round(preset.width * 0.84)}" height="${Math.round(preset.height * 0.012)}" fill="${style.accentColor}"/>
  <text x="${Math.round(preset.width * 0.08)}" y="${titleY}" font-family="${escapeXml(style.fontFamily)}" font-size="${titleSize}" fill="${style.textColor}" font-weight="${fontWeight}">${title}</text>
  <text x="${Math.round(preset.width * 0.08)}" y="${subtitleY}" font-family="${escapeXml(style.fontFamily)}" font-size="${subtitleSize}" fill="${style.textColor}" opacity="0.78">${subtitle}</text>
  <rect x="${Math.round(preset.width * 0.08)}" y="${underlineY}" width="${Math.round(preset.width * 0.26)}" height="${Math.round(preset.height * 0.012)}" fill="${style.accentColor}"/>
</svg>
`;
}

function findDefaultCoverFramePath(
  paths: AppPaths,
  taskId: string,
  task: VideoTask,
  preset: OutputPreset
): string | undefined {
  const frameAsset = task.mediaAssets.find(
    (asset) =>
      asset.kind === "cover-image" && asset.relativePath.includes(`video-frame-cover-${preset.id}`)
  );
  const variantCoverPath = task.outputVariants.find(
    (variant) =>
      variant.presetId === preset.id && variant.coverImagePath?.includes("video-frame-cover")
  )?.coverImagePath;
  const relativePath = frameAsset?.relativePath ?? variantCoverPath;
  if (!relativePath) {
    return undefined;
  }

  const absolutePath = absoluteTaskPath(paths, taskId, relativePath);
  return fs.existsSync(absolutePath) ? absolutePath : undefined;
}

function createCoverBackgroundMarkup(
  style: CoverStyle,
  preset: OutputPreset,
  backgroundImagePath: string | undefined
): string {
  if (!backgroundImagePath) {
    return `  <rect width="100%" height="100%" fill="${style.backgroundColor}"/>`;
  }

  const base64 = fs.readFileSync(backgroundImagePath).toString("base64");
  return `  <image href="data:${mimeTypeFromPath(backgroundImagePath)};base64,${base64}" x="0" y="0" width="${preset.width}" height="${preset.height}" preserveAspectRatio="xMidYMid slice"/>
  <rect width="100%" height="100%" fill="#0f172a" opacity="0.38"/>`;
}

function mimeTypeFromPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".webp") {
    return "image/webp";
  }

  return "image/jpeg";
}

function fontWeightValue(style: CoverStyle): string {
  return style.fontWeight === "bold" ? "700" : "400";
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
