import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
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
  mode: "audio-transcriptions" | "chat-audio";
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
    const uploadPath =
      activeConfiguration.mode === "chat-audio"
        ? prepareWavAudio(input.avatarVideoPath)
        : input.avatarVideoPath;

    const sizeBytes = fs.statSync(uploadPath).size;
    if (sizeBytes > OPENAI_AUDIO_UPLOAD_LIMIT_BYTES) {
      throw new Error(
        "ASR file is larger than 25MB. Please use a shorter video or compressed audio."
      );
    }

    const srt =
      activeConfiguration.mode === "chat-audio"
        ? await this.createSubtitleFileWithChatAudio(
            activeConfiguration,
            uploadPath,
            input.task.contentLanguage
          )
        : await this.createSubtitleFileWithAudioEndpoint(
            activeConfiguration,
            uploadPath,
            input.task.contentLanguage
          );

    if (!srt) {
      throw new Error("ASR returned an empty subtitle response.");
    }

    return { srt };
  }

  private async resolveTranscriptionConfiguration(): Promise<ActiveTranscriptionConfiguration> {
    const asrConfiguration = this.configurations.getConfiguration("asr");
    const asrDefaults = defaultServiceSettings("asr");
    const configuredAsrModelName = asrConfiguration.settings.modelName?.trim();

    if (asrConfiguration.settings.enabled !== false) {
      if (!configuredAsrModelName) {
        throw new SubtitleFallbackProviderUnavailableError(
          "ASR is enabled but the model name is empty. Choose an audio-capable model or disable standalone ASR."
        );
      }

      const apiKey = await this.credentials.readCredential("asr");
      if (!apiKey) {
        throw new SubtitleFallbackProviderUnavailableError(
          "ASR is enabled but no ASR API Key is saved. Save an ASR key, or disable standalone ASR to reuse the LLM key."
        );
      }

      const baseUrl = asrConfiguration.settings.baseUrl || asrDefaults.baseUrl;
      if (!baseUrl) {
        throw new SubtitleFallbackProviderUnavailableError("ASR Base URL is not configured.");
      }

      return {
        apiKey,
        baseUrl,
        modelName: configuredAsrModelName,
        mode: asrConfiguration.settings.asrMode || asrDefaults.asrMode || "chat-audio",
        providerLabel: "ASR",
        usingSharedLlm: false
      };
    }

    const llmConfiguration = this.configurations.getConfiguration("llm");
    if (llmConfiguration.settings.enabled === false) {
      throw new SubtitleFallbackProviderUnavailableError(
        "Standalone ASR is disabled and the LLM service is disabled, so subtitle fallback cannot run."
      );
    }

    const apiKey = await this.credentials.readCredential("llm");
    if (!apiKey) {
      throw new SubtitleFallbackProviderUnavailableError(
        "Standalone ASR is disabled and no LLM API Key is saved, so audio transcription cannot run."
      );
    }

    const baseUrl =
      asrConfiguration.settings.baseUrl ||
      asrDefaults.baseUrl ||
      llmConfiguration.settings.baseUrl ||
      defaultServiceSettings("llm").baseUrl;
    const modelName =
      configuredAsrModelName ||
      asrDefaults.modelName ||
      llmConfiguration.settings.modelName?.trim();
    const mode = asrConfiguration.settings.asrMode || asrDefaults.asrMode || "chat-audio";

    if (!baseUrl || !modelName) {
      throw new SubtitleFallbackProviderUnavailableError(
        "ASR default Base URL or model name is empty. Configure the ASR section or enable standalone ASR."
      );
    }

    return {
      apiKey,
      baseUrl,
      modelName,
      mode,
      providerLabel: "ASR default model with shared LLM key",
      usingSharedLlm: true
    };
  }

  private async createSubtitleFileWithAudioEndpoint(
    activeConfiguration: ActiveTranscriptionConfiguration,
    mediaPath: string,
    language: ContentLanguage
  ): Promise<string> {
    const formData = new FormData();
    formData.append("model", activeConfiguration.modelName);
    formData.append("response_format", "srt");
    formData.append("language", languageCode(language));
    formData.append("file", createMediaBlob(mediaPath), path.basename(mediaPath));

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
        `${activeConfiguration.providerLabel} audio transcription failed (${response.status}): ${
          redactSecret(responseText.slice(0, 800)) || response.statusText
        }${activeConfiguration.usingSharedLlm ? ". Configure a real audio-capable ASR model if this model cannot transcribe audio." : ""}`
      );
    }

    return normalizeTranscriptionToSrt(responseText);
  }

  private async createSubtitleFileWithChatAudio(
    activeConfiguration: ActiveTranscriptionConfiguration,
    audioPath: string,
    language: ContentLanguage
  ): Promise<string> {
    const response = await this.fetchImpl(
      `${normalizeBaseUrl(activeConfiguration.baseUrl)}/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${activeConfiguration.apiKey}`
        },
        body: JSON.stringify({
          model: activeConfiguration.modelName,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: [
                    "Transcribe the attached audio for final subtitles.",
                    "Return JSON only, without markdown fences.",
                    "Every segment must include numeric start_seconds, end_seconds, and text.",
                    `Target language hint: ${languageCode(language)}.`,
                    'Schema: {"transcript":"...","segments":[{"start_seconds":0,"end_seconds":1.2,"text":"..."}]}'
                  ].join("\n")
                },
                {
                  type: "input_audio",
                  input_audio: {
                    data: fs.readFileSync(audioPath).toString("base64"),
                    format: "wav"
                  }
                }
              ]
            }
          ],
          temperature: 0
        })
      }
    );

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `${activeConfiguration.providerLabel} Chat audio transcription failed (${response.status}): ${
          redactSecret(responseText.slice(0, 800)) || response.statusText
        }`
      );
    }

    return normalizeTranscriptionToSrt(readChatCompletionText(responseText));
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

function prepareWavAudio(mediaPath: string): string {
  if (path.extname(mediaPath).toLowerCase() === ".wav") {
    return mediaPath;
  }

  const outputPath = path.join(
    path.dirname(mediaPath),
    `${path.basename(mediaPath, path.extname(mediaPath))}-asr.wav`
  );
  const result = spawnSync(
    requireFfmpegPath(),
    ["-y", "-i", mediaPath, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", outputPath],
    {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 10 * 60 * 1000
    }
  );

  if (result.error) {
    throw new Error(`ASR audio extraction failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `ASR audio extraction failed: ${(result.stderr || result.stdout || "").slice(-1200)}`
    );
  }
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error("ASR audio extraction produced an empty wav file.");
  }

  return outputPath;
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
      return content.map((part) => (isRecord(part) ? readText(part.text) : "")).join("\n");
    }
  } catch {
    return responseText;
  }

  return "";
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
    "ASR returned text without subtitle timestamps. The release build cannot use estimated subtitles; choose an ASR model that returns SRT or segmented timestamps."
  );
}

function looksLikeSrt(value: string): boolean {
  return /\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/.test(value);
}

function extractSrtFromSegmentResponse(value: string): string {
  const parsed = parseJsonFromText(value);
  if (!parsed) {
    return "";
  }

  const inlineSrt = readText(parsed.srt);
  if (inlineSrt && looksLikeSrt(inlineSrt)) {
    return inlineSrt;
  }

  if (!Array.isArray(parsed.segments)) {
    return "";
  }

  const blocks = parsed.segments
    .map((segment, index) => {
      if (!isRecord(segment)) {
        return "";
      }

      const start =
        readNumber(segment.start_seconds) ??
        readNumber(segment.start) ??
        readNumber(segment.startTime);
      const end =
        readNumber(segment.end_seconds) ?? readNumber(segment.end) ?? readNumber(segment.endTime);
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
}

function parseJsonFromText(value: string): Record<string, unknown> | undefined {
  const trimmed = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
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

function requireFfmpegPath(): string {
  if (!ffmpegStaticPath) {
    throw new Error("Built-in FFmpeg was not found, so ASR audio extraction cannot run.");
  }
  return ffmpegStaticPath;
}
