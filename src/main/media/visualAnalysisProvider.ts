import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import type { MediaAsset, VideoTask } from "../../shared/domain";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { defaultServiceSettings } from "../../shared/serviceConfig";
import { redactSecret } from "../security/redaction";
import { getTaskDirectory, type AppPaths } from "../storage/appPaths";

interface ConfigurationReader {
  getConfiguration: (providerId: "llm") => ServiceConfiguration;
}

interface CredentialReader {
  readCredential: (providerId: "llm") => Promise<string | null>;
}

export interface VisualAnalysisProvider {
  analyze(input: {
    task: VideoTask;
    paths: AppPaths;
    sourceAssets: MediaAsset[];
    originalVideoUrl?: string;
  }): Promise<string>;
}

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export class OpenAiCompatibleVisualAnalysisProvider implements VisualAnalysisProvider {
  constructor(
    private readonly configurations: ConfigurationReader,
    private readonly credentials: CredentialReader,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async analyze(input: {
    task: VideoTask;
    paths: AppPaths;
    sourceAssets: MediaAsset[];
    originalVideoUrl?: string;
  }): Promise<string> {
    const configuration = this.configurations.getConfiguration("llm");
    if (configuration.settings.enabled === false) {
      throw new Error("大模型服务未启用，无法做真实画面分析。");
    }
    const apiKey = await this.credentials.readCredential("llm");
    if (!apiKey) {
      throw new Error("大模型 API Key 尚未配置，无法做真实画面分析。");
    }
    const baseUrl = configuration.settings.baseUrl || defaultServiceSettings("llm").baseUrl;
    const modelName = configuration.settings.modelName || defaultServiceSettings("llm").modelName;
    if (!baseUrl || !modelName) {
      throw new Error("大模型 Base URL 或模型名为空，无法做真实画面分析。");
    }

    const framePaths = collectVisualFrames(input.paths, input.task.id, input.sourceAssets);
    if (framePaths.length === 0) {
      throw new Error("没有可分析的本地画面素材。请先下载或上传原视频/图片素材。");
    }

    const content = [
      {
        type: "text",
        text: buildVisualAnalysisPrompt(input.task, input.originalVideoUrl, input.sourceAssets)
      },
      ...framePaths.map((framePath) => ({
        type: "image_url",
        image_url: {
          url: createDataUrl(framePath)
        }
      }))
    ];

    const response = await this.fetchImpl(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: "user", content }],
        temperature: 0.2
      })
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `画面分析失败 (${response.status})：${
          redactSecret(responseText.slice(0, 800)) || response.statusText
        }`
      );
    }

    const analysis = readChatCompletionText(responseText).trim();
    if (!analysis) {
      throw new Error("画面分析模型没有返回内容。");
    }

    return [
      "# 画面分析",
      "",
      `- 模型：${modelName}`,
      `- 原视频链接：${input.originalVideoUrl || "未填写"}`,
      `- 分析帧数：${framePaths.length}`,
      "",
      analysis
    ].join("\n");
  }
}

function collectVisualFrames(
  paths: AppPaths,
  taskId: string,
  sourceAssets: MediaAsset[]
): string[] {
  const taskDirectory = getTaskDirectory(paths, taskId);
  const frameRoot = path.join(taskDirectory, "source", "visual-frames");
  fs.mkdirSync(frameRoot, { recursive: true });
  const frames: string[] = [];

  for (const [index, asset] of sourceAssets.entries()) {
    const absolutePath = path.join(taskDirectory, ...asset.relativePath.split("/"));
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    const extension = path.extname(absolutePath).toLowerCase();
    if (IMAGE_EXTENSIONS.has(extension)) {
      frames.push(absolutePath);
      continue;
    }
    if (!VIDEO_EXTENSIONS.has(extension)) {
      continue;
    }
    frames.push(...extractFrames(absolutePath, frameRoot, index + 1));
  }

  return frames.slice(0, 8);
}

function extractFrames(videoPath: string, frameRoot: string, assetIndex: number): string[] {
  const ffmpegPath = requireFfmpegPath();
  const outputPattern = path.join(frameRoot, `asset-${assetIndex}-frame-%02d.jpg`);
  const result = spawnSync(
    ffmpegPath,
    ["-y", "-i", videoPath, "-vf", "fps=1/3,scale=720:-1", "-frames:v", "4", outputPattern],
    {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 10 * 60 * 1000
    }
  );

  if (result.error) {
    throw new Error(`视频抽帧失败：${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`视频抽帧失败：${(result.stderr || result.stdout || "").slice(-1200)}`);
  }

  return fs
    .readdirSync(frameRoot)
    .filter((fileName) => fileName.startsWith(`asset-${assetIndex}-frame-`))
    .sort()
    .map((fileName) => path.join(frameRoot, fileName))
    .filter((filePath) => fs.statSync(filePath).size > 0);
}

function buildVisualAnalysisPrompt(
  task: VideoTask,
  originalVideoUrl: string | undefined,
  sourceAssets: MediaAsset[]
): string {
  const assets = sourceAssets.map(
    (asset, index) => `${index + 1}. ${asset.kind}: ${asset.relativePath}`
  );
  return [
    "You are analyzing short-video reference material for a creator video workbench.",
    "Return Chinese Markdown only.",
    "Do not copy protected wording or creator-specific catchphrases.",
    "Analyze the supplied frames as a video storyboard, even if exact timestamps are approximate.",
    "",
    `Generation mode: ${task.generationMode}`,
    `Content language: ${task.contentLanguage}`,
    `Original URL: ${originalVideoUrl || "not provided"}`,
    `Assets:\n${assets.join("\n")}`,
    "",
    "Required sections:",
    "## 镜头时间线",
    "List approximate time/order, visible subject, on-screen text, camera framing, and action.",
    "## 爆款结构",
    "Identify hook, conflict, proof, product or topic demonstration, rhythm, and CTA.",
    "## 可复刻方法",
    "Describe reusable structure and storyboard prompts without copying exact expression.",
    "## 风险与缺失",
    "Mention unclear content, missing audio/transcript, and any compliance risks."
  ].join("\n");
}

function createDataUrl(filePath: string): string {
  return `data:${mimeTypeFromPath(filePath)};base64,${fs.readFileSync(filePath).toString("base64")}`;
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

function readChatCompletionText(responseText: string): string {
  try {
    const parsed = JSON.parse(responseText) as Record<string, unknown>;
    const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
    const first = choices[0];
    if (!isRecord(first) || !isRecord(first.message)) {
      return "";
    }
    const content = first.message.content;
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content.map((part) => (isRecord(part) ? readString(part, "text") : "")).join("\n");
    }
  } catch {
    return responseText;
  }

  return "";
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function requireFfmpegPath(): string {
  if (!ffmpegStaticPath) {
    throw new Error("未找到内置 FFmpeg，无法抽取视频画面。");
  }
  return ffmpegStaticPath;
}
