import type {
  CreateHeyGenAvatarInput,
  CreateHeyGenAvatarResult,
  HeyGenAvatarLook
} from "../../shared/ipc";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { defaultServiceSettings } from "../../shared/serviceConfig";
import { redactSecret } from "../security/redaction";
import { AvatarProviderUnavailableError } from "./avatarProvider";
import { buildHeyGenAuthHeaders, readHeyGenCredentialForRequest } from "./heyGenAuth";
import { normalizeHeyGenBaseUrl } from "./heyGenUrls";

interface HeyGenConfigurationReader {
  getConfiguration: (providerId: "heygen") => ServiceConfiguration;
}

interface HeyGenCredentialReader {
  readCredential: (providerId: "heygen") => Promise<string | null>;
  saveCredential?: (providerId: "heygen", secret: string) => Promise<void>;
}

interface HeyGenAvatarCreatorOptions {
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

interface HeyGenEnvelope<T> {
  data?: T;
  error?: unknown;
  message?: string;
}

type UnknownRecord = Record<string, unknown>;

export class HeyGenAvatarCreator {
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;

  constructor(
    private readonly configurations: HeyGenConfigurationReader,
    private readonly credentials: HeyGenCredentialReader,
    options: HeyGenAvatarCreatorOptions = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.maxPollAttempts = options.maxPollAttempts ?? 60;
  }

  async createPromptAvatar(input: CreateHeyGenAvatarInput): Promise<CreateHeyGenAvatarResult> {
    const name = input.name.trim();
    const prompt = input.prompt.trim();
    if (!name) {
      throw new Error("请先填写 HeyGen Avatar 名称。");
    }
    if (!prompt) {
      throw new Error("请先填写数字人描述提示词。");
    }

    const runtime = await this.readRuntime();
    const response = await requestJson<HeyGenEnvelope<unknown>>(
      this.fetchImpl,
      `${normalizeHeyGenBaseUrl(runtime.baseUrl)}/v3/avatars`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...buildHeyGenAuthHeaders(runtime.configuration, runtime.credential)
        },
        body: JSON.stringify({
          type: "prompt",
          name,
          prompt,
          avatar_group_id: input.avatarGroupId?.trim() || undefined
        })
      }
    );

    const createdLook = normalizeLook(extractAvatarItem(response));
    if (!createdLook.id) {
      throw new Error("HeyGen Avatar 创建响应缺少 look ID。");
    }

    const groupId = createdLook.groupId || input.avatarGroupId?.trim();
    const readyLook = groupId
      ? await this.pollReadyLook(runtime, groupId, createdLook.id)
      : createdLook;

    return {
      look: readyLook,
      message: readyLook.previewImageUrl
        ? "HeyGen Avatar 已创建并可预览。"
        : "HeyGen Avatar 已创建，预览图仍在处理中。"
    };
  }

  private async readRuntime(): Promise<{
    configuration: ServiceConfiguration;
    credential: string;
    baseUrl: string;
  }> {
    const configuration = this.configurations.getConfiguration("heygen");
    if (configuration.settings.enabled === false) {
      throw new AvatarProviderUnavailableError("HeyGen 服务未启用。");
    }

    const credential = await readHeyGenCredentialForRequest(
      configuration,
      this.credentials,
      this.fetchImpl
    );
    if (!credential) {
      throw new AvatarProviderUnavailableError("HeyGen 凭据尚未配置。");
    }

    const baseUrl = configuration.settings.baseUrl || defaultServiceSettings("heygen").baseUrl;
    if (!baseUrl) {
      throw new AvatarProviderUnavailableError("HeyGen Base URL 尚未配置。");
    }

    return { configuration, credential, baseUrl };
  }

  private async pollReadyLook(
    runtime: { configuration: ServiceConfiguration; credential: string; baseUrl: string },
    groupId: string,
    createdLookId: string
  ): Promise<HeyGenAvatarLook> {
    let latestLook: HeyGenAvatarLook = { id: createdLookId, groupId, name: createdLookId };
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
      const looks = await this.listGroupLooks(runtime, groupId);
      const matchingLook =
        looks.find((look) => look.id === createdLookId) ??
        looks.find((look) => look.previewImageUrl) ??
        looks[0];
      if (matchingLook) {
        latestLook = matchingLook;
      }

      if (latestLook.previewImageUrl) {
        return latestLook;
      }

      await delay(this.pollIntervalMs);
    }

    return latestLook;
  }

  private async listGroupLooks(
    runtime: { configuration: ServiceConfiguration; credential: string; baseUrl: string },
    groupId: string
  ): Promise<HeyGenAvatarLook[]> {
    const url = new URL(`${normalizeHeyGenBaseUrl(runtime.baseUrl)}/v3/avatars/looks`);
    url.searchParams.set("limit", "50");
    url.searchParams.set("group_id", groupId);
    const response = await requestJson<HeyGenEnvelope<unknown>>(this.fetchImpl, url.toString(), {
      method: "GET",
      headers: buildHeyGenAuthHeaders(runtime.configuration, runtime.credential)
    });

    return extractLookItems(response.data)
      .map(normalizeLook)
      .filter((look) => Boolean(look.id));
  }
}

function extractAvatarItem(response: HeyGenEnvelope<unknown>): UnknownRecord {
  const data = response.data;
  if (isRecord(data)) {
    const candidates = [data.avatar_item, data.avatarItem, data.look, data.avatar, data];
    const item = candidates.find(isRecord);
    if (item) {
      return item;
    }
  }

  return {};
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

function normalizeLook(raw: UnknownRecord): HeyGenAvatarLook {
  const id = readString(raw, ["avatar_id", "avatarId", "look_id", "lookId", "id"]);
  const groupId = readString(raw, ["group_id", "groupId", "avatar_group_id", "avatarGroupId"]);
  const name = readString(raw, ["name", "avatar_name", "avatarName", "look_name", "lookName"]);
  const imageWidth = readNumber(raw, ["image_width", "imageWidth", "width"]);
  const imageHeight = readNumber(raw, ["image_height", "imageHeight", "height"]);

  return {
    id,
    groupId,
    name: name || id,
    previewImageUrl: readString(raw, [
      "preview_image_url",
      "previewImageUrl",
      "preview_url",
      "previewUrl",
      "image_url",
      "imageUrl",
      "thumbnail_url",
      "thumbnailUrl"
    ]),
    previewVideoUrl: readString(raw, [
      "preview_video_url",
      "previewVideoUrl",
      "video_url",
      "videoUrl"
    ]),
    gender: readString(raw, ["gender"]),
    defaultVoiceId: readString(raw, ["default_voice_id", "defaultVoiceId", "voice_id", "voiceId"]),
    status: readString(raw, ["status", "training_status", "trainingStatus"]),
    avatarType: readString(raw, ["avatar_type", "avatarType", "type"]),
    orientation: readOrientation(imageWidth, imageHeight),
    imageWidth,
    imageHeight
  };
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

function readOrientation(
  imageWidth: number | undefined,
  imageHeight: number | undefined
): HeyGenAvatarLook["orientation"] {
  if (!imageWidth || !imageHeight) {
    return "unknown";
  }
  if (imageWidth === imageHeight) {
    return "square";
  }
  return imageWidth > imageHeight ? "landscape" : "portrait";
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}
