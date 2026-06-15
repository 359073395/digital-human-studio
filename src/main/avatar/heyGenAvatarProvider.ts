import type { OutputPreset, VideoTask } from "../../shared/domain";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { defaultServiceSettings } from "../../shared/serviceConfig";
import { redactSecret } from "../security/redaction";
import {
  AvatarProviderUnavailableError,
  type AvatarProvider,
  type AvatarRenderInput,
  type AvatarRenderResult
} from "./avatarProvider";

interface HeyGenConfigurationReader {
  getConfiguration: (providerId: "heygen") => ServiceConfiguration;
}

interface HeyGenCredentialReader {
  readCredential: (providerId: "heygen") => Promise<string | null>;
}

interface HeyGenAvatarProviderOptions {
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  fetchImpl?: typeof fetch;
}

interface HeyGenCreateVideoData {
  video_id?: string;
  videoId?: string;
}

interface HeyGenVideoStatusData {
  status?: string;
  video_url?: string;
  videoUrl?: string;
  caption_url?: string;
  captionUrl?: string;
  subtitle_url?: string;
  subtitleUrl?: string;
  thumbnail_url?: string;
  thumbnailUrl?: string;
  duration?: number;
  failure_message?: string;
  failureMessage?: string;
  failure_reason?: string;
  failureReason?: string;
}

interface HeyGenEnvelope<T> {
  data?: T;
  error?: unknown;
  message?: string;
}

const FINAL_FAILURE_STATUSES = new Set(["failed", "failure", "error"]);

export class HeyGenAvatarProvider implements AvatarProvider {
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly configurations: HeyGenConfigurationReader,
    private readonly credentials: HeyGenCredentialReader,
    options: HeyGenAvatarProviderOptions = {}
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.maxPollAttempts = options.maxPollAttempts ?? 90;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async renderAvatar(input: AvatarRenderInput): Promise<AvatarRenderResult> {
    const configuration = this.configurations.getConfiguration("heygen");
    if (configuration.settings.enabled === false) {
      throw new AvatarProviderUnavailableError("HeyGen 服务未启用。");
    }

    const apiKey = await this.credentials.readCredential("heygen");
    if (!apiKey) {
      throw new AvatarProviderUnavailableError("HeyGen API Key 尚未配置。");
    }

    const avatarId = configuration.settings.avatarId?.trim();
    if (!avatarId) {
      throw new AvatarProviderUnavailableError("HeyGen Avatar ID 尚未配置。");
    }

    const baseUrl = configuration.settings.baseUrl || defaultServiceSettings("heygen").baseUrl;
    if (!baseUrl) {
      throw new AvatarProviderUnavailableError("HeyGen Base URL 尚未配置。");
    }

    const created = await this.createVideo({
      apiKey,
      baseUrl,
      configuration,
      input,
      avatarId
    });

    return this.pollVideo({
      apiKey,
      baseUrl,
      providerVideoId: created,
      preset: input.preset
    });
  }

  private async createVideo(input: {
    apiKey: string;
    baseUrl: string;
    configuration: ServiceConfiguration;
    input: AvatarRenderInput;
    avatarId: string;
  }): Promise<string> {
    const script = selectScript(input.input.task);
    const response = await requestJson<HeyGenEnvelope<HeyGenCreateVideoData>>(
      this.fetchImpl,
      `${normalizeBaseUrl(input.baseUrl)}/v3/videos`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `${input.input.task.id}-${input.input.preset.id}`,
          "x-api-key": input.apiKey
        },
        body: JSON.stringify(
          buildCreateVideoBody(input.input, input.configuration, input.avatarId, script)
        )
      }
    );

    const providerVideoId = response.data?.video_id ?? response.data?.videoId;
    if (!providerVideoId) {
      throw new Error("HeyGen 创建视频响应缺少 video_id。");
    }

    return providerVideoId;
  }

  private async pollVideo(input: {
    apiKey: string;
    baseUrl: string;
    providerVideoId: string;
    preset: OutputPreset;
  }): Promise<AvatarRenderResult> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
      const response = await requestJson<HeyGenEnvelope<HeyGenVideoStatusData>>(
        this.fetchImpl,
        `${normalizeBaseUrl(input.baseUrl)}/v3/videos/${encodeURIComponent(input.providerVideoId)}`,
        {
          method: "GET",
          headers: {
            "x-api-key": input.apiKey
          }
        }
      );

      const data = response.data;
      const status = data?.status?.toLowerCase();
      const videoUrl = data?.video_url ?? data?.videoUrl;
      if (videoUrl) {
        return {
          presetId: input.preset.id,
          providerVideoId: input.providerVideoId,
          videoUrl,
          captionUrl:
            data?.caption_url ?? data?.captionUrl ?? data?.subtitle_url ?? data?.subtitleUrl,
          thumbnailUrl: data?.thumbnail_url ?? data?.thumbnailUrl,
          durationSeconds: data?.duration
        };
      }

      if (status && FINAL_FAILURE_STATUSES.has(status)) {
        throw new Error(
          data?.failure_message ??
            data?.failureMessage ??
            data?.failure_reason ??
            data?.failureReason ??
            `HeyGen 视频生成失败：${status}`
        );
      }

      await delay(this.pollIntervalMs);
    }

    throw new Error("HeyGen 视频生成超时，请稍后重试。");
  }
}

function buildCreateVideoBody(
  input: AvatarRenderInput,
  configuration: ServiceConfiguration,
  avatarId: string,
  script: string
) {
  return {
    type: "avatar",
    avatar_id: avatarId,
    voice_id: configuration.settings.voiceId || undefined,
    script,
    title: `${input.task.title} - ${input.preset.label}`,
    aspect_ratio: input.preset.aspectRatio,
    resolution: configuration.settings.resolution ?? "720p",
    output_format: "mp4",
    caption: {
      file_format: "srt",
      style: "default"
    },
    voice_settings: {
      locale: input.task.contentLanguage
    }
  };
}

function selectScript(task: VideoTask): string {
  const script = (task.finalScript || task.sourceScript).trim();
  if (!script) {
    throw new Error("请先生成或填写脚本，再生成数字人视频。");
  }

  return script;
}

async function requestJson<T>(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<T> {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `HeyGen 请求失败 (${response.status}): ${redactSecret(text.slice(0, 800)) || response.statusText}`
    );
  }

  try {
    const parsed = JSON.parse(text) as HeyGenEnvelope<unknown>;
    if (parsed.error) {
      throw new Error(`HeyGen 返回错误：${redactSecret(String(parsed.error))}`);
    }
    if (parsed.message && parsed.message.toLowerCase().includes("error")) {
      throw new Error(`HeyGen 返回错误：${redactSecret(parsed.message)}`);
    }
    return parsed as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("HeyGen 响应不是有效 JSON。", { cause: error });
    }
    throw error;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}
