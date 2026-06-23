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
  buildCompactVisualStoryboardPrompt,
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

const STORYBOARD_COMPLETION_TIMEOUT_MS = 120000;

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
    let content: string;
    try {
      content = await this.requestJsonCompletion({
        promptPreview,
        systemPrompt: [
          "You create original drama-commerce script options for short-form videos.",
          "Return only valid JSON.",
          "Analyze product, audience, source mechanics, conversion logic, and originality risks.",
          "Reuse reference mechanics only; do not copy protected expression."
        ].join(" "),
        temperature: 0.72
      });
    } catch (error) {
      if (!isTransientCompletionFailure(error)) {
        throw error;
      }
      return {
        scriptPackage: createFallbackStoryScriptPackage(input, error),
        promptPreview: [
          promptPreview,
          "",
          "Fallback story script package was generated locally because the LLM script endpoint timed out or returned a temporary gateway error.",
          `Fallback reason: ${error instanceof Error ? error.message : String(error)}`
        ].join("\n")
      };
    }

    return {
      scriptPackage: normalizeStoryScriptPackage(parseJsonObject(content), input),
      promptPreview
    };
  }

  async generateVisualStoryboard(
    input: VisualStoryboardGenerationInput
  ): Promise<VisualStoryboardGenerationResult> {
    let promptPreview = buildVisualStoryboardPrompt(input);
    const storyboardSystemPrompt = [
      "You create original visual storyboard packages for short-form videos.",
      "Return only valid JSON.",
      "Prioritize visual continuity and practical image-to-video prompts.",
      "Use the confirmed script as source of truth when provided.",
      "Reuse reference mechanics only; do not copy protected expression."
    ].join(" ");
    let content: string;
    try {
      content = await this.requestJsonCompletion({
        promptPreview,
        systemPrompt: storyboardSystemPrompt,
        temperature: 0.65
      });
    } catch (error) {
      if (!isTransientCompletionFailure(error)) {
        throw error;
      }
      promptPreview = buildCompactVisualStoryboardPrompt(input);
      try {
        content = await this.requestJsonCompletion({
          promptPreview,
          systemPrompt: storyboardSystemPrompt,
          temperature: 0.45
        });
      } catch (retryError) {
        if (!isTransientCompletionFailure(retryError)) {
          throw retryError;
        }
        const fallbackStoryboard = createFallbackVisualStoryboard(input, retryError);
        return {
          storyboard: fallbackStoryboard,
          promptPreview: [
            promptPreview,
            "",
            "Fallback storyboard was generated locally because the LLM storyboard endpoint timed out or returned a temporary gateway error.",
            `Fallback reason: ${retryError instanceof Error ? retryError.message : String(retryError)}`
          ].join("\n")
        };
      }
    }

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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STORYBOARD_COMPLETION_TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.fetchImpl(buildChatCompletionUrl(configuration), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        signal: controller.signal,
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
    } catch (error) {
      throw new Error(
        error instanceof Error && error.name === "AbortError"
          ? "大模型 JSON 生成请求超时，请稍后重试或使用更短素材。"
          : error instanceof Error
            ? error.message
            : "视觉故事板生成请求失败。",
        { cause: error }
      );
    } finally {
      clearTimeout(timeout);
    }

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

function isTransientCompletionFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(408|429|500|502|503|504)\b|timeout|timed out|gateway|overloaded|rate limit|超时|网关|限流|过载/i.test(
    message
  );
}

function createFallbackStoryScriptPackage(
  input: StoryScriptGenerationInput,
  error: unknown
): StoryScriptPackage {
  const baseScript =
    input.task.finalScript.trim() ||
    input.task.sourceScript.trim() ||
    "先用一个清晰问题吸引注意，再用步骤、对比或证明说明价值，最后提醒观众收藏或查看详情。";
  const sourceSummary = summarizeForFallback(input.sourceBrief);

  return {
    title: `${input.task.title || "剧情脚本"}兜底方案`,
    productAnalysis: [
      "大模型脚本接口临时失败，系统已基于当前任务输入生成兜底脚本方案。正式发布前请人工核对商品事实、价格、规格、适用范围和禁用词。",
      `兜底原因：${error instanceof Error ? error.message : String(error)}`
    ].join("\n"),
    referenceMechanics: [
      "保留参考素材的抽象结构：前 5 秒钩子、中段证明或步骤、结尾低压力 CTA。",
      sourceSummary
    ].join("\n"),
    conversionStrategy:
      "用一个明确痛点或利益点开场；中段通过演示、对比、场景代入或观点证明建立信任；结尾提醒收藏、评论、查看商品入口或继续了解。",
    recommendedOptionId: "A",
    originalityNotes:
      "兜底方案只复用抽象节奏和转化机制，不复制参考视频的原句、口头禅、人物签名或具体镜头表达。",
    options: [
      {
        id: "A",
        title: "稳妥复刻结构版",
        angle: "保留爆款节奏，替换成当前任务的原创表达。",
        targetAudience: "对当前主题或商品场景有需求、需要快速判断是否值得继续看的人。",
        hook: "前 5 秒直接提出一个具体问题或反差。",
        beatSheet: [
          "0-3s：用痛点、反差或强画面让观众停留",
          "3-8s：解释为什么这个问题常见或值得关注",
          "8-18s：展示步骤、证据、场景或产品用法",
          "18-28s：给出前后对比、结果或异议处理",
          "28-35s：低压力 CTA，提醒收藏、查看详情或按需行动"
        ],
        script: baseScript,
        reason: "该方案依赖现有输入，稳定可编辑，适合作为故事板兜底来源。",
        riskNotes: "需要人工确认事实准确性，不要加入未验证功效、绝对化承诺或虚假紧迫感。"
      }
    ]
  };
}

function createFallbackVisualStoryboard(
  input: VisualStoryboardGenerationInput,
  error: unknown
): VisualStoryboardPackage {
  const panelCount = input.panelCount === "auto" ? 6 : input.panelCount;
  const script =
    input.task.finalScript.trim() ||
    input.task.sourceScript.trim() ||
    "用清晰开头吸引注意，中段展示证明或步骤，结尾给出行动提示。";
  const sourceSummary = summarizeForFallback(input.sourceBrief);
  const shots = fallbackShots(panelCount).map((shot, index) => {
    const line = scriptChunk(script, index, panelCount);
    return {
      ...shot,
      voiceoverOrText: line || shot.voiceoverOrText,
      visualAction:
        index === 0
          ? "用强视觉或明确痛点开场，让观众立刻知道这一条视频解决什么问题。"
          : shot.visualAction,
      imagePrompt: [
        `Panel ${index + 1} of a consistent short-video storyboard.`,
        shot.imagePrompt,
        line ? `Narration or on-screen text: ${line}` : "",
        "Keep one protagonist, one product/key object, one scene style, and bottom subtitle-safe space."
      ]
        .filter(Boolean)
        .join(" ")
    };
  });

  return {
    title: `${input.task.title || "视觉故事板"}兜底版`,
    sourceSummary: [
      "大模型视觉故事板接口临时失败，系统已基于现有文案、提取文案和画面分析生成可编辑兜底故事板。",
      sourceSummary
    ].join("\n"),
    remakeStrategy:
      "保留参考素材的抽象节奏、钩子功能、证明方式和 CTA 位置；替换具体表达、人物设定、镜头签名和画面风格。",
    productAnalysis:
      "请在正式生成前人工确认商品事实、价格、规格、适用范围和禁用词；兜底故事板不新增未经验证的承诺。",
    referenceMechanics: "使用前 5 秒钩子、中段证明或步骤展示、结尾轻量 CTA 的通用短视频结构。",
    selectedScript: script,
    panelCount,
    layout: layoutForPanelCount(panelCount),
    visualBible: {
      protagonist: "同一位自然出镜的创作者或同一视觉主体，表情真实，动作清晰。",
      product: "同一个商品或核心对象，外观、颜色、尺寸比例在所有分镜保持一致。",
      wardrobe: "服装简洁统一，避免每格变化。",
      location: "同一处干净明亮的室内或使用场景，背景不抢主体。",
      lighting: "柔和自然光或柔和商业光，避免强闪烁。",
      colorPalette: "清爽中性色搭配一个强调色，整体适合短视频信息展示。",
      cameraStyle: "竖屏短视频镜头，近景、特写、俯拍和轻微推进结合。",
      subtitleSafeSpace: "每格底部 20% 留出字幕安全区，关键主体避开平台按钮区域。",
      consistencyLocks: [
        "same protagonist or subject",
        "same product or key object",
        "same wardrobe and scene",
        "same lighting and color palette",
        "bottom subtitle-safe space"
      ]
    },
    shots,
    boardImagePrompt: buildFallbackBoardPrompt(shots),
    wholeVideoPrompt: [
      `Create a ${panelCount}-shot vertical short video from the storyboard.`,
      "Keep the protagonist, product/key object, scene, lighting, color palette, and subtitle-safe area consistent.",
      "Use the confirmed script as narration. Avoid unsupported claims and do not copy the reference expression.",
      `Fallback reason: ${error instanceof Error ? error.message : String(error)}`
    ].join("\n")
  };
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

function summarizeForFallback(value: string): string {
  return value
    .replace(/\r?\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1200);
}

function scriptChunk(script: string, index: number, total: number): string {
  const normalized = script.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  const chunkSize = Math.max(24, Math.ceil(normalized.length / Math.max(1, total)));
  return normalized.slice(index * chunkSize, (index + 1) * chunkSize).trim();
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
