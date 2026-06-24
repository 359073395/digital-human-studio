import fs from "node:fs";
import path from "node:path";
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
import { buildHeyGenAuthHeaders, readHeyGenCredentialForRequest } from "./heyGenAuth";
import { normalizeHeyGenBaseUrl } from "./heyGenUrls";

interface HeyGenConfigurationReader {
  getConfiguration: (providerId: "heygen") => ServiceConfiguration;
}

interface HeyGenCredentialReader {
  readCredential: (providerId: "heygen") => Promise<string | null>;
  saveCredential?: (providerId: "heygen", secret: string) => Promise<void>;
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

interface HeyGenCreateVideoAgentData {
  session_id?: string;
  sessionId?: string;
  video_id?: string;
  videoId?: string;
}

interface HeyGenAssetUploadData {
  asset_id?: string;
  assetId?: string;
}

interface HeyGenVideoAgentSessionData {
  status?: string;
  progress?: number;
  video_id?: string;
  videoId?: string;
  failure_message?: string;
  failureMessage?: string;
  failure_reason?: string;
  failureReason?: string;
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

type UnknownRecord = Record<string, unknown>;

interface HeyGenEnvelope<T> {
  data?: T;
  error?: unknown;
  message?: string;
}

const FINAL_FAILURE_STATUSES = new Set(["failed", "failure", "error"]);
const API_CREDIT_ERROR_MARKERS = [
  "insufficient credit",
  "insufficient api credits",
  "requires 'api' credits",
  "api credits"
];
const DEFAULT_HEYGEN_VOICE_IDS: Record<VideoTask["contentLanguage"], string> = {
  "zh-CN": "dMkR1XwIkarpNqWUJLnX",
  "en-US": "d2f4f24783d04e22ab49ee8fdc3715e0",
  "id-ID": "06e81a5d7c8b41818d3f0b38f7cf15a1"
};

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
    this.maxPollAttempts = options.maxPollAttempts ?? 540;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async renderAvatar(input: AvatarRenderInput): Promise<AvatarRenderResult> {
    const configuration = this.configurations.getConfiguration("heygen");
    if (configuration.settings.enabled === false) {
      throw new AvatarProviderUnavailableError("HeyGen 服务未启用。");
    }

    const apiKey = await readHeyGenCredentialForRequest(
      configuration,
      this.credentials,
      this.fetchImpl
    );
    if (!apiKey) {
      throw new AvatarProviderUnavailableError("HeyGen 凭据尚未配置。");
    }

    const baseUrl = configuration.settings.baseUrl || defaultServiceSettings("heygen").baseUrl;
    if (!baseUrl) {
      throw new AvatarProviderUnavailableError("HeyGen Base URL 尚未配置。");
    }

    const avatarId = await this.resolveAvatarId({
      apiKey,
      baseUrl,
      configuration,
      task: input.task,
      preset: input.preset
    });

    const route = resolveGenerationRoute(configuration, input.task);

    try {
      if (route === "video-agent") {
        const created = await this.createVideoAgent({
          apiKey,
          baseUrl,
          configuration,
          input,
          avatarId: avatarId || undefined
        });

        return await this.pollVideo({
          apiKey,
          baseUrl,
          configuration,
          providerVideoId: created.providerVideoId,
          preset: input.preset
        });
      }

      const created = await this.createVideo({
        apiKey,
        baseUrl,
        configuration,
        input,
        avatarId: avatarId || undefined
      });

      return await this.pollVideo({
        apiKey,
        baseUrl,
        configuration,
        providerVideoId: created,
        preset: input.preset
      });
    } catch (error) {
      if (
        route === "direct-video" &&
        isApiCreditError(error) &&
        canFallbackToVideoAgent(input.task)
      ) {
        try {
          const fallbackCreated = await this.createVideoAgent({
            apiKey,
            baseUrl,
            configuration,
            input,
            avatarId: avatarId || undefined
          });

          return await this.pollVideo({
            apiKey,
            baseUrl,
            configuration,
            providerVideoId: fallbackCreated.providerVideoId,
            preset: input.preset
          });
        } catch (fallbackError) {
          throw decorateHeyGenRenderError(
            new Error(
              `${readErrorMessage(error)}。已自动尝试 HeyGen Video Agent 会员路由，但仍失败：${readErrorMessage(
                fallbackError
              )}`,
              { cause: fallbackError }
            ),
            configuration
          );
        }
      }

      throw decorateHeyGenRenderError(error, configuration);
    }
  }

  private async createVideo(input: {
    apiKey: string;
    baseUrl: string;
    configuration: ServiceConfiguration;
    input: AvatarRenderInput;
    avatarId?: string;
  }): Promise<string> {
    const script = selectScript(input.input.task);
    const heyGenImageAssetId =
      input.input.task.avatarMode === "image-presenter"
        ? await this.uploadImageAsset(
            input.apiKey,
            input.baseUrl,
            input.configuration,
            input.input.imagePath
          )
        : undefined;
    const response = await requestJson<HeyGenEnvelope<HeyGenCreateVideoData>>(
      this.fetchImpl,
      `${normalizeHeyGenBaseUrl(input.baseUrl)}/v3/videos`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `${input.input.task.id}-${input.input.preset.id}`,
          ...buildHeyGenAuthHeaders(input.configuration, input.apiKey)
        },
        body: JSON.stringify(
          buildCreateVideoBody({
            input: input.input,
            configuration: input.configuration,
            avatarId: input.avatarId,
            script,
            heyGenImageAssetId
          })
        )
      }
    );

    const providerVideoId = response.data?.video_id ?? response.data?.videoId;
    if (!providerVideoId) {
      throw new Error("HeyGen 创建视频响应缺少 video_id。");
    }

    return providerVideoId;
  }

  private async createVideoAgent(input: {
    apiKey: string;
    baseUrl: string;
    configuration: ServiceConfiguration;
    input: AvatarRenderInput;
    avatarId?: string;
  }): Promise<{ providerVideoId: string; sessionId: string }> {
    if (!input.avatarId) {
      throw new AvatarProviderUnavailableError("HeyGen Video Agent 需要先选择可用 Avatar。");
    }

    const script = selectScript(input.input.task);
    const response = await requestJson<HeyGenEnvelope<HeyGenCreateVideoAgentData>>(
      this.fetchImpl,
      `${normalizeHeyGenBaseUrl(input.baseUrl)}/v3/video-agents`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `${input.input.task.id}-${input.input.preset.id}-video-agent`,
          ...buildHeyGenAuthHeaders(input.configuration, input.apiKey)
        },
        body: JSON.stringify(
          buildCreateVideoAgentBody({
            input: input.input,
            configuration: input.configuration,
            avatarId: input.avatarId,
            script
          })
        )
      }
    );

    const sessionId = response.data?.session_id ?? response.data?.sessionId;
    const immediateVideoId = response.data?.video_id ?? response.data?.videoId;
    if (immediateVideoId && sessionId) {
      return { providerVideoId: immediateVideoId, sessionId };
    }
    if (!sessionId) {
      throw new Error("HeyGen Video Agent 创建响应缺少 session_id。");
    }

    const providerVideoId = await this.pollVideoAgentSession({
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      configuration: input.configuration,
      sessionId
    });
    return { providerVideoId, sessionId };
  }

  private async uploadImageAsset(
    apiKey: string,
    baseUrl: string,
    configuration: ServiceConfiguration,
    imagePath: string | undefined
  ): Promise<string> {
    if (!imagePath) {
      throw new Error("请先生成人物商品图。");
    }

    const formData = new FormData();
    formData.append("file", createImageBlob(imagePath), path.basename(imagePath));
    const response = await requestJson<HeyGenEnvelope<HeyGenAssetUploadData>>(
      this.fetchImpl,
      `${normalizeHeyGenBaseUrl(baseUrl)}/v3/assets`,
      {
        method: "POST",
        headers: buildHeyGenAuthHeaders(configuration, apiKey),
        body: formData
      }
    );

    const assetId = response.data?.asset_id ?? response.data?.assetId;
    if (!assetId) {
      throw new Error("HeyGen 图片上传响应缺少 asset_id。");
    }

    return assetId;
  }

  private async pollVideo(input: {
    apiKey: string;
    baseUrl: string;
    configuration: ServiceConfiguration;
    providerVideoId: string;
    preset: OutputPreset;
  }): Promise<AvatarRenderResult> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
      const response = await requestJson<HeyGenEnvelope<HeyGenVideoStatusData>>(
        this.fetchImpl,
        `${normalizeHeyGenBaseUrl(input.baseUrl)}/v3/videos/${encodeURIComponent(input.providerVideoId)}`,
        {
          method: "GET",
          headers: buildHeyGenAuthHeaders(input.configuration, input.apiKey)
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

  private async pollVideoAgentSession(input: {
    apiKey: string;
    baseUrl: string;
    configuration: ServiceConfiguration;
    sessionId: string;
  }): Promise<string> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
      const response = await requestJson<HeyGenEnvelope<HeyGenVideoAgentSessionData>>(
        this.fetchImpl,
        `${normalizeHeyGenBaseUrl(input.baseUrl)}/v3/video-agents/${encodeURIComponent(
          input.sessionId
        )}`,
        {
          method: "GET",
          headers: buildHeyGenAuthHeaders(input.configuration, input.apiKey)
        }
      );

      const data = response.data;
      const providerVideoId = data?.video_id ?? data?.videoId;
      if (providerVideoId) {
        return providerVideoId;
      }

      const status = data?.status?.toLowerCase();
      if (status && FINAL_FAILURE_STATUSES.has(status)) {
        throw new Error(
          data?.failure_message ??
            data?.failureMessage ??
            data?.failure_reason ??
            data?.failureReason ??
            `HeyGen Video Agent 生成失败：${status}`
        );
      }

      await delay(this.pollIntervalMs);
    }

    throw new Error("HeyGen Video Agent 生成超时，请稍后重试。");
  }

  private async resolveAvatarId(input: {
    apiKey: string;
    baseUrl: string;
    configuration: ServiceConfiguration;
    task: VideoTask;
    preset: OutputPreset;
  }): Promise<string | undefined> {
    if (input.task.avatarMode !== "preset-avatar") {
      return undefined;
    }

    const groupId = input.task.presetAvatarGroupId?.trim();
    const fallbackAvatarId =
      input.task.presetAvatarId?.trim() || input.configuration.settings.avatarId?.trim();

    if (!groupId) {
      if (!fallbackAvatarId) {
        throw new AvatarProviderUnavailableError("HeyGen Avatar ID 尚未配置。");
      }
      return fallbackAvatarId;
    }

    try {
      const looks = await this.listAvatarLooksForGroup(input, groupId);
      const preferredOrientation = input.preset.aspectRatio === "16:9" ? "landscape" : "portrait";
      const selected =
        looks.find((look) => readLookOrientation(look) === preferredOrientation) ??
        looks.find((look) => readLookOrientation(look) === "square") ??
        looks.find((look) => readLookId(look) === fallbackAvatarId) ??
        looks[0];
      const selectedId = selected ? readLookId(selected) : "";
      if (selectedId) {
        return selectedId;
      }
    } catch {
      if (fallbackAvatarId) {
        return fallbackAvatarId;
      }
      throw new AvatarProviderUnavailableError("HeyGen Avatar Group 已配置，但未读取到可用 Look。");
    }

    if (fallbackAvatarId) {
      return fallbackAvatarId;
    }
    throw new AvatarProviderUnavailableError("HeyGen Avatar Group 下没有可用 Look。");
  }

  private async listAvatarLooksForGroup(
    input: {
      apiKey: string;
      baseUrl: string;
      configuration: ServiceConfiguration;
    },
    groupId: string
  ): Promise<UnknownRecord[]> {
    const url = new URL(`${normalizeHeyGenBaseUrl(input.baseUrl)}/v3/avatars/looks`);
    url.searchParams.set("limit", "50");
    url.searchParams.set("group_id", groupId);
    const response = await requestJson<HeyGenEnvelope<unknown>>(this.fetchImpl, url.toString(), {
      method: "GET",
      headers: buildHeyGenAuthHeaders(input.configuration, input.apiKey)
    });

    return extractLookItems(response.data);
  }
}

function buildCreateVideoBody(options: {
  input: AvatarRenderInput;
  configuration: ServiceConfiguration;
  avatarId?: string;
  script: string;
  heyGenImageAssetId?: string;
}) {
  const baseBody = {
    voice_id: resolveVoiceId(options.configuration, options.input.task),
    script: options.script,
    title: `${options.input.task.title} - ${options.input.preset.label}`,
    aspect_ratio: options.input.preset.aspectRatio,
    resolution: options.configuration.settings.resolution ?? "720p",
    output_format: "mp4",
    motion_prompt: options.input.task.motionPrompt || undefined,
    caption: {
      file_format: "srt",
      style: "default"
    },
    voice_settings: {
      locale: options.input.task.contentLanguage
    }
  };

  if (options.input.task.avatarMode === "image-presenter") {
    return {
      ...baseBody,
      type: "image",
      image: {
        type: "asset_id",
        asset_id: options.heyGenImageAssetId
      }
    };
  }

  return {
    ...baseBody,
    type: "avatar",
    avatar_id: options.avatarId
  };
}

function buildCreateVideoAgentBody(options: {
  input: AvatarRenderInput;
  configuration: ServiceConfiguration;
  avatarId: string;
  script: string;
}) {
  return {
    prompt: buildVideoAgentPrompt(options.input, options.script),
    avatar_id: options.avatarId,
    voice_id: resolveVoiceId(options.configuration, options.input.task),
    orientation: options.input.preset.aspectRatio === "16:9" ? "landscape" : "portrait",
    mode: "generate",
    incognito_mode: true
  };
}

function buildVideoAgentPrompt(input: AvatarRenderInput, script: string): string {
  const orientation = input.preset.aspectRatio === "16:9" ? "landscape 16:9" : "portrait 9:16";
  const motionPrompt = input.task.motionPrompt.trim();
  const language = input.task.contentLanguage;
  return [
    `Create a lip-synced presenter video with the selected presenter.`,
    `Output orientation: ${orientation}.`,
    `Narration language: ${language}.`,
    "Keep this as a presenter-led talking-head video; do not replace it with stock-only montage.",
    "Use the script below as the spoken narration and preserve its meaning closely.",
    motionPrompt ? `Presenter motion: ${motionPrompt}` : "",
    "",
    "SCRIPT:",
    script
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function resolveVoiceId(configuration: ServiceConfiguration, task: VideoTask): string {
  return (
    configuration.settings.voiceId?.trim() ||
    DEFAULT_HEYGEN_VOICE_IDS[task.contentLanguage] ||
    DEFAULT_HEYGEN_VOICE_IDS["en-US"]
  );
}

function resolveGenerationRoute(
  configuration: ServiceConfiguration,
  task: VideoTask
): "direct-video" | "video-agent" {
  const configuredRoute = configuration.settings.generationRoute ?? "auto";
  if (configuredRoute === "video-agent") {
    return canFallbackToVideoAgent(task) ? "video-agent" : "direct-video";
  }
  if (configuredRoute === "direct-video") {
    return "direct-video";
  }
  if (
    canFallbackToVideoAgent(task) &&
    (configuration.settings.authMode ?? defaultServiceSettings("heygen").authMode) ===
      "oauth-bearer"
  ) {
    return "video-agent";
  }
  return "direct-video";
}

function canFallbackToVideoAgent(task: VideoTask): boolean {
  return task.avatarMode === "preset-avatar";
}

function selectScript(task: VideoTask): string {
  const script = (task.finalScript || task.sourceScript).trim();
  if (!script) {
    throw new Error("请先生成或填写脚本，再生成数字人视频。");
  }

  return script;
}

function extractLookItems(data: unknown): UnknownRecord[] {
  if (Array.isArray(data)) {
    return data.filter(isRecord);
  }
  if (!isRecord(data)) {
    return [];
  }

  const candidates = [
    data.avatar_looks,
    data.avatarLooks,
    data.looks,
    data.avatars,
    data.items,
    data.list
  ];
  const list = candidates.find(Array.isArray);
  return Array.isArray(list) ? list.filter(isRecord) : [];
}

function readLookId(record: UnknownRecord): string {
  return readString(record, ["avatar_id", "avatarId", "look_id", "lookId", "id"]);
}

function readLookOrientation(
  record: UnknownRecord
): "portrait" | "landscape" | "square" | "unknown" {
  const width = readNumber(record, ["image_width", "imageWidth", "width"]);
  const height = readNumber(record, ["image_height", "imageHeight", "height"]);
  if (!width || !height) {
    return "unknown";
  }
  if (width === height) {
    return "square";
  }
  return width > height ? "landscape" : "portrait";
}

function readString(record: UnknownRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function readNumber(record: UnknownRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function decorateHeyGenRenderError(error: unknown, configuration: ServiceConfiguration): Error {
  if (!(error instanceof Error)) {
    return new Error(String(error));
  }

  if (!isApiCreditError(error)) {
    return error;
  }

  const authMode = configuration.settings.authMode ?? "api-key";
  const route = configuration.settings.generationRoute ?? "auto";
  const hint =
    authMode === "oauth-bearer"
      ? `当前已选择 HeyGen 会员/Bearer 认证，生成路由为 ${route}。如果这里填的是 sk_ 开头的 API Key，它仍可能走 API credits；要消耗会员计划额度，需要使用 HeyGen OAuth/MCP 登录态或官方允许的 Bearer Token。`
      : "当前 HeyGen 使用 API Key 通道，普通会员额度通常不能抵扣 API credits；如果要用会员计划额度，请在设置里选择会员/OAuth Token 或 Video Agent 路由，并填入真正的会员 Bearer/OAuth Token。";

  return new Error(`${error.message}。${hint}`, { cause: error });
}

function isApiCreditError(error: unknown): boolean {
  const lowerMessage = readErrorMessage(error).toLowerCase();
  return API_CREDIT_ERROR_MARKERS.some((marker) => lowerMessage.includes(marker));
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createImageBlob(imagePath: string): Blob {
  return new Blob([fs.readFileSync(imagePath)], { type: contentTypeFromPath(imagePath) });
}

function contentTypeFromPath(imagePath: string): string {
  const extension = path.extname(imagePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return "image/png";
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}
