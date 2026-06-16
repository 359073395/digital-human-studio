import fs from "node:fs";
import path from "node:path";
import {
  OUTPUT_PRESETS,
  type GenerationStepId,
  type OutputPresetId,
  type PublishingPackage,
  type VideoTask
} from "../../shared/domain";
import { defaultSourceScript } from "../script/mockScriptProvider";
import { ensureTaskMediaDirectories, getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { TaskRepository } from "../storage/taskRepository";

const WORKFLOW_STEPS: GenerationStepId[] = [
  "source",
  "script",
  "avatar",
  "subtitles",
  "post-production",
  "export"
];

interface MockWorkflowRunnerOptions {
  failStepsOnce?: GenerationStepId[];
}

export class MockWorkflowRunner {
  private readonly failStepsOnce: Set<GenerationStepId>;
  private readonly failedSteps = new Set<GenerationStepId>();

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly paths: AppPaths,
    options: MockWorkflowRunnerOptions = {}
  ) {
    this.failStepsOnce = new Set(options.failStepsOnce ?? []);
  }

  async runTask(taskId: string): Promise<VideoTask> {
    for (const stepId of WORKFLOW_STEPS) {
      const currentTask = this.requireTask(taskId);
      const step = currentTask.steps.find((candidate) => candidate.id === stepId);
      if (step?.status === "complete") {
        continue;
      }

      const updatedTask = await this.runStep(taskId, stepId);
      const updatedStep = updatedTask.steps.find((candidate) => candidate.id === stepId);
      if (updatedStep?.status !== "complete") {
        return updatedTask;
      }
    }

    return this.requireTask(taskId);
  }

  async retryStep(taskId: string, stepId: GenerationStepId): Promise<VideoTask> {
    return this.runStep(taskId, stepId);
  }

  private async runStep(taskId: string, stepId: GenerationStepId): Promise<VideoTask> {
    this.taskRepository.updateStepStatus(taskId, stepId, "running");

    try {
      this.maybeFail(stepId);
      ensureTaskMediaDirectories(this.paths, taskId);

      switch (stepId) {
        case "source":
          this.runSourceStep(taskId);
          break;
        case "script":
          this.runScriptStep(taskId);
          break;
        case "avatar":
          this.runAvatarStep(taskId);
          break;
        case "subtitles":
          this.runSubtitleStep(taskId);
          break;
        case "post-production":
          this.runPostProductionStep(taskId);
          break;
        case "export":
          this.runExportStep(taskId);
          break;
      }

      return this.taskRepository.updateStepStatus(taskId, stepId, "complete");
    } catch (error) {
      if (stepId === "avatar" || stepId === "post-production" || stepId === "export") {
        this.markSelectedVariantsFailed(taskId);
      }

      return this.taskRepository.updateStepStatus(
        taskId,
        stepId,
        "retry-ready",
        error instanceof Error ? error.message : "Mock workflow step failed."
      );
    }
  }

  private runSourceStep(taskId: string): void {
    const task = this.requireTask(taskId);
    const sourceScript = task.sourceScript || defaultSourceScript(task.contentLanguage);
    this.taskRepository.updateTask({
      taskId,
      sourceScript
    });

    writeTaskFile(this.paths, taskId, "source/source-script.txt", sourceScript);
  }

  private runScriptStep(taskId: string): void {
    const task = this.requireTask(taskId);
    const finalScript = createMockFinalScript(task);

    this.taskRepository.updateFinalScript(taskId, finalScript);
    writeTaskFile(this.paths, taskId, "source/final-script.txt", finalScript);
  }

  private runAvatarStep(taskId: string): void {
    const task = this.requireTask(taskId);

    for (const presetId of task.selectedOutputPresets) {
      this.taskRepository.updateOutputVariant(taskId, presetId, { status: "rendering" });
      const relativePath = `avatar/mock-avatar-${presetId}.txt`;
      writeTaskFile(
        this.paths,
        taskId,
        relativePath,
        createPlaceholderVideoText(task, presetId, "avatar")
      );
      this.taskRepository.updateOutputVariant(taskId, presetId, { status: "waiting" });
    }
  }

  private runSubtitleStep(taskId: string): void {
    const task = this.requireTask(taskId);

    for (const presetId of task.selectedOutputPresets) {
      const relativePath = `subtitles/subtitles-${presetId}.srt`;
      writeTaskFile(this.paths, taskId, relativePath, createMockSrt(task));
      this.taskRepository.addMediaAsset(taskId, "subtitle-file", relativePath);
    }
  }

  private runPostProductionStep(taskId: string): void {
    const task = this.requireTask(taskId);

    for (const presetId of task.selectedOutputPresets) {
      this.taskRepository.updateOutputVariant(taskId, presetId, { status: "rendering" });
      const relativePath = `post/cover-${presetId}.svg`;
      writeTaskFile(this.paths, taskId, relativePath, createMockCoverSvg(task, presetId));
      this.taskRepository.addMediaAsset(taskId, "cover-image", relativePath);
      this.taskRepository.updateOutputVariant(taskId, presetId, { coverImagePath: relativePath });
    }
  }

  private runExportStep(taskId: string): void {
    const task = this.requireTask(taskId);
    const publishingPackage = createPublishingPackage(task);

    for (const presetId of task.selectedOutputPresets) {
      const relativePath = `exports/${presetId}/mock-finished-${presetId}.txt`;
      writeTaskFile(
        this.paths,
        taskId,
        relativePath,
        createPlaceholderVideoText(task, presetId, "finished")
      );
      this.taskRepository.updateOutputVariant(taskId, presetId, { status: "complete" });
    }

    const manifestPath = "exports/publishing-package/manifest.json";
    writeTaskFile(
      this.paths,
      taskId,
      manifestPath,
      JSON.stringify(createPublishingManifest(this.requireTask(taskId), publishingPackage), null, 2)
    );
    this.taskRepository.addMediaAsset(taskId, "publishing-package", manifestPath);
    this.taskRepository.updatePublishingPackage(taskId, {
      ...publishingPackage,
      exportDirectory: "exports/publishing-package"
    });
  }

  private maybeFail(stepId: GenerationStepId): void {
    if (!this.failStepsOnce.has(stepId) || this.failedSteps.has(stepId)) {
      return;
    }

    this.failedSteps.add(stepId);
    throw new Error(`Mock ${stepId} step failed once for retry testing.`);
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

function writeTaskFile(
  paths: AppPaths,
  taskId: string,
  relativePath: string,
  content: string
): void {
  const absolutePath = path.join(getTaskDirectory(paths, taskId), ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf8");
}

function createMockFinalScript(task: VideoTask): string {
  const source = task.sourceScript || defaultSourceScript(task.contentLanguage);

  if (task.contentLanguage === "en-US") {
    return [
      "Stop blaming the algorithm first.",
      "When a video gets views but does not bring orders, the first thing to fix is the buying reason in the opening seconds.",
      `Use this angle: ${source}`,
      "Show the pain point, give one concrete proof, then tell viewers exactly what to do next."
    ].join("\n");
  }

  if (task.contentLanguage === "id-ID") {
    return [
      "Jangan langsung salahkan trafik dulu.",
      "Kalau video sudah ditonton tapi pesanan belum masuk, bagian pertama yang harus diperbaiki adalah alasan orang harus beli sekarang.",
      `Sudut bicaranya bisa seperti ini: ${source}`,
      "Mulai dari masalah yang terasa dekat, tunjukkan satu bukti yang jelas, lalu tutup dengan ajakan yang simpel."
    ].join("\n");
  }

  return [
    "先别急着怪流量。",
    "一个视频有播放却没有订单，最该改的往往是开头几秒的购买理由。",
    `这条可以这样讲：${source}`,
    "先点出痛点，再给一个具体证明，最后把行动指令说清楚。"
  ].join("\n");
}

function createMockSrt(task: VideoTask): string {
  const lines = (task.finalScript || task.sourceScript || defaultSourceScript(task.contentLanguage))
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 4);

  return lines
    .map((line, index) => {
      const start = index * 3;
      const end = start + 3;
      return [
        `${index + 1}`,
        `00:00:${String(start).padStart(2, "0")},000 --> 00:00:${String(end).padStart(2, "0")},000`,
        line
      ].join("\n");
    })
    .join("\n\n");
}

function createMockCoverSvg(task: VideoTask, presetId: OutputPresetId): string {
  const preset = OUTPUT_PRESETS.find((candidate) => candidate.id === presetId);
  const width = preset?.width ?? 1080;
  const height = preset?.height ?? 1920;
  const style = task.coverStyle;
  const title = escapeXml(style.title.trim() || createPublishingTitle(task));
  const subtitle = escapeXml(
    style.subtitle.trim() || `Mock cover · ${preset?.aspectRatio ?? presetId}`
  );
  const titleSize = Math.round((style.fontSize / 1080) * width);
  const subtitleSize = Math.round(titleSize * 0.42);
  const fontWeight = style.fontWeight === "bold" ? "700" : "400";
  const titleY = Math.round(height * (style.verticalPercent / 100));
  const subtitleY = titleY + Math.round(titleSize * 1.15);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${style.backgroundColor}"/>
  <rect x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.1)}" width="${Math.round(width * 0.84)}" height="${Math.round(height * 0.012)}" fill="${style.accentColor}"/>
  <text x="${Math.round(width * 0.08)}" y="${titleY}" font-family="${escapeXml(style.fontFamily)}" font-size="${titleSize}" fill="${style.textColor}" font-weight="${fontWeight}">${title}</text>
  <text x="${Math.round(width * 0.08)}" y="${subtitleY}" font-family="${escapeXml(style.fontFamily)}" font-size="${subtitleSize}" fill="${style.textColor}" opacity="0.78">${subtitle}</text>
</svg>
`;
}

function createPlaceholderVideoText(
  task: VideoTask,
  presetId: OutputPresetId,
  stage: "avatar" | "finished"
): string {
  return [
    `Digital Human Studio mock ${stage} video`,
    `Task: ${task.title}`,
    `Preset: ${presetId}`,
    "",
    task.finalScript || task.sourceScript || defaultSourceScript(task.contentLanguage)
  ].join("\n");
}

function createPublishingPackage(task: VideoTask): PublishingPackage {
  if (task.contentLanguage === "id-ID") {
    return {
      title: createPublishingTitle(task),
      description:
        "Ini adalah catatan publish dari mock workflow Digital Human Studio. Nanti bisa diganti dengan copy final setelah API asli tersambung.",
      tags: ["digitalhuman", "videopendek", "tiktokshop"],
      notes: "Output mock hanya untuk memvalidasi status task, struktur file, dan paket publish."
    };
  }

  return {
    title: createPublishingTitle(task),
    description:
      "这是一条由 Digital Human Studio mock 工作流生成的发布说明，可在真实 API 接入后替换为正式文案。",
    tags:
      task.contentLanguage === "en-US"
        ? ["digitalhuman", "shortvideo", "creator"]
        : ["数字人口播", "短视频", "带货"],
    notes: "Mock 工作流产物仅用于验证任务状态、文件布局和导出资料包结构。"
  };
}

function createPublishingTitle(task: VideoTask): string {
  const base =
    (task.finalScript || task.sourceScript || task.title).split(/\r?\n/)[0] ?? task.title;
  return base.length > 24 ? `${base.slice(0, 24)}...` : base;
}

function createPublishingManifest(task: VideoTask, publishingPackage: PublishingPackage) {
  return {
    generatedBy: "Digital Human Studio mock workflow",
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

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
