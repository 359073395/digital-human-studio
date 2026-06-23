import type {
  StoryScriptOption,
  StoryScriptPackage,
  VisualStoryboardPackage,
  VisualStoryboardShot
} from "../../shared/domain";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { defaultServiceSettings } from "../../shared/serviceConfig";
import { redactSecret } from "../security/redaction";
import {
  StoryboardProviderUnavailableError,
  type StoryboardProvider,
  type StoryScriptGenerationInput,
  type StoryScriptGenerationResult,
  type VisualStoryboardGenerationInput,
  type VisualStoryboardGenerationResult
} from "./storyboardProvider";
import {
  buildStoryScriptOptionsPrompt,
  buildVisualStoryboardPrompt
} from "./visualStoryboardPromptBuilder";

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

interface OpenAiStoryboardProviderOptions {
  fetchImpl?: typeof fetch;
}

export class OpenAiCompatibleStoryboardProvider implements StoryboardProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly configurations: LlmConfigurationReader,
    private readonly credentials: LlmCredentialReader,
    options: OpenAiStoryboardProviderOptions = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateStoryScriptOptions(
    input: StoryScriptGenerationInput
  ): Promise<StoryScriptGenerationResult> {
    const promptPreview = buildStoryScriptOptionsPrompt(input);
    const content = await this.requestJsonCompletion({
      promptPreview,
      systemPrompt: [
        "You create original drama-commerce script options for short-form videos.",
        "Return only valid JSON.",
        "Analyze product, audience, source mechanics, conversion logic, and originality risks.",
        "Reuse reference mechanics only; do not copy protected expression."
      ].join(" "),
      temperature: 0.72
    });

    return {
      scriptPackage: normalizeStoryScriptPackage(parseJsonObject(content), input),
      promptPreview
    };
  }

  async generateVisualStoryboard(
    input: VisualStoryboardGenerationInput
  ): Promise<VisualStoryboardGenerationResult> {
    const promptPreview = buildVisualStoryboardPrompt(input);
    const content = await this.requestJsonCompletion({
      promptPreview,
      systemPrompt: [
        "You create original visual storyboard packages for short-form videos.",
        "Return only valid JSON.",
        "Prioritize visual continuity and practical image-to-video prompts.",
        "Use the confirmed script as source of truth when provided.",
        "Reuse reference mechanics only; do not copy protected expression."
      ].join(" "),
      temperature: 0.65
    });

    return {
      storyboard: normalizeVisualStoryboard(parseJsonObject(content), input),
      promptPreview
    };
  }

  private async requestJsonCompletion({
    promptPreview,
    systemPrompt,
    temperature
  }: {
    promptPreview: string;
    systemPrompt: string;
    temperature: number;
  }): Promise<string> {
    const configuration = this.configurations.getConfiguration("llm");

    if (configuration.settings.enabled === false) {
      throw new StoryboardProviderUnavailableError("大模型服务未启用。");
    }

    const apiKey = await this.credentials.readCredential("llm");
    if (!apiKey) {
      throw new StoryboardProviderUnavailableError("大模型 API Key 尚未配置。");
    }

    const response = await this.fetchImpl(buildChatCompletionUrl(configuration), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: configuration.settings.modelName || defaultServiceSettings("llm").modelName,
        temperature,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: promptPreview
          }
        ]
      })
    });

    if (!response.ok) {
      const body = await safeReadResponseBody(response);
      throw new Error(
        `视觉故事板生成失败 (${response.status}): ${body || response.statusText || "无响应内容"}`
      );
    }

    const completion = (await response.json()) as ChatCompletionResponse;
    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("大模型响应中没有视觉故事板内容。");
    }

    return content;
  }
}

function buildChatCompletionUrl(configuration: ServiceConfiguration): string {
  const baseUrl = configuration.settings.baseUrl || defaultServiceSettings("llm").baseUrl;
  if (!baseUrl) {
    throw new StoryboardProviderUnavailableError("大模型 Base URL 尚未配置。");
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

function parseJsonObject(value: string): Record<string, unknown> {
  const trimmed = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("大模型响应不是有效视觉故事板 JSON。");
    }

    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
  }
}

function normalizeStoryScriptPackage(
  raw: Record<string, unknown>,
  input: StoryScriptGenerationInput
): StoryScriptPackage {
  const options = normalizeStoryScriptOptions(raw.options);
  const fallbackOptions = options.length > 0 ? options : fallbackStoryScriptOptions(input);
  const recommendedOptionId = readText(raw.recommendedOptionId, fallbackOptions[0]?.id ?? "A", 20);

  return {
    title: readText(raw.title, `${input.task.title || "剧情脚本"}方案`, 80),
    productAnalysis: readText(
      raw.productAnalysis,
      "已根据当前商品、素材和参考内容生成产品、人群、痛点与证明机会分析。",
      2000
    ),
    referenceMechanics: readText(
      raw.referenceMechanics,
      "保留参考内容的抽象钩子、节奏、证明方式和 CTA 位置，替换具体表达。",
      2000
    ),
    conversionStrategy: readText(
      raw.conversionStrategy,
      "用前 5 秒建立冲突或利益点，中段给出证明，结尾明确行动。",
      1600
    ),
    options: fallbackOptions,
    recommendedOptionId: fallbackOptions.some((option) => option.id === recommendedOptionId)
      ? recommendedOptionId
      : (fallbackOptions[0]?.id ?? "A"),
    originalityNotes: readText(
      raw.originalityNotes,
      "脚本仅复用结构和转化机制，不复制参考视频的独特表达。",
      1200
    )
  };
}

function normalizeStoryScriptOptions(value: unknown): StoryScriptOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const record = readRecord(item);
      const id = readText(record.id, String.fromCharCode(65 + index), 20);
      return {
        id,
        title: readText(record.title, `剧情方案 ${id}`, 80),
        angle: readText(record.angle, "用剧情冲突带出商品卖点。", 300),
        targetAudience: readText(record.targetAudience, "当前产品的目标用户。", 200),
        hook: readText(record.hook, "前 5 秒提出痛点或强利益点。", 300),
        beatSheet: normalizeTextArray(record.beatSheet, [
          "0-3s first-frame hook",
          "3-8s conflict or pain",
          "8-18s proof/demo/story",
          "18-28s result or objection handling",
          "28-35s CTA"
        ]),
        script: readText(record.script, "请先补充商品信息，再生成完整脚本。", 3000),
        reason: readText(record.reason, "该方案更容易转成清晰分镜。", 500),
        riskNotes: readText(record.riskNotes, "注意避免夸大承诺和复制参考表达。", 500)
      };
    })
    .slice(0, 5);
}

function fallbackStoryScriptOptions(input: StoryScriptGenerationInput): StoryScriptOption[] {
  const script =
    input.task.finalScript.trim() ||
    input.task.sourceScript.trim() ||
    "先用一个清晰痛点吸引注意，再展示商品或方法如何解决问题，最后给出行动提示。";

  return [
    {
      id: "A",
      title: "稳妥转化版",
      angle: "痛点冲突到解决方案",
      targetAudience: "正在被该痛点困扰、需要快速判断是否值得购买的人",
      hook: "前 5 秒直接点出用户最在意的问题。",
      beatSheet: [
        "0-3s first-frame hook",
        "3-8s conflict or pain",
        "8-18s proof/demo/story",
        "18-28s objection handling",
        "28-35s CTA"
      ],
      script,
      reason: "保留清晰转化路径，适合进入故事板生成。",
      riskNotes: "需要人工确认价格、功效和活动信息是否准确。"
    }
  ];
}

function normalizeVisualStoryboard(
  raw: Record<string, unknown>,
  input: VisualStoryboardGenerationInput
): VisualStoryboardPackage {
  const shots = normalizeShots(raw.shots);
  const requestedPanelCount = input.panelCount === "auto" ? undefined : input.panelCount;
  const panelCount = requestedPanelCount ?? clampNumber(raw.panelCount, 6, 12, shots.length || 8);
  const normalizedShots = shots.length > 0 ? shots : fallbackShots(panelCount);

  return {
    title: readText(raw.title, input.task.title || "视觉故事板", 80),
    sourceSummary: readText(raw.sourceSummary, "已根据当前素材生成爆款结构摘要。", 1200),
    remakeStrategy: readText(raw.remakeStrategy, "保留结构和节奏，替换具体表达和画面。", 1200),
    productAnalysis: readText(
      raw.productAnalysis,
      "已结合商品、人群、场景、痛点、卖点和证明机会生成故事板。",
      1600
    ),
    referenceMechanics: readText(
      raw.referenceMechanics,
      "复用参考内容的抽象钩子功能、证明方式、节奏密度和 CTA 位置。",
      1600
    ),
    selectedScript: readText(
      raw.selectedScript,
      input.task.finalScript || input.task.sourceScript || "当前故事板基于任务中的可编辑脚本生成。",
      5000
    ),
    panelCount: panelCount || normalizedShots.length,
    layout: readText(raw.layout, layoutForPanelCount(panelCount || normalizedShots.length), 80),
    visualBible: {
      protagonist: readText(readRecord(raw.visualBible).protagonist, "主角形象保持一致。", 500),
      product: readText(readRecord(raw.visualBible).product, "商品外观保持一致。", 500),
      wardrobe: readText(readRecord(raw.visualBible).wardrobe, "服装保持一致。", 500),
      location: readText(readRecord(raw.visualBible).location, "场景保持一致。", 500),
      lighting: readText(readRecord(raw.visualBible).lighting, "自然商业光线。", 300),
      colorPalette: readText(
        readRecord(raw.visualBible).colorPalette,
        "干净、明亮、有记忆点。",
        300
      ),
      cameraStyle: readText(readRecord(raw.visualBible).cameraStyle, "短视频商业镜头。", 300),
      subtitleSafeSpace: readText(
        readRecord(raw.visualBible).subtitleSafeSpace,
        "底部留字幕安全区。",
        300
      ),
      consistencyLocks: normalizeTextArray(readRecord(raw.visualBible).consistencyLocks, [
        "same protagonist face",
        "same product shape",
        "same wardrobe",
        "same scene style"
      ])
    },
    shots: normalizedShots,
    boardImagePrompt: readText(
      raw.boardImagePrompt,
      buildFallbackBoardPrompt(normalizedShots),
      5000
    ),
    wholeVideoPrompt: readText(
      raw.wholeVideoPrompt,
      "Use the visual storyboard as reference. Generate a coherent short video with consistent character, product, scene, color, and camera style.",
      3000
    )
  };
}

function normalizeShots(value: unknown): VisualStoryboardShot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const record = readRecord(item);
      return {
        shotNumber: clampNumber(record.shotNumber, 1, 99, index + 1),
        durationSeconds: clampNumber(record.durationSeconds, 1, 12, 3),
        shotType: readText(record.shotType, "短视频镜头", 80),
        visualAction: readText(record.visualAction, "展示核心画面。", 500),
        subjectAction: readText(record.subjectAction, "主体自然行动。", 300),
        productAction: readText(record.productAction, "商品清晰出现。", 300),
        voiceoverOrText: readText(record.voiceoverOrText, "屏幕文字突出核心钩子。", 300),
        cameraMovement: readText(record.cameraMovement, "轻微推进。", 200),
        imagePrompt: readText(record.imagePrompt, "生成该镜头关键画面。", 800),
        videoMotionPrompt: readText(record.videoMotionPrompt, "让画面自然运动。", 500),
        negativePrompt: readText(
          record.negativePrompt,
          "avoid inconsistent face, distorted product, unreadable text",
          500
        ),
        continuityNotes: readText(record.continuityNotes, "与前后镜头保持连续。", 300)
      };
    })
    .slice(0, 12);
}

function fallbackShots(panelCount: number): VisualStoryboardShot[] {
  return Array.from({ length: panelCount }, (_, index) => ({
    shotNumber: index + 1,
    durationSeconds: index < 2 ? 3 : 4,
    shotType: index === 0 ? "first frame hook" : "proof / demo shot",
    visualAction: index === 0 ? "清晰展示冲突或利益点。" : "展示新的证明、动作或卖点。",
    subjectAction: "主体动作自然，面向短视频镜头。",
    productAction: "商品或核心对象保持清晰。",
    voiceoverOrText: index === 0 ? "开头钩子字幕。" : "承接前一镜头的信息。",
    cameraMovement: "轻微推进或稳定手持感。",
    imagePrompt: "生成统一风格的故事板分镜画面。",
    videoMotionPrompt: "保持主体和商品连续，动作轻微自然。",
    negativePrompt: "avoid inconsistent face, distorted product, messy layout",
    continuityNotes: "延续统一主角、商品、场景和色调。"
  }));
}

function buildFallbackBoardPrompt(shots: VisualStoryboardShot[]): string {
  return [
    `Create one labeled visual storyboard image with ${shots.length} panels.`,
    "Keep the same protagonist, product, wardrobe, scene, lighting, color palette, and camera style across every panel.",
    "Each panel must be numbered and show the shot action clearly.",
    "Leave subtitle-safe space at the bottom of each panel.",
    ...shots.map((shot) => `Panel ${shot.shotNumber}: ${shot.visualAction}`)
  ].join("\n");
}

function layoutForPanelCount(panelCount: number): string {
  if (panelCount <= 6) {
    return "2x3 visual storyboard";
  }
  if (panelCount <= 8) {
    return "2x4 visual storyboard";
  }
  if (panelCount <= 9) {
    return "3x3 visual storyboard";
  }
  return "3x4 visual storyboard";
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function normalizeTextArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
  return items.length > 0 ? items : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}
