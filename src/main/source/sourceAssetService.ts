import fs from "node:fs";
import path from "node:path";
import type { AppPathSettings } from "../../shared/appSettings";
import type { MediaAsset, VideoTask } from "../../shared/domain";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { defaultServiceSettings } from "../../shared/serviceConfig";
import { redactSecret } from "../security/redaction";
import type { VisualAnalysisProvider } from "../media/visualAnalysisProvider";
import { getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { TaskRepository } from "../storage/taskRepository";

const DIRECT_MEDIA_CONTENT_TYPES = ["video/", "audio/", "application/octet-stream"];
const SOURCE_VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);
const SOURCE_AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);
const MIXED_MATERIAL_EXTENSIONS = new Set([
  ...SOURCE_VIDEO_EXTENSIONS,
  ...SOURCE_AUDIO_EXTENSIONS,
  ".png",
  ".jpg",
  ".jpeg",
  ".webp"
]);
const KNOWLEDGE_DOCUMENT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".pdf",
  ".doc",
  ".docx"
]);

interface SourceParserConfigurationReader {
  getConfiguration: (providerId: "source-parser") => ServiceConfiguration;
}

interface SourceParserCredentialReader {
  readCredential: (providerId: "source-parser") => Promise<string | null>;
}

interface SourceParserRuntime {
  baseUrl: string;
  apiKey: string;
}

interface PathSettingsReader {
  getPathSettings: () => AppPathSettings;
}

interface SourceParserCreateJobResponse {
  job_id?: string;
  jobId?: string;
}

interface SourceParserJob {
  job_id?: string;
  jobId?: string;
  status?: string;
  title?: string | null;
  filename?: string | null;
  error?: string | null;
  progress?: number;
}

export class SourceAssetService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly paths: AppPaths,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly sourceParserConfigurations?: SourceParserConfigurationReader,
    private readonly sourceParserCredentials?: SourceParserCredentialReader,
    private readonly pathSettingsReader?: PathSettingsReader,
    private readonly visualAnalysisProvider?: VisualAnalysisProvider
  ) {}

  async downloadOriginalVideo(taskId: string): Promise<VideoTask> {
    const task = this.requireTask(taskId);
    const originalVideoInput = task.originalVideoUrl?.trim();
    if (!originalVideoInput) {
      throw new Error("请先粘贴原视频链接。");
    }
    const originalVideoUrl = extractFirstHttpUrl(originalVideoInput);
    if (!originalVideoUrl) {
      throw new Error(
        "没有在原视频链接输入框中找到 http/https 链接。请粘贴平台分享文案或直接粘贴原视频 URL。"
      );
    }

    this.taskRepository.updateStepStatus(taskId, "source", "running");

    try {
      const parserRuntime = await this.resolveSourceParserRuntime();
      if (parserRuntime) {
        return await this.downloadWithSourceParser(taskId, originalVideoUrl, parserRuntime);
      }

      return await this.downloadDirectMedia(taskId, originalVideoUrl);
    } catch (error) {
      this.taskRepository.updateStepStatus(
        taskId,
        "source",
        "retry-ready",
        error instanceof Error ? error.message : "原视频下载失败。"
      );
      throw error;
    }
  }

  private async resolveSourceParserRuntime(): Promise<SourceParserRuntime | null> {
    if (!this.sourceParserConfigurations || !this.sourceParserCredentials) {
      return null;
    }

    const configuration = this.sourceParserConfigurations.getConfiguration("source-parser");
    if (configuration.settings.enabled === false) {
      return null;
    }

    const baseUrl =
      configuration.settings.baseUrl || defaultServiceSettings("source-parser").baseUrl;
    if (!baseUrl) {
      throw new Error("请先在设置里填写原视频解析下载 Base URL。");
    }

    const apiKey = await this.sourceParserCredentials.readCredential("source-parser");
    if (!apiKey) {
      throw new Error("请先在设置里保存原视频解析下载 API Key。");
    }

    return { baseUrl: normalizeBaseUrl(baseUrl), apiKey };
  }

  private async downloadWithSourceParser(
    taskId: string,
    originalVideoUrl: string,
    runtime: SourceParserRuntime
  ): Promise<VideoTask> {
    const created = await requestJson<SourceParserCreateJobResponse>(
      this.fetchImpl,
      `${runtime.baseUrl}/api/v1/jobs`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": runtime.apiKey
        },
        body: JSON.stringify({ url: originalVideoUrl })
      }
    );
    const jobId = created.job_id ?? created.jobId;
    if (!jobId) {
      throw new Error("原视频解析任务创建成功但响应缺少 job_id。");
    }

    const completed = await this.pollSourceParserJob(runtime, jobId);
    const fileResponse = await this.fetchImpl(
      `${runtime.baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}/download`,
      {
        method: "GET",
        headers: {
          "x-api-key": runtime.apiKey
        }
      }
    );
    if (!fileResponse.ok) {
      const text = await fileResponse.text();
      throw new Error(
        `原视频解析下载文件失败 (${fileResponse.status})：${redactSecret(text.slice(0, 800)) || fileResponse.statusText}`
      );
    }

    const bytes = Buffer.from(await fileResponse.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error("原视频解析下载内容为空。");
    }

    const contentType = fileResponse.headers.get("content-type")?.toLowerCase() ?? "";
    const extension =
      extensionFromFileName(completed.filename ?? "") ||
      extensionFromFileName(completed.title ?? "") ||
      extensionFromContentType(contentType) ||
      ".mp4";
    const fileNameStem =
      sanitizeBaseName(path.basename(completed.filename ?? "", extension)) ||
      sanitizeBaseName(completed.title ?? "") ||
      "parsed-video";
    const relativePath = `source/original-video-${Date.now()}-${fileNameStem}${extension}`;
    writeTaskFile(this.paths, taskId, relativePath, bytes);
    this.copyDownloadedSourceToConfiguredDirectory(relativePath, bytes);
    this.taskRepository.addMediaAsset(taskId, mediaKindFromExtension(extension), relativePath);
    return this.taskRepository.updateStepStatus(taskId, "source", "complete");
  }

  private async pollSourceParserJob(
    runtime: SourceParserRuntime,
    jobId: string
  ): Promise<SourceParserJob> {
    let latestJob: SourceParserJob | undefined;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      latestJob = await requestJson<SourceParserJob>(
        this.fetchImpl,
        `${runtime.baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}`,
        {
          method: "GET",
          headers: {
            "x-api-key": runtime.apiKey
          }
        }
      );

      const status = latestJob.status?.toLowerCase();
      if (status === "completed") {
        return latestJob;
      }

      if (status === "failed" || status === "expired") {
        throw new Error(
          describeSourceParserJobFailure(
            latestJob.error || `原视频解析任务${status === "expired" ? "已过期" : "失败"}。`
          )
        );
      }

      await delay(1_500);
    }

    throw new Error(
      latestJob?.status
        ? `原视频解析任务超时，最后状态：${latestJob.status}。`
        : "原视频解析任务超时。"
    );
  }

  private async downloadDirectMedia(taskId: string, originalVideoUrl: string): Promise<VideoTask> {
    const url = new URL(originalVideoUrl);
    const response = await this.fetchImpl(url.toString());
    if (!response.ok) {
      throw new Error(`原视频下载失败 (${response.status})：${response.statusText}`);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const extension = extensionFromUrl(url) || extensionFromContentType(contentType);
    if (!isDirectMedia(contentType, extension)) {
      throw new Error(
        "当前链接没有直接返回视频/音频文件，可能是平台短链、网页登录页或防盗链页面。请先手动下载原视频，再用“上传原视频”导入。"
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error("原视频下载内容为空。");
    }

    const relativePath = `source/original-video-${Date.now()}${extension || ".mp4"}`;
    writeTaskFile(this.paths, taskId, relativePath, bytes);
    this.copyDownloadedSourceToConfiguredDirectory(relativePath, bytes);
    this.taskRepository.addMediaAsset(taskId, mediaKindFromExtension(extension), relativePath);
    return this.taskRepository.updateStepStatus(taskId, "source", "complete");
  }

  importSourceVideo(taskId: string, filePath: string): VideoTask {
    const extension = validateExtension(
      filePath,
      new Set([...SOURCE_VIDEO_EXTENSIONS, ...SOURCE_AUDIO_EXTENSIONS])
    );
    const relativePath = `source/uploaded-source-${Date.now()}${extension}`;
    copyTaskFile(this.paths, taskId, filePath, relativePath);
    this.taskRepository.addMediaAsset(taskId, mediaKindFromExtension(extension), relativePath);
    return this.taskRepository.updateStepStatus(taskId, "source", "complete");
  }

  importMixedCutMaterials(taskId: string, filePaths: string[]): VideoTask {
    if (filePaths.length === 0) {
      return this.requireTask(taskId);
    }

    this.requireTask(taskId);
    for (const [index, filePath] of filePaths.entries()) {
      const extension = validateExtension(filePath, MIXED_MATERIAL_EXTENSIONS);
      const relativePath = `source/mixed-materials/material-${Date.now()}-${index + 1}-${sanitizeBaseName(
        path.basename(filePath, extension)
      )}${extension}`;
      copyTaskFile(this.paths, taskId, filePath, relativePath);
      this.taskRepository.addMediaAsset(taskId, "mixed-cut-material", relativePath);
    }

    return this.taskRepository.updateStepStatus(taskId, "source", "complete");
  }

  importKnowledgeDocuments(taskId: string, filePaths: string[]): VideoTask {
    return this.importKnowledgeFiles(taskId, filePaths, "knowledge-document", "knowledge");
  }

  importViralCopyReferences(taskId: string, filePaths: string[]): VideoTask {
    return this.importKnowledgeFiles(taskId, filePaths, "viral-copy-reference", "viral-copy");
  }

  async analyzeSourceVisuals(taskId: string): Promise<VideoTask> {
    const task = this.requireTask(taskId);
    const sourceAssets = task.mediaAssets.filter((asset) =>
      ["source-video", "mixed-cut-material", "product-image", "reference-image"].includes(
        asset.kind
      )
    );
    const originalVideoUrl = task.originalVideoUrl?.trim();

    if (sourceAssets.length === 0) {
      throw new Error("请先上传原视频、混剪素材、商品图或人物图，再进行画面分析。");
    }

    this.taskRepository.updateStepStatus(taskId, "source", "running");

    try {
      const markdown = this.visualAnalysisProvider
        ? await this.visualAnalysisProvider.analyze({
            originalVideoUrl,
            paths: this.paths,
            sourceAssets,
            task
          })
        : buildVisualAnalysisBrief({
            originalVideoUrl,
            sourceAssets,
            task
          });
      const relativePath = "source/visual-analysis.md";
      writeTaskFile(this.paths, taskId, relativePath, markdown);
      this.taskRepository.addMediaAsset(taskId, "source-visual-analysis", relativePath);
      return this.taskRepository.updateStepStatus(taskId, "source", "complete");
    } catch (error) {
      this.taskRepository.updateStepStatus(
        taskId,
        "source",
        "retry-ready",
        error instanceof Error ? error.message : "画面分析失败。"
      );
      throw error;
    }
  }

  private requireTask(taskId: string): VideoTask {
    const task = this.taskRepository.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    return task;
  }

  private copyDownloadedSourceToConfiguredDirectory(relativePath: string, bytes: Buffer): void {
    const targetDirectory =
      this.pathSettingsReader?.getPathSettings().sourceDownloadDirectory.trim() ?? "";
    if (!targetDirectory) {
      return;
    }

    fs.mkdirSync(targetDirectory, { recursive: true });
    fs.writeFileSync(path.join(targetDirectory, path.basename(relativePath)), bytes);
  }

  private importKnowledgeFiles(
    taskId: string,
    filePaths: string[],
    kind: MediaAsset["kind"],
    folderName: string
  ): VideoTask {
    if (filePaths.length === 0) {
      return this.requireTask(taskId);
    }

    this.requireTask(taskId);
    for (const [index, filePath] of filePaths.entries()) {
      const extension = validateExtension(filePath, KNOWLEDGE_DOCUMENT_EXTENSIONS);
      const relativePath = `source/${folderName}/${Date.now()}-${index + 1}-${sanitizeBaseName(
        path.basename(filePath, extension)
      )}${extension}`;
      copyTaskFile(this.paths, taskId, filePath, relativePath);
      this.taskRepository.addMediaAsset(taskId, kind, relativePath);
    }

    return this.taskRepository.updateStepStatus(taskId, "source", "complete");
  }
}

function buildVisualAnalysisBrief(input: {
  originalVideoUrl?: string;
  sourceAssets: MediaAsset[];
  task: VideoTask;
}): string {
  const assetLines = input.sourceAssets.map(
    (asset, index) => `${index + 1}. ${asset.kind}: ${asset.relativePath}`
  );

  return [
    "# 画面分析 brief",
    "",
    "## 来源",
    input.originalVideoUrl ? `- 原视频链接：${input.originalVideoUrl}` : "- 原视频链接：未填写",
    assetLines.length > 0 ? assetLines.map((line) => `- ${line}`).join("\n") : "- 本地素材：未上传",
    "",
    "## 分析方法",
    "- 当前版本先生成可编辑的画面分析 brief，并交给后续 AI 文案生成作为上下文。",
    "- 后续接入视觉模型后，这里会补充逐帧/分镜识别、画面文字、镜头节奏、人物动作和商品展示点。",
    "",
    "## 画面拆解提示",
    "- 第一帧：记录主体、文字、冲突点、产品或人物是否清晰。",
    "- 0-3 秒：判断钩子是痛点、反差、利益、悬念、身份背书还是场景代入。",
    "- 中段：拆证明方式、展示动作、B-roll 类型、字幕重点和切换节奏。",
    "- 收尾：记录 CTA、评论/收藏/购买动机、是否适合循环播放。",
    "",
    "## 复刻边界",
    "- 只复用钩子任务、信息顺序、证明类型、节奏密度和 CTA 位置。",
    "- 不复制原句、标志性口头禅、创作者人设、具体镜头签名、音乐/剪辑签名和独特表达。",
    "",
    "## 当前任务",
    `- 视频类型：${input.task.generationMode}`,
    `- 内容语言：${input.task.contentLanguage}`
  ].join("\n");
}

async function requestJson<T>(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<T> {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `原视频解析请求失败 (${response.status})：${redactSecret(text.slice(0, 800)) || response.statusText}`
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error("原视频解析响应不是有效 JSON。", { cause: error });
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function isDirectMedia(contentType: string, extension: string): boolean {
  return (
    DIRECT_MEDIA_CONTENT_TYPES.some((prefix) => contentType.startsWith(prefix)) ||
    SOURCE_VIDEO_EXTENSIONS.has(extension) ||
    SOURCE_AUDIO_EXTENSIONS.has(extension)
  );
}

function extensionFromFileName(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  return SOURCE_VIDEO_EXTENSIONS.has(extension) || SOURCE_AUDIO_EXTENSIONS.has(extension)
    ? extension
    : "";
}

function extensionFromUrl(url: URL): string {
  const extension = path.extname(url.pathname).toLowerCase();
  return SOURCE_VIDEO_EXTENSIONS.has(extension) || SOURCE_AUDIO_EXTENSIONS.has(extension)
    ? extension
    : "";
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function extensionFromContentType(contentType: string): string {
  if (contentType.includes("webm")) {
    return ".webm";
  }
  if (contentType.includes("quicktime")) {
    return ".mov";
  }
  if (contentType.startsWith("audio/mpeg")) {
    return ".mp3";
  }
  if (contentType.startsWith("audio/wav")) {
    return ".wav";
  }
  if (contentType.startsWith("audio/")) {
    return ".m4a";
  }
  if (contentType.startsWith("video/")) {
    return ".mp4";
  }
  return "";
}

function mediaKindFromExtension(extension: string): "source-audio" | "source-video" {
  return SOURCE_AUDIO_EXTENSIONS.has(extension) ? "source-audio" : "source-video";
}

function validateExtension(filePath: string, allowed: Set<string>): string {
  const extension = path.extname(filePath).toLowerCase();
  if (!allowed.has(extension)) {
    throw new Error(`不支持的素材格式：${extension || "无扩展名"}`);
  }
  return extension;
}

function extractFirstHttpUrl(value: string): string {
  const match = value.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match?.[0]) {
    return "";
  }

  const candidate = match[0].replace(/[)\]}>,，。；;、！!?？]+$/g, "");
  try {
    const url = new URL(candidate);
    return url.toString();
  } catch {
    return "";
  }
}

function describeSourceParserJobFailure(errorMessage: string): string {
  if (/fresh cookies/i.test(errorMessage)) {
    return `原视频解析失败：抖音要求服务端提供新的 cookies。请先在解析站更新 Douyin cookies，或换一个可公开解析的链接后再试。服务端原始错误：${errorMessage}`;
  }

  if (/private|login|permission|unauthorized/i.test(errorMessage)) {
    return `原视频解析失败：该链接可能需要登录、权限或不是公开可访问内容。服务端原始错误：${errorMessage}`;
  }

  return `原视频解析失败：${errorMessage}`;
}

function copyTaskFile(
  paths: AppPaths,
  taskId: string,
  sourcePath: string,
  relativePath: string
): void {
  const absolutePath = taskFilePath(paths, taskId, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.copyFileSync(sourcePath, absolutePath);
}

function writeTaskFile(
  paths: AppPaths,
  taskId: string,
  relativePath: string,
  content: string | Buffer
): void {
  const absolutePath = taskFilePath(paths, taskId, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function taskFilePath(paths: AppPaths, taskId: string, relativePath: string): string {
  return path.join(getTaskDirectory(paths, taskId), ...relativePath.split("/"));
}

function sanitizeBaseName(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "asset"
  );
}
