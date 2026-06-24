import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PROVIDER_DEFINITIONS,
  defaultServiceSettings,
  getProviderDefinition,
  type ListServiceModelsInput,
  type ProviderId,
  type SaveServiceConfigurationInput,
  type ServiceConfiguration,
  type ServiceConfigurationSettings,
  type ServiceConnectionCheck,
  type ServiceModelList
} from "../../shared/serviceConfig";
import { redactSecret } from "../security/redaction";
import { buildHeyGenAuthHeaders, heyGenCredentialLabel } from "../avatar/heyGenAuth";
import { normalizeHeyGenBaseUrl } from "../avatar/heyGenUrls";
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

  async listModels(input: ListServiceModelsInput): Promise<ServiceModelList> {
    const definition = getProviderDefinition(input.providerId);
    const savedConfiguration = this.getConfiguration(input.providerId);
    const settings = {
      ...savedConfiguration.settings,
      ...sanitizeSettings(input.settings)
    };

    if (input.providerId === "heygen" || input.providerId === "source-parser") {
      const message =
        input.providerId === "heygen"
          ? "HeyGen 使用数字人 Avatar 和 Voice ID，不提供 OpenAI 兼容模型列表。"
          : "原视频解析下载服务不需要模型名，只需要 Base URL 和 API Key。";
      return {
        providerId: input.providerId,
        ok: false,
        models: [],
        message
      };
    }

    const baseUrl = settings.baseUrl || defaultServiceSettings(input.providerId).baseUrl || "";
    if (!baseUrl) {
      return {
        providerId: input.providerId,
        ok: false,
        models: [],
        message: `${definition.label} Base URL 尚未配置。`
      };
    }

    const typedApiKey = input.apiKey?.trim();
    const savedApiKeyResult = typedApiKey
      ? ({ ok: true, value: typedApiKey } as const)
      : await this.readCredentialForCheck(input.providerId, definition.label);
    const apiKey = savedApiKeyResult.ok ? savedApiKeyResult.value : "";
    if (definition.requiresCredential && !apiKey) {
      const message = savedApiKeyResult.ok
        ? `${definition.label} API Key 尚未配置`
        : savedApiKeyResult.message;
      return {
        providerId: input.providerId,
        ok: false,
        models: [],
        message: `${message}，无法获取模型列表。`
      };
    }

    const result = await fetchWithTimeout(this.fetchImpl, `${normalizeBaseUrl(baseUrl)}/models`, {
      method: "GET",
      headers: apiKey
        ? {
            authorization: `Bearer ${apiKey}`
          }
        : undefined
    });

    if (!result.ok) {
      return {
        providerId: input.providerId,
        ok: false,
        models: [],
        message: `${definition.label} 获取模型失败：${result.message}`
      };
    }

    const models = normalizeModelIds(result.json);
    if (models.length === 0) {
      return {
        providerId: input.providerId,
        ok: false,
        models: [],
        message: `${definition.label} 已连接，但 /models 响应里没有可选择的模型 ID。`
      };
    }

    return {
      providerId: input.providerId,
      ok: true,
      models,
      message: `${definition.label} 已获取 ${models.length} 个模型，可在下拉框中选择。`
    };
  }

  async testConfiguration(providerId: ProviderId): Promise<ServiceConnectionCheck> {
    const configuration = this.getConfiguration(providerId);
    const definition = getProviderDefinition(providerId);

    if (providerId === "asr" && configuration.settings.enabled === false) {
      return this.testSharedLlmAudioTranscription();
    }

    if (definition.requiresCredential && !configuration.credentialConfigured) {
      return {
        providerId,
        ok: false,
        message:
          providerId === "heygen"
            ? `${heyGenCredentialLabel(configuration)} 尚未配置`
            : `${definition.label} API Key 尚未配置`
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

    const apiKey = await this.readCredentialForCheck(providerId, definition.label);
    if (!apiKey.ok) {
      return {
        providerId,
        ok: false,
        message: apiKey.message
      };
    }

    if (providerId === "heygen") {
      return this.testHeyGenConnection(configuration, apiKey.value);
    }

    if (providerId === "source-parser") {
      return this.testSourceParserConnection(configuration, apiKey.value);
    }

    if (providerId === "llm") {
      return this.testOpenAiCompatibleChat(configuration, apiKey.value);
    }

    if (providerId === "asr" && !configuration.settings.modelName?.trim()) {
      return {
        providerId: "asr",
        ok: false,
        message: "ASR 已启用但模型名为空。请填写支持音频转写的模型，或关闭 ASR 复用大模型配置。"
      };
    }

    if (providerId === "asr") {
      return this.testOpenAiCompatibleAudioTranscription(configuration, apiKey.value);
    }

    return this.testDeferredOpenAiCompatibleConnection(configuration, apiKey.value);
  }

  private async testSharedLlmAudioTranscription(): Promise<ServiceConnectionCheck> {
    const asrConfiguration = this.getConfiguration("asr");
    const asrDefaults = defaultServiceSettings("asr");
    const llmConfiguration = this.getConfiguration("llm");
    if (llmConfiguration.settings.enabled === false) {
      return {
        providerId: "asr",
        ok: false,
        message: "ASR 独立配置未启用，且大模型服务未启用，无法判断音频转写能力。"
      };
    }

    const apiKey = await this.readCredentialForCheck("llm", "大模型");
    if (!apiKey.ok) {
      return {
        providerId: "asr",
        ok: false,
        message: `ASR 独立配置未启用，且${apiKey.message}`
      };
    }

    const baseUrl =
      asrConfiguration.settings.baseUrl ||
      asrDefaults.baseUrl ||
      llmConfiguration.settings.baseUrl ||
      defaultServiceSettings("llm").baseUrl;
    const modelName =
      asrConfiguration.settings.modelName?.trim() ||
      asrDefaults.modelName ||
      llmConfiguration.settings.modelName?.trim();
    const asrMode = asrConfiguration.settings.asrMode || asrDefaults.asrMode || "chat-audio";
    if (!baseUrl || !modelName) {
      return {
        providerId: "asr",
        ok: false,
        message: "ASR 独立配置未启用，且大模型 Base URL 或模型名为空，无法判断音频转写能力。"
      };
    }

    const result =
      asrMode === "chat-audio"
        ? await testChatAudioTranscriptionEndpoint(this.fetchImpl, {
            apiKey: apiKey.value,
            baseUrl,
            modelName
          })
        : await testAudioTranscriptionEndpoint(this.fetchImpl, {
            apiKey: apiKey.value,
            baseUrl,
            modelName
          });

    if (!result.ok) {
      return {
        providerId: "asr",
        ok: false,
        message: `大模型 ${modelName} 不支持或无法完成音频转写：${result.message}。请启用 ASR 转写并填写支持音频转写的模型。`
      };
    }

    return {
      providerId: "asr",
      ok: true,
      message: `ASR 独立配置未启用；已确认大模型 ${modelName} 可以复用完成音频转写。`
    };
  }

  private async readCredentialForCheck(
    providerId: ProviderId,
    label: string
  ): Promise<{ ok: true; value: string } | { ok: false; message: string }> {
    try {
      const value = (await this.credentialStore.readCredential(providerId)) ?? "";
      if (!value) {
        return { ok: false, message: `${label} API Key 尚未配置` };
      }
      return { ok: true, value };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : `${label} API Key 读取失败`
      };
    }
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

    const result = await fetchWithTimeout(
      this.fetchImpl,
      `${normalizeBaseUrl(baseUrl)}/chat/completions`,
      {
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
      }
    );

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

  private async testOpenAiCompatibleAudioTranscription(
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

    const asrMode =
      configuration.settings.asrMode || defaultServiceSettings(configuration.providerId).asrMode;
    const result =
      asrMode === "chat-audio"
        ? await testChatAudioTranscriptionEndpoint(this.fetchImpl, {
            apiKey,
            baseUrl,
            modelName
          })
        : await testAudioTranscriptionEndpoint(this.fetchImpl, {
            apiKey,
            baseUrl,
            modelName
          });

    if (!result.ok) {
      return {
        providerId: configuration.providerId,
        ok: false,
        message: `${definition.label} 测试失败：${modelName} 不支持或无法完成音频转写：${result.message}`
      };
    }

    return {
      providerId: configuration.providerId,
      ok: true,
      message:
        asrMode === "chat-audio"
          ? `${definition.label} 测试通过，${modelName} 可以通过 chat/completions 音频输入返回转写结果`
          : `${definition.label} 测试通过，${modelName} 可以完成 audio/transcriptions 音频转写`
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
          message: `${definition.label} API 可连接，但 /models 未列出 ${modelName}。部分中转不会列出图片模型，实际生成时再验证。`
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

    const headers = buildHeyGenAuthHeaders(configuration, apiKey);
    const userResult = await fetchWithTimeout(
      this.fetchImpl,
      `${normalizeHeyGenBaseUrl(baseUrl)}/v3/users/me`,
      {
        method: "GET",
        headers
      }
    );

    if (!userResult.ok) {
      return {
        providerId: "heygen",
        ok: false,
        message: `HeyGen 账号认证失败：${userResult.message}`
      };
    }

    const avatarUrl = new URL(`${normalizeHeyGenBaseUrl(baseUrl)}/v3/avatars/looks`);
    avatarUrl.searchParams.set("limit", "1");
    const avatarResult = await fetchWithTimeout(this.fetchImpl, avatarUrl.toString(), {
      method: "GET",
      headers
    });

    if (!avatarResult.ok) {
      return {
        providerId: "heygen",
        ok: false,
        message: `HeyGen 账号认证通过，但数字人列表读取失败：${avatarResult.message}`
      };
    }

    return {
      providerId: "heygen",
      ok: true,
      message: `HeyGen 测试通过，${describeHeyGenAccount(userResult.json)}；${describeHeyGenGenerationPath(
        configuration,
        apiKey,
        userResult.json
      )}；预设数字人会在任务里自动读取后选择`
    };
  }

  private async testSourceParserConnection(
    configuration: ServiceConfiguration,
    apiKey: string
  ): Promise<ServiceConnectionCheck> {
    const baseUrl =
      configuration.settings.baseUrl || defaultServiceSettings("source-parser").baseUrl;
    if (!baseUrl) {
      return {
        providerId: "source-parser",
        ok: false,
        message: "原视频解析下载 Base URL 尚未配置"
      };
    }

    const result = await fetchWithTimeout(
      this.fetchImpl,
      `${normalizeBaseUrl(baseUrl)}/api/v1/quota`,
      {
        method: "GET",
        headers: {
          "x-api-key": apiKey
        }
      }
    );

    if (!result.ok) {
      return {
        providerId: "source-parser",
        ok: false,
        message: `原视频解析下载测试失败：${result.message}`
      };
    }

    return {
      providerId: "source-parser",
      ok: true,
      message: `原视频解析下载测试通过，${describeSourceParserQuota(result.json)}`
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
  const timeout = setTimeout(() => controller.abort(), 30000);

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

async function testAudioTranscriptionEndpoint(
  fetchImpl: typeof fetch,
  input: {
    apiKey: string;
    baseUrl: string;
    modelName: string;
  }
): Promise<FetchTestResult> {
  const formData = new FormData();
  formData.append("model", input.modelName);
  formData.append("response_format", "text");
  formData.append("language", "en");
  formData.append("file", createTinyWavBlob(), "asr-test.wav");

  return fetchWithTimeout(fetchImpl, `${normalizeBaseUrl(input.baseUrl)}/audio/transcriptions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`
    },
    body: formData
  });
}

async function testChatAudioTranscriptionEndpoint(
  fetchImpl: typeof fetch,
  input: {
    apiKey: string;
    baseUrl: string;
    modelName: string;
  }
): Promise<FetchTestResult> {
  const audioBase64 = createAsrProbeWavBuffer().toString("base64");
  const result = await fetchWithTimeout(
    fetchImpl,
    `${normalizeBaseUrl(input.baseUrl)}/chat/completions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`
      },
      body: JSON.stringify({
        model: input.modelName,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: 'Transcribe the attached audio and return JSON only: {"transcript":"...","segments":[{"start_seconds":0,"end_seconds":0.1,"text":"..."}]}.'
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
    }
  );

  if (!result.ok) {
    return result;
  }

  const content = readChatCompletionText(result.json);
  const parsed = parseJsonFromText(content);
  if (!hasTimedSegments(parsed)) {
    return {
      ok: false,
      status: result.status,
      json: result.json,
      message:
        "HTTP OK but the model did not return JSON segments with start/end timestamps for the audio."
    };
  }

  return result;
}

function readChatCompletionText(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }
  const choices = Array.isArray(value.choices) ? value.choices : [];
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

  return "";
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

function hasTimedSegments(value: Record<string, unknown> | undefined): boolean {
  if (!value || !Array.isArray(value.segments)) {
    return false;
  }

  return value.segments.some((segment) => {
    if (!isRecord(segment)) {
      return false;
    }
    return (
      readFiniteNumber(segment, "start_seconds") !== undefined &&
      readFiniteNumber(segment, "end_seconds") !== undefined &&
      readString(segment, "text").length > 0
    );
  });
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number | undefined {
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

function createTinyWavBlob(): Blob {
  const buffer = createAsrProbeWavBuffer();
  const bytes = new Uint8Array(buffer.length);
  bytes.set(buffer);
  return new Blob([bytes], { type: "audio/wav" });
}

function createAsrProbeWavBuffer(): Buffer {
  const spokenProbe = createWindowsSpeechProbeWavBuffer();
  return spokenProbe ?? createSilentWavBuffer();
}

function createWindowsSpeechProbeWavBuffer(): Buffer | undefined {
  if (process.platform !== "win32") {
    return undefined;
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-asr-probe-"));
  const outputPath = path.join(directory, "probe.wav");
  try {
    const script = [
      "Add-Type -AssemblyName System.Speech",
      "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      `$s.SetOutputToWaveFile('${outputPath.replace(/'/g, "''")}')`,
      "$s.Speak('hello world')",
      "$s.Dispose()"
    ].join("; ");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 15000,
      windowsHide: true
    });
    if (result.status !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      return undefined;
    }
    return fs.readFileSync(outputPath);
  } catch {
    return undefined;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function createSilentWavBuffer(): Buffer {
  const sampleRate = 8000;
  const durationSeconds = 0.1;
  const samples = Math.floor(sampleRate * durationSeconds);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
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

function describeHeyGenAccount(value: unknown): string {
  const data = isRecord(value) && isRecord(value.data) ? value.data : value;
  if (!isRecord(data)) {
    return "账号认证成功";
  }

  const billingType = readString(data, "billing_type") || readString(data, "billingType");
  const subscriptionValue = data.subscription;
  const subscription =
    readString(data, "subscription") ||
    readString(data, "plan") ||
    (isRecord(subscriptionValue) ? readString(subscriptionValue, "plan") : "");
  const subscriptionCredits = isRecord(subscriptionValue)
    ? describeHeyGenSubscriptionCredits(subscriptionValue.credits)
    : "";
  const remainingCredits =
    readString(data, "remaining_credits") ||
    readString(data, "remainingCredits") ||
    readString(data, "credits");

  const parts = [
    billingType ? `计费类型 ${billingType}` : "",
    subscription ? `订阅 ${subscription}` : "",
    subscriptionCredits,
    remainingCredits ? `剩余额度 ${remainingCredits}` : ""
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("，") : "账号认证成功";
}

function describeHeyGenSubscriptionCredits(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }

  const premium = isRecord(value.premium_credits)
    ? readNumber(value.premium_credits, "remaining")
    : undefined;
  const addOn = isRecord(value.add_on_credits)
    ? readNumber(value.add_on_credits, "remaining")
    : undefined;

  return [
    premium !== undefined ? `会员额度 ${premium}` : "",
    addOn !== undefined ? `加购额度 ${addOn}` : ""
  ]
    .filter(Boolean)
    .join("，");
}

function describeHeyGenGenerationPath(
  configuration: ServiceConfiguration,
  apiKey: string,
  userValue: unknown
): string {
  const authMode = configuration.settings.authMode ?? defaultServiceSettings("heygen").authMode;
  const route = configuration.settings.generationRoute ?? "auto";
  const data = isRecord(userValue) && isRecord(userValue.data) ? userValue.data : userValue;
  const hasSubscription =
    isRecord(data) &&
    (readString(data, "billing_type") === "subscription" || isRecord(data.subscription));
  const keyLooksLikeApiKey = /^sk[_-]/i.test(apiKey.trim());

  if (authMode === "oauth-bearer" && keyLooksLikeApiKey) {
    return "当前选择会员/Bearer，但填入内容像 API Key；读取账号可能成功，生成时仍可能要求 API credits。要消耗会员计划额度，请填真正的 OAuth/Bearer Token，或使用 Codex/HeyGen MCP 会员通道";
  }

  if (authMode === "api-key") {
    return `当前为 API Key 直连，生成路由 ${route}；如果账号只有会员计划额度但没有 API credits，Direct Video 生成会失败`;
  }

  if (hasSubscription) {
    return `当前为会员/Bearer 认证，生成路由 ${route}；自动模式会优先走 Video Agent 会员路由`;
  }

  return `当前生成路由 ${route}`;
}

function describeSourceParserQuota(value: unknown): string {
  if (!isRecord(value)) {
    return "额度信息已读取";
  }

  const used = readNumber(value, "used");
  if (value.unlimited === true) {
    return `不限量，已用 ${used ?? 0}`;
  }

  const limit = readNumber(value, "limit");
  const remaining = readNumber(value, "remaining");
  const parts = [
    limit !== undefined ? `总额度 ${limit}` : "",
    used !== undefined ? `已用 ${used}` : "",
    remaining !== undefined ? `剩余 ${remaining}` : ""
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("，") : "额度信息已读取";
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeModelIds(value: unknown): string[] {
  const candidateItems = collectModelItems(value);
  return Array.from(
    new Set(
      candidateItems
        .map((item) => {
          if (typeof item === "string") {
            return item.trim();
          }
          if (isRecord(item)) {
            return readString(item, "id").trim() || readString(item, "name").trim();
          }
          return "";
        })
        .filter(Boolean)
    )
  )
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 300);
}

function collectModelItems(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (!isRecord(value)) {
    return [];
  }

  const data = value.data;
  if (Array.isArray(data)) {
    return data;
  }

  const models = value.models;
  if (Array.isArray(models)) {
    return models;
  }

  return [];
}

function sanitizeSettings(settings: ServiceConfigurationSettings): ServiceConfigurationSettings {
  const sanitized: ServiceConfigurationSettings = {};

  if (settings.baseUrl !== undefined) {
    sanitized.baseUrl = settings.baseUrl.trim();
  }

  if (settings.modelName !== undefined) {
    sanitized.modelName = settings.modelName.trim();
  }

  if (settings.authMode !== undefined) {
    sanitized.authMode = settings.authMode === "oauth-bearer" ? "oauth-bearer" : "api-key";
  }

  if (settings.generationRoute !== undefined) {
    sanitized.generationRoute =
      settings.generationRoute === "direct-video" || settings.generationRoute === "video-agent"
        ? settings.generationRoute
        : "auto";
  }

  if (settings.asrMode !== undefined) {
    sanitized.asrMode = settings.asrMode === "chat-audio" ? "chat-audio" : "audio-transcriptions";
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
