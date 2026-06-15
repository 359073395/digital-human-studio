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
  getConfiguration: (providerId: "asr") => ServiceConfiguration;
}

interface AsrCredentialReader {
  readCredential: (providerId: "asr") => Promise<string | null>;
}

interface OpenAiAsrSubtitleProviderOptions {
  fetchImpl?: typeof fetch;
}

const OPENAI_AUDIO_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;

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
    const configuration = this.configurations.getConfiguration("asr");
    if (configuration.settings.enabled === false) {
      throw new SubtitleFallbackProviderUnavailableError("ASR 字幕兜底服务未启用。");
    }

    const apiKey = await this.credentials.readCredential("asr");
    if (!apiKey) {
      throw new SubtitleFallbackProviderUnavailableError("ASR API Key 尚未配置。");
    }

    const baseUrl = configuration.settings.baseUrl || defaultServiceSettings("asr").baseUrl;
    if (!baseUrl) {
      throw new SubtitleFallbackProviderUnavailableError("ASR Base URL 尚未配置。");
    }

    const sizeBytes = fs.statSync(input.avatarVideoPath).size;
    if (sizeBytes > OPENAI_AUDIO_UPLOAD_LIMIT_BYTES) {
      throw new Error("ASR 文件超过 OpenAI 25MB 上传限制，请先使用较短视频或后续音频抽取流程。");
    }

    const formData = new FormData();
    formData.append("model", configuration.settings.modelName || "whisper-1");
    formData.append("response_format", "srt");
    formData.append("language", languageCode(input.task.contentLanguage));
    formData.append(
      "file",
      createMediaBlob(input.avatarVideoPath),
      path.basename(input.avatarVideoPath)
    );

    const response = await this.fetchImpl(`${normalizeBaseUrl(baseUrl)}/audio/transcriptions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`
      },
      body: formData
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `ASR 字幕生成失败 (${response.status}): ${redactSecret(responseText.slice(0, 800)) || response.statusText}`
      );
    }

    const srt = responseText.trim();
    if (!srt) {
      throw new Error("ASR 字幕响应为空。");
    }

    return { srt };
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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
