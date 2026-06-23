import fs from "node:fs";
import path from "node:path";
import type { ContentLanguage } from "../../shared/domain";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { defaultServiceSettings } from "../../shared/serviceConfig";
import { redactSecret } from "../security/redaction";
import {
  SubtitleFallbackProviderUnavailableError,
  type SubtitleFallbackInput,
  type SubtitleFallbackProvider,
  type SubtitleFallbackResult
} from "./subtitleFallbackProvider";

interface AsrConfigurationReader {
  getConfiguration: (providerId: "asr" | "llm") => ServiceConfiguration;
}

interface AsrCredentialReader {
  readCredential: (providerId: "asr" | "llm") => Promise<string | null>;
}

interface OpenAiAsrSubtitleProviderOptions {
  fetchImpl?: typeof fetch;
}

const OPENAI_AUDIO_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;

interface ActiveTranscriptionConfiguration {
  apiKey: string;
  baseUrl: string;
  modelName: string;
  providerLabel: string;
  usingSharedLlm: boolean;
}

export class OpenAiAsrSubtitleProvider implements SubtitleFallbackProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly configurations: AsrConfigurationReader,
    private readonly credentials: AsrCredentialReader,
    options: OpenAiAsrSubtitleProviderOptions = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createSubtitleFile(input: SubtitleFallbackInput): Promise<SubtitleFallbackResult> {
    const activeConfiguration = await this.resolveTranscriptionConfiguration();

    const sizeBytes = fs.statSync(input.avatarVideoPath).size;
    if (sizeBytes > OPENAI_AUDIO_UPLOAD_LIMIT_BYTES) {
      throw new Error("ASR 文件超过 OpenAI 25MB 上传限制，请先使用较短视频或后续音频抽取流程。");
    }

    const formData = new FormData();
    formData.append("model", activeConfiguration.modelName);
    formData.append("response_format", responseFormatForModel(activeConfiguration.modelName));
    formData.append("language", languageCode(input.task.contentLanguage));
    formData.append(
      "file",
      createMediaBlob(input.avatarVideoPath),
      path.basename(input.avatarVideoPath)
    );

    const response = await this.fetchImpl(
      `${normalizeBaseUrl(activeConfiguration.baseUrl)}/audio/transcriptions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${activeConfiguration.apiKey}`
        },
        body: formData
      }
    );

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `${activeConfiguration.providerLabel} 音频转写失败 (${response.status}): ${
          redactSecret(responseText.slice(0, 800)) || response.statusText
        }${activeConfiguration.usingSharedLlm ? "。当前复用的大模型配置不能完成音频转写，请在设置里启用 ASR 转写并填写支持音频转写的模型。" : ""}`
      );
    }

    const srt = normalizeTranscriptionToSrt(responseText);
    if (!srt) {
      throw new Error("ASR 字幕响应为空。");
    }

    return { srt };
  }

  private async resolveTranscriptionConfiguration(): Promise<ActiveTranscriptionConfiguration> {
    const asrConfiguration = this.configurations.getConfiguration("asr");
    const asrModelName = asrConfiguration.settings.modelName?.trim();
    if (asrConfiguration.settings.enabled !== false) {
      if (!asrModelName) {
        throw new SubtitleFallbackProviderUnavailableError(
          "ASR 已启用但模型名为空。请填写支持音频转写的模型，或关闭 ASR 复用大模型配置。"
        );
      }

      const apiKey = await this.credentials.readCredential("asr");
      if (!apiKey) {
        throw new SubtitleFallbackProviderUnavailableError(
          "ASR 已启用但 API Key 尚未配置。可以关闭 ASR 复用大模型配置，或填写 ASR API Key。"
        );
      }

      const baseUrl = asrConfiguration.settings.baseUrl || defaultServiceSettings("asr").baseUrl;
      if (!baseUrl) {
        throw new SubtitleFallbackProviderUnavailableError("ASR Base URL 尚未配置。");
      }

      return {
        apiKey,
        baseUrl,
        modelName: asrModelName,
        providerLabel: "ASR",
        usingSharedLlm: false
      };
    }

    const llmConfiguration = this.configurations.getConfiguration("llm");
    if (llmConfiguration.settings.enabled === false) {
      throw new SubtitleFallbackProviderUnavailableError(
        "ASR 未单独启用，且大模型服务未启用，无法做字幕兜底。"
      );
    }

    const apiKey = await this.credentials.readCredential("llm");
    if (!apiKey) {
      throw new SubtitleFallbackProviderUnavailableError(
        "ASR 未单独启用，且大模型 API Key 尚未配置，无法复用大模型做音频转写。"
      );
    }

    const modelName = llmConfiguration.settings.modelName?.trim();
    if (!modelName) {
      throw new SubtitleFallbackProviderUnavailableError(
        "ASR 未单独启用，且大模型模型名为空，无法复用大模型做音频转写。"
      );
    }

    const baseUrl = llmConfiguration.settings.baseUrl || defaultServiceSettings("llm").baseUrl;
    if (!baseUrl) {
      throw new SubtitleFallbackProviderUnavailableError("大模型 Base URL 尚未配置。");
    }

    return {
      apiKey,
      baseUrl,
      modelName,
      providerLabel: "大模型复用 ASR",
      usingSharedLlm: true
    };
  }
}

function createMediaBlob(mediaPath: string): Blob {
  return new Blob([fs.readFileSync(mediaPath)], { type: contentTypeFromPath(mediaPath) });
}

function contentTypeFromPath(mediaPath: string): string {
  const extension = path.extname(mediaPath).toLowerCase();
  if (extension === ".webm") {
    return "video/webm";
  }
  if (extension === ".wav") {
    return "audio/wav";
  }
  if (extension === ".mp3") {
    return "audio/mpeg";
  }
  if (extension === ".m4a") {
    return "audio/mp4";
  }
  return "video/mp4";
}

function languageCode(language: ContentLanguage): "zh" | "en" | "id" {
  if (language === "en-US") {
    return "en";
  }
  if (language === "id-ID") {
    return "id";
  }
  return "zh";
}

function responseFormatForModel(modelName: string): "srt" | "text" {
  return modelName.toLowerCase().includes("whisper") ? "srt" : "text";
}

function normalizeTranscriptionToSrt(responseText: string): string {
  const trimmed = responseText.trim();
  if (!trimmed) {
    return "";
  }

  if (looksLikeSrt(trimmed)) {
    return trimmed;
  }

  const segmentSrt = extractSrtFromSegmentResponse(trimmed);
  if (segmentSrt) {
    return segmentSrt;
  }

  throw new Error(
    "ASR 已返回文本但没有返回字幕时间轴。发布版不能使用纯估算字幕，请换用支持 SRT 或分段时间戳的 ASR 模型。"
  );
}

function looksLikeSrt(value: string): boolean {
  return /\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/.test(value);
}

function extractSrtFromSegmentResponse(value: string): string {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!Array.isArray(parsed.segments)) {
      return "";
    }

    const blocks = parsed.segments
      .map((segment, index) => {
        if (!isRecord(segment)) {
          return "";
        }

        const start = readNumber(segment.start);
        const end = readNumber(segment.end);
        const text = readText(segment.text);
        if (start === undefined || end === undefined || !text) {
          return "";
        }

        return [String(index + 1), `${formatSrtTime(start)} --> ${formatSrtTime(end)}`, text].join(
          "\n"
        );
      })
      .filter(Boolean);

    return blocks.join("\n\n");
  } catch {
    return "";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function formatSrtTime(value: number): string {
  const totalMilliseconds = Math.max(0, Math.round(value * 1000));
  const milliseconds = totalMilliseconds % 1000;
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${String(milliseconds).padStart(3, "0")}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
