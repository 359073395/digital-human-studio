// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COVER_STYLE,
  DEFAULT_CREATIVE_WORKFLOW,
  DEFAULT_FRAME_TITLE_STYLE,
  DEFAULT_PERSONAL_IP_PROFILE,
  DEFAULT_SUBTITLE_STYLE,
  OUTPUT_PRESETS,
  type VideoTask
} from "../../shared/domain";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { ImageProviderUnavailableError } from "./imageProvider";
import { OpenAiImageProvider } from "./openAiImageProvider";

const TEST_API_KEY = "sk-image-secret-123456";

let tempDir: string;
let productImagePath: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-openai-image-"));
  productImagePath = path.join(tempDir, "product.png");
  fs.writeFileSync(productImagePath, Buffer.from("fake-product-image"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function createTask(): VideoTask {
  return {
    id: "task-1",
    title: "Image task",
    sourceScript: "Source script.",
    finalScript: "Final script.",
    similarityRisk: "low",
    scriptGenerationNotes: "",
    contentLanguage: "id-ID",
    generationMode: "product-avatar",
    avatarMode: "image-presenter",
    avatarDescriptionPrompt: "年轻印尼女主播，亲和自然，穿白色衬衫，手拿护肤品。",
    motionPrompt: "手拿商品靠近镜头展示，轻微点头。",
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
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z"
  };
}

function createConfiguration(
  patch: Partial<ServiceConfiguration["settings"]> = {}
): ServiceConfiguration {
  return {
    providerId: "image",
    label: "OpenAI 图片",
    kind: "image-generation",
    settings: {
      baseUrl: "https://api.openai.test/v1",
      modelName: "gpt-image-2",
      enabled: true,
      ...patch
    },
    credentialConfigured: true,
    updatedAt: "2026-06-16T00:00:00.000Z"
  };
}

function createProvider(options: {
  configuration?: ServiceConfiguration;
  apiKey?: string | null;
  fetchImpl: typeof fetch;
}): OpenAiImageProvider {
  return new OpenAiImageProvider(
    {
      getConfiguration: () => options.configuration ?? createConfiguration()
    },
    {
      readCredential: async () => ("apiKey" in options ? (options.apiKey ?? null) : TEST_API_KEY)
    },
    {
      fetchImpl: options.fetchImpl
    }
  );
}

describe("OpenAiImageProvider", () => {
  it("generates a product presenter image through OpenAI image edits", async () => {
    const imageBytes = Buffer.from("generated-image");
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          data: [{ b64_json: imageBytes.toString("base64") }]
        })
      );
    });

    const result = await createProvider({ fetchImpl: fetchMock }).generateProductPresenterImage({
      task: createTask(),
      preset: OUTPUT_PRESETS[0],
      productImagePath
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const formData = init.body as FormData;

    expect(url).toBe("https://api.openai.test/v1/images/edits");
    expect(init.headers).toMatchObject({
      authorization: `Bearer ${TEST_API_KEY}`
    });
    expect(formData.get("model")).toBe("gpt-image-2");
    expect(formData.get("size")).toBe("1024x1536");
    expect(formData.getAll("image[]")).toHaveLength(1);
    expect(formData.get("image")).toBeNull();
    expect(String(formData.get("prompt"))).toContain("年轻印尼女主播");
    expect(String(formData.get("prompt"))).toContain("手拿商品靠近镜头展示");
    expect(String(formData.get("prompt"))).not.toContain(TEST_API_KEY);
    expect(result.imageBytes.toString()).toBe("generated-image");
    expect(result.extension).toBe("png");
  });

  it("generates a visual storyboard image through OpenAI image generations", async () => {
    const imageBytes = Buffer.from("storyboard-image");
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          data: [{ b64_json: imageBytes.toString("base64") }]
        })
      );
    });

    const result = await createProvider({ fetchImpl: fetchMock }).generateVisualStoryboardImage({
      prompt: "Create one visual storyboard with 8 consistent panels."
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;

    expect(url).toBe("https://api.openai.test/v1/images/generations");
    expect(init.headers).toMatchObject({
      authorization: `Bearer ${TEST_API_KEY}`
    });
    expect(requestBody).toMatchObject({
      model: "gpt-image-2",
      size: "1536x1024",
      response_format: "b64_json"
    });
    expect(String(requestBody.prompt)).toContain("visual storyboard");
    expect(String(init.body)).not.toContain(TEST_API_KEY);
    expect(result.imageBytes.toString()).toBe("storyboard-image");
  });

  it("is unavailable when the image provider is disabled or missing credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    await expect(
      createProvider({
        fetchImpl: fetchMock,
        configuration: createConfiguration({ enabled: false })
      }).generateProductPresenterImage({
        task: createTask(),
        preset: OUTPUT_PRESETS[0],
        productImagePath
      })
    ).rejects.toBeInstanceOf(ImageProviderUnavailableError);

    await expect(
      createProvider({ fetchImpl: fetchMock, apiKey: null }).generateProductPresenterImage({
        task: createTask(),
        preset: OUTPUT_PRESETS[0],
        productImagePath
      })
    ).rejects.toBeInstanceOf(ImageProviderUnavailableError);
  });

  it("redacts OpenAI image error bodies", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(`bad key ${TEST_API_KEY}`, { status: 401, statusText: "Unauthorized" });
    });

    try {
      await createProvider({ fetchImpl: fetchMock }).generateProductPresenterImage({
        task: createTask(),
        preset: OUTPUT_PRESETS[0],
        productImagePath
      });
      throw new Error("Expected provider to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("[REDACTED]");
      expect((error as Error).message).not.toContain(TEST_API_KEY);
    }
  });
});
