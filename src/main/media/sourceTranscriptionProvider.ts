import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import type { ContentLanguage, MediaAsset, VideoTask } from "../../shared/domain";
import type { SourceTranscriptionResult } from "../../shared/scriptGeneration";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { defaultServiceSettings } from "../../shared/serviceConfig";
import { redactSecret } from "../security/redaction";
import { getTaskDirectory, type AppPaths } from "../storage/appPaths";

interface ConfigurationReader {
  getConfiguration: (providerId: "asr" | "llm") => ServiceConfiguration;
}

interface CredentialReader {
  readCredential: (providerId: "asr" | "llm") => Promise<string | null>;
}

export interface SourceTranscriptionProvider {
  transcribe(task: VideoTask, paths: AppPaths): Promise<SourceTranscriptionResult>;
}

interface ActiveTranscriptionRuntime {
  apiKey: string;
  baseUrl: string;
  modelName: string;
  mode: "audio-transcriptions" | "chat-audio";
  providerLabel: string;
}

interface NormalizedTranscription {
  transcript: string;
  srt: string;
  notes: string;
}

const MAX_AUDIO_UPLOAD_BYTES = 25 * 1024 * 1024;

export class OpenAiCompatibleSourceTranscriptionProvider implements SourceTranscriptionProvider {
  constructor(
    private readonly configurations: ConfigurationReader,
    private readonly credentials: CredentialReader,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async transcribe(task: VideoTask, paths: AppPaths): Promise<SourceTranscriptionResult> {
    const runtime = await this.resolveRuntime();
    const sourceAsset = findSourceMediaAsset(task);
    if (!sourceAsset) {
      throw new Error("请先下载或上传原视频/音频，再提取文案。");
    }

    const sourcePath = absoluteTaskPath(paths, task.id, sourceAsset.relativePath);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`源素材文件不存在：${sourceAsset.relativePath}`);
    }

    const audioPath = prepareAudioForTranscription(paths, task.id, sourcePath);
    const sizeBytes = fs.statSync(audioPath).size;
    if (sizeBytes > MAX_AUDIO_UPLOAD_BYTES) {
      throw new Error("音频文件超过 25MB，请先使用更短素材或压缩后再提取文案。");
    }

    const normalized =
      runtime.mode === "chat-audio"
        ? await this.transcribeWithChatAudio(runtime, audioPath, task.contentLanguage)
        : await this.transcribeWithAudioEndpoint(runtime, audioPath, task.contentLanguage);

    writeTaskFile(paths, task.id, "source/source-transcript.txt", normalized.transcript);
    writeTaskFile(paths, task.id, "subtitles/source-transcript.srt", normalized.srt);

    return {
      transcript: normalized.transcript,
      contentLanguage: task.contentLanguage,
      notes: normalized.notes
    };
  }

  private async resolveRuntime(): Promise<ActiveTranscriptionRuntime> {
    const asrConfiguration = this.configurations.getConfiguration("asr");
    const asrDefaults = defaultServiceSettings("asr");
    if (asrConfiguration.settings.enabled !== false) {
      const asrCredential = await this.credentials.readCredential("asr");
      const llmCredential = await this.credentials.readCredential("llm");
      const apiKey = asrCredential || llmCredential || "";
      if (!apiKey) {
        throw new Error("ASR 已启用，但没有保存 ASR API Key；也没有可复用的大模型 API Key。");
      }

      return {
        apiKey,
        baseUrl: asrConfiguration.settings.baseUrl || asrDefaults.baseUrl || "",
        modelName: asrConfiguration.settings.modelName || asrDefaults.modelName || "",
        mode: asrConfiguration.settings.asrMode || asrDefaults.asrMode || "chat-audio",
        providerLabel: asrCredential ? "ASR" : "ASR 复用大模型 Key"
      };
    }

    const llmConfiguration = this.configurations.getConfiguration("llm");
    const apiKey = await this.credentials.readCredential("llm");
    if (!apiKey) {
      throw new Error("ASR 未启用，且大模型 API Key 尚未配置，无法提取文案。");
    }

    return {
      apiKey,
      baseUrl:
        asrConfiguration.settings.baseUrl ||
        asrDefaults.baseUrl ||
        llmConfiguration.settings.baseUrl ||
        defaultServiceSettings("llm").baseUrl ||
        "",
      modelName:
        asrConfiguration.settings.modelName ||
        asrDefaults.modelName ||
        llmConfiguration.settings.modelName ||
        defaultServiceSettings("llm").modelName ||
        "",
      mode: asrConfiguration.settings.asrMode || asrDefaults.asrMode || "chat-audio",
      providerLabel: "大模型复用 ASR"
    };
  }

  private async transcribeWithAudioEndpoint(
    runtime: ActiveTranscriptionRuntime,
    audioPath: string,
    language: ContentLanguage
  ): Promise<NormalizedTranscription> {
    const formData = new FormData();
    formData.append("model", runtime.modelName);
    formData.append("response_format", "srt");
    formData.append("language", languageCode(language));
    formData.append("file", createAudioBlob(audioPath), path.basename(audioPath));

    const response = await this.fetchImpl(
      `${normalizeBaseUrl(runtime.baseUrl)}/audio/transcriptions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${runtime.apiKey}`
        },
        body: formData
      }
    );
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `${runtime.providerLabel} 音频转写失败 (${response.status})：${
          redactSecret(responseText.slice(0, 800)) || response.statusText
        }`
      );
    }

    const srt = normalizeTranscriptionToSrt(responseText);
    return {
      transcript: srtToPlainText(srt),
      srt,
      notes: `${runtime.providerLabel} 已通过 audio/transcriptions 生成真实转写。`
    };
  }

  private async transcribeWithChatAudio(
    runtime: ActiveTranscriptionRuntime,
    audioPath: string,
    language: ContentLanguage
  ): Promise<NormalizedTranscription> {
    const audioBase64 = fs.readFileSync(audioPath).toString("base64");
    const response = await this.fetchImpl(`${normalizeBaseUrl(runtime.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${runtime.apiKey}`
      },
      body: JSON.stringify({
        model: runtime.modelName,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Transcribe the attached audio for a short-video workflow.",
                  "Return JSON only, without markdown fences.",
                  `Target language hint: ${languageCode(language)}.`,
                  'Schema: {"transcript":"...","segments":[{"start_seconds":0,"end_seconds":1.2,"text":"..."}],"notes":"..."}'
                ].join("\n")
              },
              {
                type: "input_audio",
                input_audio: {
                  data: audioBase64,
                  format: "wav"
                }
              }
            ]
          }
        ],
        temperature: 0
      })
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `${runtime.providerLabel} Chat 音频转写失败 (${response.status})：${
          redactSecret(responseText.slice(0, 800)) || response.statusText
        }`
      );
    }

    const content = readChatCompletionText(responseText);
    const normalized = normalizeChatAudioResponse(content);
    if (!normalized.transcript.trim()) {
      throw new Error("Chat 音频转写没有返回有效文案。");
    }

    if (!normalized.srt.trim()) {
      throw new Error(
        "Chat audio transcription returned text but no segmented timestamps. Choose a model that returns SRT or JSON segments."
      );
    }

    return {
      ...normalized,
      notes:
        normalized.notes ||
        `${runtime.providerLabel} 已通过 chat/completions 音频输入生成真实转写。`
    };
  }
}

function findSourceMediaAsset(task: VideoTask): MediaAsset | undefined {
  return [...task.mediaAssets]
    .reverse()
    .find((asset) => asset.kind === "source-video" || asset.kind === "source-audio");
}

function prepareAudioForTranscription(paths: AppPaths, taskId: string, sourcePath: string): string {
  const extension = path.extname(sourcePath).toLowerCase();
  if (extension === ".wav") {
    return sourcePath;
  }

  const outputPath = absoluteTaskPath(paths, taskId, "source/extracted-audio.wav");
  const ffmpegPath = requireFfmpegPath();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const args = [
    "-y",
    "-i",
    sourcePath,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    "16000",
    "-ac",
    "1",
    outputPath
  ];
  const result = spawnSync(ffmpegPath, args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 10 * 60 * 1000
  });

  if (result.error) {
    throw new Error(`音频抽取失败：${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`音频抽取失败：${(result.stderr || result.stdout || "").slice(-1200)}`);
  }
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error("音频抽取完成但文件为空。");
  }

  return outputPath;
}

function createAudioBlob(audioPath: string): Blob {
  return new Blob([fs.readFileSync(audioPath)], { type: contentTypeFromPath(audioPath) });
}

function contentTypeFromPath(audioPath: string): string {
  const extension = path.extname(audioPath).toLowerCase();
  if (extension === ".mp3") {
    return "audio/mpeg";
  }
  if (extension === ".m4a" || extension === ".aac") {
    return "audio/mp4";
  }
  if (extension === ".ogg") {
    return "audio/ogg";
  }
  return "audio/wav";
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

function normalizeChatAudioResponse(value: string): NormalizedTranscription {
  const parsed = parseJsonFromText(value);
  if (parsed) {
    const transcript = readString(parsed, "transcript") || segmentsToPlainText(parsed.segments);
    const inlineSrt = readString(parsed, "srt");
    const srt = looksLikeSrt(inlineSrt) ? inlineSrt : segmentsToSrt(parsed.segments);
    return {
      transcript,
      srt,
      notes: readString(parsed, "notes")
    };
  }

  const transcript = value.replace(/```[\s\S]*?```/g, "").trim();
  return {
    transcript,
    srt: looksLikeSrt(transcript) ? transcript : "",
    notes: "模型返回了纯文本，已生成单段字幕；建议使用支持分段时间戳的模型。"
  };
}

function normalizeTranscriptionToSrt(responseText: string): string {
  const trimmed = responseText.trim();
  if (!trimmed) {
    return "";
  }
  if (looksLikeSrt(trimmed)) {
    return trimmed;
  }
  const parsed = parseJsonFromText(trimmed);
  if (parsed) {
    const inlineSrt = readString(parsed, "srt");
    return looksLikeSrt(inlineSrt) ? inlineSrt : segmentsToSrt(parsed.segments);
  }
  throw new Error(
    "ASR returned text without subtitle timestamps. Choose a model that returns SRT or segmented timestamps."
  );
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

function segmentsToPlainText(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .map((segment) => (isRecord(segment) ? readString(segment, "text") : ""))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function segmentsToSrt(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  const blocks = value
    .map((segment, index) => {
      if (!isRecord(segment)) {
        return "";
      }
      const start =
        readNumber(segment, "start_seconds") ??
        readNumber(segment, "start") ??
        readNumber(segment, "startTime");
      const end =
        readNumber(segment, "end_seconds") ??
        readNumber(segment, "end") ??
        readNumber(segment, "endTime");
      const text = readString(segment, "text");
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

function srtToPlainText(srt: string): string {
  return srt
    .split(/\r?\n/)
    .filter((line) => !/^\d+$/.test(line.trim()))
    .filter((line) => !line.includes("-->"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeSrt(value: string): boolean {
  return /\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/.test(value);
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

function absoluteTaskPath(paths: AppPaths, taskId: string, relativePath: string): string {
  return path.join(getTaskDirectory(paths, taskId), ...relativePath.split("/"));
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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function requireFfmpegPath(): string {
  if (!ffmpegStaticPath) {
    throw new Error("未找到内置 FFmpeg，无法抽取音频。");
  }
  return ffmpegStaticPath;
}
