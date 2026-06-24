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
        const fallbackRelativePath = "storyboard/visual-storyboard-fallback.svg";
        writeTaskFile(
          this.paths,
          taskId,
          fallbackRelativePath,
          renderFallbackStoryboardSvg(result.storyboard, imageError)
        );
        writeTaskFile(
          this.paths,
          taskId,
          "storyboard/visual-storyboard-image-error.txt",
          imageError
        );
        this.taskRepository.addMediaAsset(taskId, "visual-storyboard", fallbackRelativePath);
        this.taskRepository.addMediaAsset(
          taskId,
          "visual-storyboard",
          "storyboard/visual-storyboard-image-error.txt"
        );
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

function renderFallbackStoryboardSvg(
  storyboard: VisualStoryboardPackage,
  imageError: string
): string {
  const width = 1536;
  const height = 1024;
  const shots = storyboard.shots.slice(0, 12);
  const columns = shots.length <= 6 ? 3 : 4;
  const rows = Math.ceil(shots.length / columns);
  const gap = 18;
  const margin = 42;
  const headerHeight = 118;
  const cardWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
  const cardHeight = (height - headerHeight - margin - gap * (rows - 1)) / rows;
  const cards = shots
    .map((shot, index) => {
      const x = margin + (index % columns) * (cardWidth + gap);
      const y = headerHeight + Math.floor(index / columns) * (cardHeight + gap);
      const title = `镜头 ${shot.shotNumber} · ${shot.durationSeconds}s`;
      const body = [shot.visualAction, shot.subjectAction, shot.voiceoverOrText]
        .filter(Boolean)
        .join(" / ");
      return [
        `<g transform="translate(${x}, ${y})">`,
        `<rect width="${cardWidth}" height="${cardHeight}" rx="18" fill="#f8f3ee" stroke="#b9aaa0" stroke-width="2"/>`,
        `<rect x="18" y="18" width="${cardWidth - 36}" height="${Math.max(92, cardHeight * 0.42)}" rx="14" fill="#d9cfc5"/>`,
        `<text x="30" y="48" font-family="Microsoft YaHei, Arial" font-size="24" font-weight="700" fill="#2f3330">${escapeXml(title)}</text>`,
        ...wrapSvgText(body, cardWidth - 52, 21).map(
          (line, lineIndex) =>
            `<text x="26" y="${Math.max(132, cardHeight * 0.5) + lineIndex * 28}" font-family="Microsoft YaHei, Arial" font-size="21" fill="#3d413e">${escapeXml(line)}</text>`
        ),
        `<text x="26" y="${cardHeight - 28}" font-family="Microsoft YaHei, Arial" font-size="18" fill="#7b6f66">${escapeXml(shot.cameraMovement || shot.shotType)}</text>`,
        "</g>"
      ].join("");
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#eee7df"/>`,
    `<text x="${margin}" y="52" font-family="Microsoft YaHei, Arial" font-size="34" font-weight="800" fill="#2f3330">${escapeXml(storyboard.title)}</text>`,
    `<text x="${margin}" y="88" font-family="Microsoft YaHei, Arial" font-size="20" fill="#6d625a">AI 故事板图接口暂时失败，已生成本地可预览故事板：${escapeXml(imageError).slice(0, 180)}</text>`,
    cards,
    "</svg>"
  ].join("");
}

function wrapSvgText(text: string, maxWidth: number, fontSize: number): string[] {
  const maxChars = Math.max(10, Math.floor(maxWidth / (fontSize * 0.58)));
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }
  const lines: string[] = [];
  for (let index = 0; index < normalized.length && lines.length < 4; index += maxChars) {
    lines.push(normalized.slice(index, index + maxChars));
  }
  return lines;
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
  content: string | Buffer
): void {
  const absolutePath = path.join(getTaskDirectory(paths, taskId), ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}
