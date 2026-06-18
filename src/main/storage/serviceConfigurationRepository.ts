import {
  PROVIDER_DEFINITIONS,
  defaultServiceSettings,
  getProviderDefinition,
  type ProviderId,
  type SaveServiceConfigurationInput,
  type ServiceConfiguration,
  type ServiceConfigurationSettings,
  type ServiceConnectionCheck
} from "../../shared/serviceConfig";
import { redactSecret } from "../security/redaction";
import type { CredentialStore } from "./credentialStore";
import type { TaskDatabase } from "./database";

interface ServiceConfigurationRow {
  provider_id: ProviderId;
  settings_json: string;
  updated_at: string;
}

export class ServiceConfigurationRepository {
  constructor(
    private readonly database: TaskDatabase,
    private readonly credentialStore: CredentialStore,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  listConfigurations(): ServiceConfiguration[] {
    return PROVIDER_DEFINITIONS.map((definition) => this.getConfiguration(definition.id));
  }

  getConfiguration(providerId: ProviderId): ServiceConfiguration {
    const definition = getProviderDefinition(providerId);
    const row = this.database
      .prepare("SELECT * FROM service_configurations WHERE provider_id = ?")
      .get(providerId) as unknown as ServiceConfigurationRow | undefined;
    const settings = row
      ? (JSON.parse(row.settings_json) as ServiceConfigurationSettings)
      : defaultServiceSettings(providerId);

    return {
      providerId,
      label: definition.label,
      kind: definition.kind,
      settings,
      credentialConfigured: this.credentialStore.hasCredential(providerId),
      updatedAt: row?.updated_at ?? new Date(0).toISOString()
    };
  }

  async saveConfiguration(input: SaveServiceConfigurationInput): Promise<ServiceConfiguration> {
    const definition = getProviderDefinition(input.providerId);
    const now = new Date().toISOString();
    const settings = {
      ...defaultServiceSettings(input.providerId),
      ...sanitizeSettings(input.settings)
    };

    this.database
      .prepare(
        `INSERT INTO service_configurations (provider_id, settings_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(provider_id) DO UPDATE SET
           settings_json = excluded.settings_json,
           updated_at = excluded.updated_at`
      )
      .run(input.providerId, JSON.stringify(settings), now);

    if (input.apiKey !== undefined && definition.requiresCredential) {
      await this.credentialStore.saveCredential(input.providerId, input.apiKey);
    }

    return this.getConfiguration(input.providerId);
  }

  async clearCredential(providerId: ProviderId): Promise<ServiceConfiguration> {
    await this.credentialStore.clearCredential(providerId);
    return this.getConfiguration(providerId);
  }

  async testConfiguration(providerId: ProviderId): Promise<ServiceConnectionCheck> {
    const configuration = this.getConfiguration(providerId);
    const definition = getProviderDefinition(providerId);

    if (definition.requiresCredential && !configuration.credentialConfigured) {
      return {
        providerId,
        ok: false,
        message: `${definition.label} API Key 尚未配置`
      };
    }

    if (configuration.settings.enabled === false) {
      return {
        providerId,
        ok: false,
        message: `${definition.label} 当前未启用`
      };
    }

    if (!definition.requiresCredential) {
      return {
        providerId,
        ok: true,
        message: `${definition.label} 不需要 API Key`
      };
    }

    let apiKey: string;
    try {
      apiKey = (await this.credentialStore.readCredential(providerId)) ?? "";
    } catch (error) {
      return {
        providerId,
        ok: false,
        message: error instanceof Error ? error.message : `${definition.label} API Key 读取失败`
      };
    }

    if (!apiKey) {
      return {
        providerId,
        ok: false,
        message: `${definition.label} API Key 尚未配置`
      };
    }

    if (providerId === "heygen") {
      return this.testHeyGenConnection(configuration, apiKey);
    }

    if (providerId === "llm") {
      return this.testOpenAiCompatibleChat(configuration, apiKey);
    }

    return this.testDeferredOpenAiCompatibleConnection(configuration, apiKey);
  }

  private async testOpenAiCompatibleChat(
    configuration: ServiceConfiguration,
    apiKey: string
  ): Promise<ServiceConnectionCheck> {
    const definition = getProviderDefinition(configuration.providerId);
    const baseUrl =
      configuration.settings.baseUrl || defaultServiceSettings(configuration.providerId).baseUrl;
    if (!baseUrl) {
      return {
        providerId: configuration.providerId,
        ok: false,
        message: `${definition.label} Base URL 尚未配置`
      };
    }

    const modelName = configuration.settings.modelName?.trim();
    if (!modelName) {
      return {
        providerId: configuration.providerId,
        ok: false,
        message: `${definition.label} 模型名尚未配置`
      };
    }

    const result = await fetchWithTimeout(this.fetchImpl, `${normalizeBaseUrl(baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1
      })
    });

    if (!result.ok) {
      return {
        providerId: configuration.providerId,
        ok: false,
        message: `${definition.label} 连接失败：${result.message}`
      };
    }

    return {
      providerId: configuration.providerId,
      ok: true,
      message: `${definition.label} 测试通过，${modelName} 的 chat/completions 可用`
    };
  }

  private async testDeferredOpenAiCompatibleConnection(
    configuration: ServiceConfiguration,
    apiKey: string
  ): Promise<ServiceConnectionCheck> {
    const definition = getProviderDefinition(configuration.providerId);
    const baseUrl =
      configuration.settings.baseUrl || defaultServiceSettings(configuration.providerId).baseUrl;
    if (!baseUrl) {
      return {
        providerId: configuration.providerId,
        ok: false,
        message: `${definition.label} Base URL 尚未配置`
      };
    }

    const result = await fetchWithTimeout(this.fetchImpl, `${normalizeBaseUrl(baseUrl)}/models`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiKey}`
      }
    });
    const modelName = configuration.settings.modelName?.trim();

    if (!result.ok && result.status && [401, 403].includes(result.status)) {
      return {
        providerId: configuration.providerId,
        ok: false,
        message: `${definition.label} 鉴权失败：${result.message}`
      };
    }

    if (!result.ok && !isProbablyUnsupportedModelsEndpoint(result.status)) {
      return {
        providerId: configuration.providerId,
        ok: false,
        message: `${definition.label} 基础连接失败：${result.message}`
      };
    }

    if (!result.ok) {
      return {
        providerId: configuration.providerId,
        ok: true,
        message: `${definition.label} 已保存。当前中转可能不开放 /models，${modelName || "所填模型"} 会在实际生成时验证。`
      };
    }

    const modelItems = isRecord(result.json) ? result.json.data : undefined;
    if (modelName && Array.isArray(modelItems)) {
      const found = modelItems.some(
        (model) => isRecord(model) && readString(model, "id") === modelName
      );
      if (!found) {
        return {
          providerId: configuration.providerId,
          ok: true,
          message: `${definition.label} API 可连接，但 /models 未列出 ${modelName}。部分中转不会列出图片/ASR模型，实际生成时再验证。`
        };
      }
    }

    return {
      providerId: configuration.providerId,
      ok: true,
      message: modelName
        ? `${definition.label} 测试通过，API 可连接，模型 ${modelName} 已保存`
        : `${definition.label} 测试通过，API 可连接`
    };
  }

  private async testHeyGenConnection(
    configuration: ServiceConfiguration,
    apiKey: string
  ): Promise<ServiceConnectionCheck> {
    const baseUrl = configuration.settings.baseUrl || defaultServiceSettings("heygen").baseUrl;
    if (!baseUrl) {
      return {
        providerId: "heygen",
        ok: false,
        message: "HeyGen Base URL 尚未配置"
      };
    }

    const url = new URL(`${normalizeBaseUrl(baseUrl)}/v3/avatars/looks`);
    url.searchParams.set("limit", "1");
    const result = await fetchWithTimeout(this.fetchImpl, url.toString(), {
      method: "GET",
      headers: {
        "x-api-key": apiKey
      }
    });

    if (!result.ok) {
      return {
        providerId: "heygen",
        ok: false,
        message: `HeyGen 连接失败：${result.message}`
      };
    }

    if (!configuration.settings.avatarId?.trim()) {
      return {
        providerId: "heygen",
        ok: false,
        message: "HeyGen API 可连接，但 Avatar ID 尚未配置"
      };
    }

    return {
      providerId: "heygen",
      ok: true,
      message: "HeyGen 测试通过，API Key 和 Avatar ID 可用于生成前检查"
    };
  }
}

interface FetchTestResult {
  ok: boolean;
  message: string;
  status?: number;
  json?: unknown;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit
): Promise<FetchTestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const text = await response.text();
    const redactedText = redactSecret(text.slice(0, 800));

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `HTTP ${response.status} ${response.statusText || ""} ${redactedText}`.trim()
      };
    }

    return {
      ok: true,
      message: "OK",
      json: parseJson(text)
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.name === "AbortError"
          ? "请求超时，请检查 Base URL 或网络"
          : redactSecret(error instanceof Error ? error.message : "请求失败")
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(value: string): unknown {
  if (!value.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
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

function isProbablyUnsupportedModelsEndpoint(status: number | undefined): boolean {
  return status === 400 || status === 404 || status === 405;
}

function sanitizeSettings(settings: ServiceConfigurationSettings): ServiceConfigurationSettings {
  const sanitized: ServiceConfigurationSettings = {};

  if (settings.baseUrl !== undefined) {
    sanitized.baseUrl = settings.baseUrl.trim();
  }

  if (settings.modelName !== undefined) {
    sanitized.modelName = settings.modelName.trim();
  }

  if (settings.avatarId !== undefined) {
    sanitized.avatarId = settings.avatarId.trim();
  }

  if (settings.voiceId !== undefined) {
    sanitized.voiceId = settings.voiceId.trim();
  }

  if (settings.resolution !== undefined) {
    sanitized.resolution = sanitizeResolution(settings.resolution);
  }

  if (settings.enabled !== undefined) {
    sanitized.enabled = settings.enabled;
  }

  return sanitized;
}

function sanitizeResolution(
  resolution: ServiceConfigurationSettings["resolution"]
): ServiceConfigurationSettings["resolution"] {
  return resolution === "720p" || resolution === "1080p" || resolution === "4k"
    ? resolution
    : undefined;
}
