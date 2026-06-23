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
import { SubtitleFallbackProviderUnavailableError } from "./subtitleFallbackProvider";
import { OpenAiAsrSubtitleProvider } from "./openAiAsrSubtitleProvider";

const TEST_API_KEY = "sk-asr-secret-123456";
const TEST_LLM_API_KEY = "sk-llm-secret-123456";

let tempDir: string;
let avatarVideoPath: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-openai-asr-"));
  avatarVideoPath = path.join(tempDir, "avatar.mp4");
  fs.writeFileSync(avatarVideoPath, Buffer.from("fake-avatar-video"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function createTask(): VideoTask {
  return {
    id: "task-1",
    title: "ASR task",
    sourceScript: "Source script.",
    finalScript: "Final script.",
    similarityRisk: "low",
    scriptGenerationNotes: "",
    contentLanguage: "id-ID",
    generationMode: "preset-avatar",
    avatarMode: "preset-avatar",
    avatarDescriptionPrompt: "",
    motionPrompt: "",
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
    providerId: "asr",
    label: "ASR 转写",
    kind: "speech-to-text",
    settings: {
      baseUrl: "https://api.openai.test/v1",
      modelName: "whisper-1",
      enabled: true,
      ...patch
    },
    credentialConfigured: true,
    updatedAt: "2026-06-16T00:00:00.000Z"
  };
}

function createLlmConfiguration(
  patch: Partial<ServiceConfiguration["settings"]> = {}
): ServiceConfiguration {
  return {
    providerId: "llm",
    label: "大模型",
    kind: "language-model",
    settings: {
      baseUrl: "https://api.openai.test/v1",
      modelName: "gpt-5.5",
      enabled: true,
      ...patch
    },
    credentialConfigured: true,
    updatedAt: "2026-06-16T00:00:00.000Z"
  };
}

function createProvider(options: {
  configuration?: ServiceConfiguration;
  llmConfiguration?: ServiceConfiguration;
  apiKey?: string | null;
  llmApiKey?: string | null;
  fetchImpl: typeof fetch;
}): OpenAiAsrSubtitleProvider {
  return new OpenAiAsrSubtitleProvider(
    {
      getConfiguration: (providerId) =>
        providerId === "llm"
          ? (options.llmConfiguration ?? createLlmConfiguration())
          : (options.configuration ?? createConfiguration())
    },
    {
      readCredential: async (providerId) => {
        if (providerId === "llm") {
          return "llmApiKey" in options ? (options.llmApiKey ?? null) : TEST_LLM_API_KEY;
        }
        return "apiKey" in options ? (options.apiKey ?? null) : TEST_API_KEY;
      }
    },
    {
      fetchImpl: options.fetchImpl
    }
  );
}

describe("OpenAiAsrSubtitleProvider", () => {
  it("creates SRT subtitles through OpenAI audio transcriptions", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response("1\n00:00:00,000 --> 00:00:02,000\nHalo");
    });

    const result = await createProvider({ fetchImpl: fetchMock }).createSubtitleFile({
      task: createTask(),
      preset: OUTPUT_PRESETS[0],
      avatarVideoPath
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const formData = init.body as FormData;

    expect(url).toBe("https://api.openai.test/v1/audio/transcriptions");
    expect(init.headers).toMatchObject({
      authorization: `Bearer ${TEST_API_KEY}`
    });
    expect(formData.get("model")).toBe("whisper-1");
    expect(formData.get("response_format")).toBe("srt");
    expect(formData.get("language")).toBe("id");
    expect(formData.getAll("file")).toHaveLength(1);
    expect(result.srt).toContain("Halo");
  });

  it("rejects plain text transcription responses without a real subtitle timeline", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response("Halo dari model transcribe lain");
    });

    await expect(
      createProvider({
        fetchImpl: fetchMock,
        configuration: createConfiguration({ modelName: "gpt-4o-mini-transcribe" })
      }).createSubtitleFile({
        task: createTask(),
        preset: OUTPUT_PRESETS[0],
        avatarVideoPath
      })
    ).rejects.toThrow("没有返回字幕时间轴");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const formData = init.body as FormData;

    expect(formData.get("model")).toBe("gpt-4o-mini-transcribe");
    expect(formData.get("response_format")).toBe("text");
  });

  it("converts segment timestamp responses into SRT for non-whisper models", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return Response.json({
        segments: [
          { start: 0, end: 1.2, text: "Halo" },
          { start: 1.2, end: 2.6, text: "Ini subtitle nyata" }
        ]
      });
    });

    const result = await createProvider({
      fetchImpl: fetchMock,
      configuration: createConfiguration({ modelName: "gpt-4o-mini-transcribe" })
    }).createSubtitleFile({
      task: createTask(),
      preset: OUTPUT_PRESETS[0],
      avatarVideoPath
    });

    expect(result.srt).toContain("00:00:00,000 --> 00:00:01,200");
    expect(result.srt).toContain("Ini subtitle nyata");
  });

  it("requires an ASR model name when ASR is enabled", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    await expect(
      createProvider({
        fetchImpl: fetchMock,
        configuration: createConfiguration({ modelName: "" })
      }).createSubtitleFile({
        task: createTask(),
        preset: OUTPUT_PRESETS[0],
        avatarVideoPath
      })
    ).rejects.toBeInstanceOf(SubtitleFallbackProviderUnavailableError);
  });

  it("reuses the LLM configuration when standalone ASR is disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return Response.json({
        segments: [{ start: 0, end: 2, text: "Shared LLM transcript" }]
      });
    });

    const result = await createProvider({
      fetchImpl: fetchMock,
      configuration: createConfiguration({ enabled: false, modelName: "" }),
      llmConfiguration: createLlmConfiguration({ modelName: "gpt-5.5" })
    }).createSubtitleFile({
      task: createTask(),
      preset: OUTPUT_PRESETS[0],
      avatarVideoPath
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const formData = init.body as FormData;

    expect(url).toBe("https://api.openai.test/v1/audio/transcriptions");
    expect(init.headers).toMatchObject({
      authorization: `Bearer ${TEST_LLM_API_KEY}`
    });
    expect(formData.get("model")).toBe("gpt-5.5");
    expect(result.srt).toContain("00:00:00,000 --> 00:00:02,000");
    expect(result.srt).toContain("Shared LLM transcript");
  });

  it("prompts for standalone ASR when the shared LLM cannot transcribe audio", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response("unsupported audio", { status: 400, statusText: "Bad Request" });
    });

    await expect(
      createProvider({
        fetchImpl: fetchMock,
        configuration: createConfiguration({ enabled: false, modelName: "" }),
        llmConfiguration: createLlmConfiguration({ modelName: "text-only-model" })
      }).createSubtitleFile({
        task: createTask(),
        preset: OUTPUT_PRESETS[0],
        avatarVideoPath
      })
    ).rejects.toThrow("请在设置里启用 ASR 转写并填写支持音频转写的模型");
  });

  it("is unavailable when enabled but missing ASR credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    await expect(
      createProvider({ fetchImpl: fetchMock, apiKey: null }).createSubtitleFile({
        task: createTask(),
        preset: OUTPUT_PRESETS[0],
        avatarVideoPath
      })
    ).rejects.toBeInstanceOf(SubtitleFallbackProviderUnavailableError);
  });

  it("redacts ASR error bodies", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(`bad key ${TEST_API_KEY}`, { status: 401, statusText: "Unauthorized" });
    });

    try {
      await createProvider({ fetchImpl: fetchMock }).createSubtitleFile({
        task: createTask(),
        preset: OUTPUT_PRESETS[0],
        avatarVideoPath
      });
      throw new Error("Expected provider to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("[REDACTED]");
      expect((error as Error).message).not.toContain(TEST_API_KEY);
    }
  });
});
