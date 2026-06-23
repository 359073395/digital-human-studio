import fs from "node:fs";
import path from "node:path";
import type {
  StoryScriptPackage,
  VisualStoryboardPackage,
  VisualStoryboardPanelCount,
  VideoTask
} from "../../shared/domain";
import type { ImageProvider } from "../image/imageProvider";
import {
  buildKnowledgeContext,
  writeKnowledgeContextPreview
} from "../knowledge/knowledgeContextBuilder";
import { getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { TaskRepository } from "../storage/taskRepository";
import type { StoryboardProvider } from "./storyboardProvider";

export class StoryboardWorkflowService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly paths: AppPaths,
    private readonly storyboardProvider: StoryboardProvider,
    private readonly imageProvider: ImageProvider
  ) {}

  async generateStoryScriptOptions(taskId: string): Promise<VideoTask> {
    const task = this.requireTask(taskId);
    const knowledgeContext = buildKnowledgeContext(this.paths, task, "storyboard");
    writeKnowledgeContextPreview(this.paths, taskId, knowledgeContext);

    if (!knowledgeContext.hasCurrentTaskInput) {
      throw new Error("请先填写原视频链接、上传素材、粘贴文案或输入任务主题，再生成剧情脚本方案。");
    }

    this.taskRepository.updateStepStatus(taskId, "script", "running");

    try {
      const result = await this.storyboardProvider.generateStoryScriptOptions({
        task,
        sourceBrief: knowledgeContext.promptText
      });
      const recommendedScript = selectRecommendedScript(result.scriptPackage);

      const jsonRelativePath = "storyboard/story-script-options.json";
      const markdownRelativePath = "storyboard/story-script-options.md";
      const promptRelativePath = "storyboard/story-script-options-prompt.txt";
      writeTaskFile(
        this.paths,
        taskId,
        jsonRelativePath,
        `${JSON.stringify(result.scriptPackage, null, 2)}\n`
      );
      writeTaskFile(
        this.paths,
        taskId,
        markdownRelativePath,
        renderStoryScriptMarkdown(result.scriptPackage)
      );
      writeTaskFile(this.paths, taskId, promptRelativePath, result.promptPreview);
      this.taskRepository.addMediaAsset(taskId, "story-script-options", jsonRelativePath);
      this.taskRepository.addMediaAsset(taskId, "story-script-options", markdownRelativePath);
      this.taskRepository.addMediaAsset(taskId, "story-script-options", promptRelativePath);

      const latestTask = this.requireTask(taskId);
      this.taskRepository.updateTask({
        taskId,
        finalScript: recommendedScript || latestTask.finalScript,
        creativeWorkflow: {
          ...latestTask.creativeWorkflow,
          referenceAnalysis: result.scriptPackage.referenceMechanics,
          sellingPoints: result.scriptPackage.productAnalysis,
          dailyPipeline: result.scriptPackage.conversionStrategy
        }
      });

      return this.taskRepository.updateStepStatus(taskId, "script", "complete");
    } catch (error) {
      return this.taskRepository.updateStepStatus(
        taskId,
        "script",
        "retry-ready",
        error instanceof Error ? error.message : "剧情脚本方案生成失败。"
      );
    }
  }

  async generateVisualStoryboard(
    taskId: string,
    panelCount: VisualStoryboardPanelCount = "auto"
  ): Promise<VideoTask> {
    const task = this.requireTask(taskId);
    const knowledgeContext = buildKnowledgeContext(this.paths, task, "storyboard");
    writeKnowledgeContextPreview(this.paths, taskId, knowledgeContext);

    if (!knowledgeContext.hasCurrentTaskInput) {
      throw new Error("请先填写原视频链接、上传素材、粘贴文案或输入任务主题，再生成视觉故事板。");
    }

    if (!task.finalScript.trim()) {
      throw new Error("请先生成剧情脚本方案，或手动填写确认后的 AI 生成文案，再生成视觉故事板。");
    }

    this.taskRepository.updateStepStatus(taskId, "script", "running");

    try {
      const result = await this.storyboardProvider.generateVisualStoryboard({
        task,
        sourceBrief: knowledgeContext.promptText,
        panelCount
      });

      const jsonRelativePath = "storyboard/visual-storyboard.json";
      const markdownRelativePath = "storyboard/visual-storyboard.md";
      const promptRelativePath = "storyboard/visual-storyboard-prompt.txt";
      writeTaskFile(
        this.paths,
        taskId,
        jsonRelativePath,
        `${JSON.stringify(result.storyboard, null, 2)}\n`
      );
      writeTaskFile(
        this.paths,
        taskId,
        markdownRelativePath,
        renderStoryboardMarkdown(result.storyboard)
      );
      writeTaskFile(this.paths, taskId, promptRelativePath, result.promptPreview);
      this.taskRepository.addMediaAsset(taskId, "visual-storyboard", jsonRelativePath);
      this.taskRepository.addMediaAsset(taskId, "visual-storyboard", markdownRelativePath);
      this.taskRepository.addMediaAsset(taskId, "visual-storyboard", promptRelativePath);

      let imageError = "";
      try {
        const image = await this.imageProvider.generateVisualStoryboardImage({
          prompt: result.storyboard.boardImagePrompt
        });
        const imageRelativePath = `storyboard/visual-storyboard.${image.extension}`;
        writeTaskFile(this.paths, taskId, imageRelativePath, image.imageBytes);
        writeTaskFile(
          this.paths,
          taskId,
          "storyboard/visual-storyboard-image-prompt.txt",
          image.promptPreview
        );
        this.taskRepository.addMediaAsset(taskId, "visual-storyboard", imageRelativePath);
        this.taskRepository.addMediaAsset(
          taskId,
          "visual-storyboard",
          "storyboard/visual-storyboard-image-prompt.txt"
        );
      } catch (error) {
        imageError = error instanceof Error ? error.message : "故事板图生成失败。";
      }

      const latestTask = this.requireTask(taskId);
      this.taskRepository.updateTask({
        taskId,
        creativeWorkflow: {
          ...latestTask.creativeWorkflow,
          referenceAnalysis: result.storyboard.sourceSummary,
          sellingPoints: result.storyboard.productAnalysis,
          storyboard: summarizeStoryboard(result.storyboard),
          aiVideoPrompt: result.storyboard.wholeVideoPrompt
        }
      });

      if (imageError) {
        return this.taskRepository.updateStepStatus(taskId, "script", "retry-ready", imageError);
      }

      return this.taskRepository.updateStepStatus(taskId, "script", "complete");
    } catch (error) {
      return this.taskRepository.updateStepStatus(
        taskId,
        "script",
        "retry-ready",
        error instanceof Error ? error.message : "视觉故事板生成失败。"
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

function selectRecommendedScript(scriptPackage: StoryScriptPackage): string {
  const selected =
    scriptPackage.options.find((option) => option.id === scriptPackage.recommendedOptionId) ??
    scriptPackage.options[0];
  return selected?.script.trim() ?? "";
}

function renderStoryScriptMarkdown(scriptPackage: StoryScriptPackage): string {
  return [
    `# ${scriptPackage.title}`,
    "",
    "## 产品与用户分析",
    scriptPackage.productAnalysis,
    "",
    "## 爆款机制拆解",
    scriptPackage.referenceMechanics,
    "",
    "## 转化策略",
    scriptPackage.conversionStrategy,
    "",
    "## 原创性说明",
    scriptPackage.originalityNotes,
    "",
    "## 剧情脚本方案",
    ...scriptPackage.options.flatMap((option) => [
      "",
      `### ${option.id}. ${option.title}`,
      `- 角度：${option.angle}`,
      `- 目标人群：${option.targetAudience}`,
      `- 前 5 秒：${option.hook}`,
      `- 推荐理由：${option.reason}`,
      `- 风险提示：${option.riskNotes}`,
      "",
      "节奏：",
      ...option.beatSheet.map((beat) => `- ${beat}`),
      "",
      "脚本：",
      option.script
    ]),
    ""
  ].join("\n");
}

function renderStoryboardMarkdown(storyboard: VisualStoryboardPackage): string {
  return [
    `# ${storyboard.title}`,
    "",
    "## 爆款拆解摘要",
    storyboard.sourceSummary,
    "",
    "## 产品与用户分析",
    storyboard.productAnalysis,
    "",
    "## 复用的抽象机制",
    storyboard.referenceMechanics,
    "",
    "## 复刻策略",
    storyboard.remakeStrategy,
    "",
    "## 已确认脚本",
    storyboard.selectedScript,
    "",
    "## 视觉统一设定",
    `- 主角：${storyboard.visualBible.protagonist}`,
    `- 商品：${storyboard.visualBible.product}`,
    `- 服装：${storyboard.visualBible.wardrobe}`,
    `- 场景：${storyboard.visualBible.location}`,
    `- 光线：${storyboard.visualBible.lighting}`,
    `- 色调：${storyboard.visualBible.colorPalette}`,
    `- 镜头：${storyboard.visualBible.cameraStyle}`,
    `- 字幕安全区：${storyboard.visualBible.subtitleSafeSpace}`,
    `- 一致性锁定：${storyboard.visualBible.consistencyLocks.join("；")}`,
    "",
    "## 分镜提示词",
    "| 镜头 | 时长 | 画面 | 动作 | 运镜 | 提示词 |",
    "|---:|---:|---|---|---|---|",
    ...storyboard.shots.map(
      (shot) =>
        `| ${shot.shotNumber} | ${shot.durationSeconds}s | ${escapeTableCell(shot.visualAction)} | ${escapeTableCell(
          shot.subjectAction
        )} | ${escapeTableCell(shot.cameraMovement)} | ${escapeTableCell(shot.imagePrompt)} |`
    ),
    "",
    "## 故事板图提示词",
    storyboard.boardImagePrompt,
    "",
    "## 整片视频提示词",
    storyboard.wholeVideoPrompt,
    ""
  ].join("\n");
}

function summarizeStoryboard(storyboard: VisualStoryboardPackage): string {
  return [
    `${storyboard.panelCount} 个分镜 · ${storyboard.layout}`,
    storyboard.remakeStrategy,
    ...storyboard.shots.map(
      (shot) => `${shot.shotNumber}. ${shot.durationSeconds}s ${shot.visualAction}`
    )
  ].join("\n");
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

function writeTaskFile(
  paths: AppPaths,
  taskId: string,
  relativePath: string,
  content: string | Buffer
): void {
  const absolutePath = path.join(getTaskDirectory(paths, taskId), ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}
