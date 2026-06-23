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
});
