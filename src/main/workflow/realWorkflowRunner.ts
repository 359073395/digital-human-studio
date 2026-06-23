import type { VideoTask } from "../../shared/domain";
import { TaskRepository } from "../storage/taskRepository";
import type { AvatarWorkflowService } from "../avatar/avatarWorkflowService";
import type { PresenterImageWorkflowService } from "../image/presenterImageWorkflowService";
import type { ScriptWorkflowService } from "../script/scriptWorkflowService";
import type { ExportWorkflowService } from "./exportWorkflowService";
import type { MixedCutWorkflowService } from "./mixedCutWorkflowService";

export class RealWorkflowRunner {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly scriptWorkflowService: ScriptWorkflowService,
    private readonly presenterImageWorkflowService: PresenterImageWorkflowService,
    private readonly avatarWorkflowService: AvatarWorkflowService,
    private readonly exportWorkflowService: ExportWorkflowService,
    private readonly mixedCutWorkflowService?: MixedCutWorkflowService
  ) {}

  async runTask(taskId: string): Promise<VideoTask> {
    this.resetDownstreamSteps(taskId);

    let task = this.requireTask(taskId);
    if (!task.finalScript.trim()) {
      task = await this.scriptWorkflowService.generateScript(taskId);
      if (task.steps.find((step) => step.id === "script")?.status !== "complete") {
        return task;
      }
    }

    task = this.requireTask(taskId);
    if (
      task.generationMode === "product-avatar" &&
      task.avatarMode === "image-presenter" &&
      !this.hasGeneratedPresenterImages(task)
    ) {
      task = await this.presenterImageWorkflowService.generatePresenterImages(taskId);
      const avatarStep = task.steps.find((step) => step.id === "avatar");
      if (avatarStep?.status === "retry-ready" || avatarStep?.status === "failed") {
        return task;
      }
    }

    task = this.requireTask(taskId);
    if (task.generationMode === "mixed-cut") {
      if (!this.mixedCutWorkflowService) {
        return this.taskRepository.updateStepStatus(
          taskId,
          "post-production",
          "retry-ready",
          "混剪视频服务尚未接入。"
        );
      }

      task = this.mixedCutWorkflowService.prepareMixedCut(taskId);
      if (task.steps.find((step) => step.id === "post-production")?.status === "retry-ready") {
        return task;
      }

      return this.exportWorkflowService.exportTask(taskId);
    }

    task = this.requireTask(taskId);
    if (task.generationMode === "image-lipsync" && !this.hasReferenceImage(task)) {
      return this.taskRepository.updateStepStatus(
        taskId,
        "avatar",
        "retry-ready",
        "请先上传人物图片。"
      );
    }

    task = await this.avatarWorkflowService.renderHeyGenAvatar(taskId);
    if (task.steps.find((step) => step.id === "avatar")?.status !== "complete") {
      this.resetPostProductionAfterAvatarFailure(taskId);
      return this.requireTask(taskId);
    }

    if (task.steps.find((step) => step.id === "subtitles")?.status !== "complete") {
      this.taskRepository.updateStepStatus(taskId, "post-production", "waiting");
      this.taskRepository.updateStepStatus(taskId, "export", "waiting");
      return this.requireTask(taskId);
    }

    return this.exportWorkflowService.exportTask(taskId);
  }

  private resetDownstreamSteps(taskId: string): void {
    const task = this.requireTask(taskId);
    this.taskRepository.resetOutputVariants(taskId, task.selectedOutputPresets);
    this.taskRepository.updateStepStatus(taskId, "avatar", "waiting");
    this.taskRepository.updateStepStatus(taskId, "subtitles", "waiting");
    this.taskRepository.updateStepStatus(taskId, "post-production", "waiting");
    this.taskRepository.updateStepStatus(taskId, "export", "waiting");
  }

  private resetPostProductionAfterAvatarFailure(taskId: string): void {
    this.taskRepository.updateStepStatus(taskId, "subtitles", "waiting");
    this.taskRepository.updateStepStatus(taskId, "post-production", "waiting");
    this.taskRepository.updateStepStatus(taskId, "export", "waiting");
  }

  private hasGeneratedPresenterImages(task: VideoTask): boolean {
    return task.selectedOutputPresets.every((presetId) => {
      const selectedAssetId = task.generatedPresenterImageSelections?.[presetId];
      if (selectedAssetId) {
        return task.mediaAssets.some(
          (asset) => asset.id === selectedAssetId && asset.kind === "generated-presenter-image"
        );
      }

      return task.mediaAssets.some(
        (asset) =>
          asset.kind === "generated-presenter-image" &&
          asset.relativePath.includes(`generated-presenter-${presetId}-`)
      );
    });
  }

  private hasReferenceImage(task: VideoTask): boolean {
    return Boolean(
      task.referenceImageAssetId &&
      task.mediaAssets.some(
        (asset) => asset.id === task.referenceImageAssetId && asset.kind === "reference-image"
      )
    );
  }

  private requireTask(taskId: string): VideoTask {
    const task = this.taskRepository.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    return task;
  }
}
