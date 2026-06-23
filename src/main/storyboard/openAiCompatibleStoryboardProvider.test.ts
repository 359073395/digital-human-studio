// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COVER_STYLE,
  DEFAULT_CREATIVE_WORKFLOW,
  DEFAULT_FRAME_TITLE_STYLE,
  DEFAULT_PERSONAL_IP_PROFILE,
  DEFAULT_SUBTITLE_STYLE,
  type VideoTask
} from "../../shared/domain";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { OpenAiCompatibleStoryboardProvider } from "./openAiCompatibleStoryboardProvider";

const TEST_API_KEY = "sk-storyboard-secret-123456";

function createTask(): VideoTask {
  return {
    id: "task-1",
    title: "Viral board",
    originalVideoUrl: "https://example.com/source-video",
    sourceScript: "Reference hook and proof.",
    finalScript: "",
    similarityRisk: "unknown",
    scriptGenerationNotes: "",
    contentLanguage: "zh-CN",
    generationMode: "viral-remix",
    avatarMode: "preset-avatar",
    avatarDescriptionPrompt: "年轻创作者，白色衬衫，手拿商品。",
    motionPrompt: "镜头轻微推进，商品清晰展示。",
    selectedOutputPresets: ["portrait-9-16"],
    frameTitleStyle: DEFAULT_FRAME_TITLE_STYLE,
    subtitleStyle: DEFAULT_SUBTITLE_STYLE,
    coverStyle: DEFAULT_COVER_STYLE,
    personalIpProfile: DEFAULT_PERSONAL_IP_PROFILE,
    creativeWorkflow: DEFAULT_CREATIVE_WORKFLOW,
    steps: [],
    outputVariants: [],
    mediaAssets: [],
    publishingPackage: {
      title: "",
      description: "",
      tags: [],
      notes: ""
    },
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z"
  };
}

function createConfiguration(): ServiceConfiguration {
  return {
    providerId: "llm",
    label: "大模型",
    kind: "language-model",
    settings: {
      baseUrl: "https://llm.example/v1",
      modelName: "gpt-5.5",
      enabled: true
    },
    credentialConfigured: true,
    updatedAt: "2026-06-20T00:00:00.000Z"
  };
}

describe("OpenAiCompatibleStoryboardProvider", () => {
  it("returns a local fallback story script package when the script endpoint times out", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("Gateway Time-out", { status: 504, statusText: "Gateway Time-out" })
    );
    const provider = new OpenAiCompatibleStoryboardProvider(
      { getConfiguration: () => createConfiguration() },
      { readCredential: async () => TEST_API_KEY },
      { fetchImpl: fetchMock }
    );

    const result = await provider.generateStoryScriptOptions({
      task: createTask(),
      sourceBrief: "Reference hook, proof, and CTA."
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.scriptPackage.title).toContain("兜底方案");
    expect(result.scriptPackage.options[0]?.script).toContain("Reference hook");
    expect(result.promptPreview).toContain("Fallback story script package");
  });

  it("builds a visual storyboard request and normalizes the response", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "统一故事板",
                  sourceSummary: "参考视频用强钩子和证明推动转化。",
                  remakeStrategy: "保留节奏，替换人物、产品和表达。",
                  panelCount: 8,
                  layout: "2x4 visual storyboard",
                  visualBible: {
                    protagonist: "同一位年轻创作者",
                    product: "同一个商品",
                    wardrobe: "白色衬衫",
                    location: "明亮室内",
                    lighting: "柔和商业光",
                    colorPalette: "白色、绿色、浅蓝",
                    cameraStyle: "短视频近景",
                    subtitleSafeSpace: "底部留白",
                    consistencyLocks: ["same face", "same product"]
                  },
                  shots: [
                    {
                      shotNumber: 1,
                      durationSeconds: 3,
                      shotType: "first frame",
                      visualAction: "主角举起商品制造钩子。",
                      subjectAction: "看向镜头。",
                      productAction: "商品靠近镜头。",
                      voiceoverOrText: "别再这样用。",
                      cameraMovement: "push in",
                      imagePrompt: "Panel 1 prompt",
                      videoMotionPrompt: "small push in",
                      negativePrompt: "avoid distortion",
                      continuityNotes: "same product"
                    }
                  ],
                  boardImagePrompt: "Create one 8 panel storyboard.",
                  wholeVideoPrompt: "Generate a consistent short video."
                })
              }
            }
          ]
        })
      );
    });

    const provider = new OpenAiCompatibleStoryboardProvider(
      { getConfiguration: () => createConfiguration() },
      { readCredential: async () => TEST_API_KEY },
      { fetchImpl: fetchMock }
    );

    const result = await provider.generateVisualStoryboard({
      task: createTask(),
      sourceBrief: "Source brief",
      panelCount: "auto"
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestBody = String(init.body);

    expect(url).toBe("https://llm.example/v1/chat/completions");
    expect(init.headers).toMatchObject({
      authorization: `Bearer ${TEST_API_KEY}`
    });
    expect(requestBody).toContain("visual storyboard");
    expect(requestBody).toContain("Do not copy distinctive wording");
    expect(requestBody).not.toContain(TEST_API_KEY);
    expect(result.storyboard.panelCount).toBe(8);
    expect(result.storyboard.shots[0]?.imagePrompt).toBe("Panel 1 prompt");
    expect(result.storyboard.visualBible.consistencyLocks).toEqual(["same face", "same product"]);
  });

  it("retries visual storyboard generation with a compact prompt after a gateway timeout", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return new Response("Gateway Time-out", {
          status: 504,
          statusText: "Gateway Time-out"
        });
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "压缩故事板",
                  sourceSummary: "压缩上下文后继续生成。",
                  remakeStrategy: "保留机制，替换表达。",
                  panelCount: 6,
                  visualBible: {
                    protagonist: "同一人",
                    product: "同一物",
                    wardrobe: "同一服装",
                    location: "同一场景",
                    lighting: "同一光线",
                    colorPalette: "同一色调",
                    cameraStyle: "短视频镜头",
                    subtitleSafeSpace: "底部留白",
                    consistencyLocks: ["same face"]
                  },
                  shots: [],
                  boardImagePrompt: "Create one compact storyboard.",
                  wholeVideoPrompt: "Generate a compact video."
                })
              }
            }
          ]
        })
      );
    });
    const provider = new OpenAiCompatibleStoryboardProvider(
      { getConfiguration: () => createConfiguration() },
      { readCredential: async () => TEST_API_KEY },
      { fetchImpl: fetchMock }
    );

    const result = await provider.generateVisualStoryboard({
      task: createTask(),
      sourceBrief: "Long source brief. ".repeat(2000),
      panelCount: 6
    });
    const firstBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
      messages: Array<{ content: string }>;
    };
    const retryBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body)) as {
      messages: Array<{ content: string }>;
    };

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(firstBody.messages[1]?.content.length).toBeGreaterThan(
      retryBody.messages[1]?.content.length
    );
    expect(retryBody.messages[1]?.content).toContain("compact retry prompt");
    expect(retryBody.messages[1]?.content).toContain("Confirmed editable script");
    expect(result.storyboard.title).toBe("压缩故事板");
    expect(result.promptPreview).toContain("compact retry prompt");
  });

  it("returns a local fallback storyboard when full and compact requests both time out", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("Gateway Time-out", { status: 504, statusText: "Gateway Time-out" })
    );
    const provider = new OpenAiCompatibleStoryboardProvider(
      { getConfiguration: () => createConfiguration() },
      { readCredential: async () => TEST_API_KEY },
      { fetchImpl: fetchMock }
    );

    const result = await provider.generateVisualStoryboard({
      task: {
        ...createTask(),
        finalScript: "先提出痛点，再展示步骤，最后提醒保存。"
      },
      sourceBrief: "Reference analysis with hook, proof and CTA.",
      panelCount: 6
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.storyboard.title).toContain("兜底版");
    expect(result.storyboard.shots).toHaveLength(6);
    expect(result.storyboard.boardImagePrompt).toContain("Panel 1");
    expect(result.storyboard.selectedScript).toContain("先提出痛点");
    expect(result.promptPreview).toContain("Fallback storyboard was generated locally");
  });
});
