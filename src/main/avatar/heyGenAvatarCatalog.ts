import type { HeyGenAvatarLook } from "../../shared/ipc";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { defaultServiceSettings } from "../../shared/serviceConfig";
import { redactSecret } from "../security/redaction";
import { AvatarProviderUnavailableError } from "./avatarProvider";

interface HeyGenConfigurationReader {
  getConfiguration: (providerId: "heygen") => ServiceConfiguration;
}

interface HeyGenCredentialReader {
  readCredential: (providerId: "heygen") => Promise<string | null>;
}

interface HeyGenAvatarCatalogOptions {
  fetchImpl?: typeof fetch;
  limit?: number;
}

interface HeyGenEnvelope<T> {
  data?: T;
  error?: unknown;
  message?: string;
}

type UnknownRecord = Record<string, unknown>;

export class HeyGenAvatarCatalog {
  private readonly fetchImpl: typeof fetch;
  private readonly limit: number;

  constructor(
    private readonly configurations: HeyGenConfigurationReader,
    private readonly credentials: HeyGenCredentialReader,
    options: HeyGenAvatarCatalogOptions = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.limit = options.limit ?? 24;
  }

  async listAvatarLooks(): Promise<HeyGenAvatarLook[]> {
    const configuration = this.configurations.getConfiguration("heygen");
    if (configuration.settings.enabled === false) {
      throw new AvatarProviderUnavailableError("HeyGen 服务未启用。");
    }

    const apiKey = await this.credentials.readCredential("heygen");
    if (!apiKey) {
      throw new AvatarProviderUnavailableError("HeyGen API Key 尚未配置。");
    }

    const baseUrl = configuration.settings.baseUrl || defaultServiceSettings("heygen").baseUrl;
    if (!baseUrl) {
      throw new AvatarProviderUnavailableError("HeyGen Base URL 尚未配置。");
    }

    const url = new URL(`${normalizeBaseUrl(baseUrl)}/v3/avatars/looks`);
    url.searchParams.set("limit", String(this.limit));

    const response = await requestJson<HeyGenEnvelope<unknown>>(this.fetchImpl, url.toString(), {
      method: "GET",
      headers: {
        "x-api-key": apiKey
      }
    });

    return extractLookItems(response.data).map(normalizeLook).filter(isUsableLook);
  }
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
  const name = readString(raw, ["name", "avatar_name", "avatarName", "look_name", "lookName"]);

  return {
    id,
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
    status: readString(raw, ["status", "training_status", "trainingStatus"])
  };
}

function isUsableLook(look: HeyGenAvatarLook): boolean {
  return Boolean(look.id);
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

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
