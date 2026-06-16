import type { SimilarityRisk, VideoTask } from "../../shared/domain";
import type { ScriptGenerationResult } from "../../shared/scriptGeneration";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { defaultServiceSettings } from "../../shared/serviceConfig";
import { redactSecret } from "../security/redaction";
import { buildScriptGenerationPrompt } from "./promptBuilder";
import { ScriptProviderUnavailableError, type ScriptProvider } from "./scriptProvider";

interface LlmConfigurationReader {
  getConfiguration: (providerId: "llm") => ServiceConfiguration;
}

interface LlmCredentialReader {
  readCredential: (providerId: "llm") => Promise<string | null>;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

interface RawScriptGenerationResponse {
  finalScript?: unknown;
  similarityRisk?: unknown;
  notes?: unknown;
}

const SIMILARITY_RISKS = new Set<SimilarityRisk>(["unknown", "low", "medium", "high"]);

export class OpenAiCompatibleScriptProvider implements ScriptProvider {
  constructor(
    private readonly configurations: LlmConfigurationReader,
    private readonly credentials: LlmCredentialReader
  ) {}

  async generate(task: VideoTask): Promise<ScriptGenerationResult> {
    const configuration = this.configurations.getConfiguration("llm");

    if (configuration.settings.enabled === false) {
      throw new ScriptProviderUnavailableError("大模型服务未启用。");
    }

    const apiKey = await this.credentials.readCredential("llm");
    if (!apiKey) {
      throw new ScriptProviderUnavailableError("大模型 API Key 尚未配置。");
    }

    const promptPreview = buildScriptGenerationPrompt({
      sourceScript: task.sourceScript,
      contentLanguage: task.contentLanguage,
      generationMode: task.generationMode,
      personalIpProfile: task.personalIpProfile
    });

    const response = await fetch(buildChatCompletionUrl(configuration), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: configuration.settings.modelName || defaultServiceSettings("llm").modelName,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are a short-form commerce script strategist.",
              "Return only valid JSON with finalScript, similarityRisk, and notes.",
              "Allowed similarityRisk values: low, medium, high, unknown.",
              "Reuse reference mechanics only. Do not copy protected expression."
            ].join(" ")
          },
          {
            role: "user",
            content: [
              promptPreview,
              "",
              "Return JSON exactly in this shape:",
              '{"finalScript":"...","similarityRisk":"low","notes":"..."}'
            ].join("\n")
          }
        ]
      })
    });

    if (!response.ok) {
      const body = await safeReadResponseBody(response);
      throw new Error(
        `大模型脚本生成失败 (${response.status}): ${body || response.statusText || "无响应内容"}`
      );
    }

    const completion = (await response.json()) as ChatCompletionResponse;
    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("大模型响应中没有脚本内容。");
    }

    return normalizeScriptGenerationResponse(parseJsonObject(content), promptPreview);
  }
}

function buildChatCompletionUrl(configuration: ServiceConfiguration): string {
  const baseUrl = configuration.settings.baseUrl || defaultServiceSettings("llm").baseUrl;
  if (!baseUrl) {
    throw new ScriptProviderUnavailableError("大模型 Base URL 尚未配置。");
  }

  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

async function safeReadResponseBody(response: Response): Promise<string> {
  try {
    return redactSecret((await response.text()).slice(0, 800));
  } catch {
    return "";
  }
}

function parseJsonObject(value: string): RawScriptGenerationResponse {
  const trimmed = stripMarkdownFence(value.trim());

  try {
    return JSON.parse(trimmed) as RawScriptGenerationResponse;
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("大模型响应不是有效 JSON。");
    }

    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as RawScriptGenerationResponse;
  }
}

function stripMarkdownFence(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
}

function normalizeScriptGenerationResponse(
  raw: RawScriptGenerationResponse,
  promptPreview: string
): ScriptGenerationResult {
  const finalScript = typeof raw.finalScript === "string" ? raw.finalScript.trim() : "";
  if (!finalScript) {
    throw new Error("大模型响应缺少 finalScript。");
  }

  return {
    finalScript,
    similarityRisk: normalizeSimilarityRisk(raw.similarityRisk),
    notes:
      typeof raw.notes === "string" && raw.notes.trim()
        ? raw.notes.trim()
        : "大模型已生成脚本，但未返回生成说明。",
    promptPreview
  };
}

function normalizeSimilarityRisk(value: unknown): SimilarityRisk {
  if (typeof value === "string" && SIMILARITY_RISKS.has(value as SimilarityRisk)) {
    return value as SimilarityRisk;
  }

  return "unknown";
}
