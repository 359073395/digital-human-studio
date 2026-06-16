// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COVER_STYLE,
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

function createProvider(options: {
  configuration?: ServiceConfiguration;
  apiKey?: string | null;
  fetchImpl: typeof fetch;
}): OpenAiAsrSubtitleProvider {
  return new OpenAiAsrSubtitleProvider(
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

  it("is unavailable when disabled or missing credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    await expect(
      createProvider({
        fetchImpl: fetchMock,
        configuration: createConfiguration({ enabled: false })
      }).createSubtitleFile({
        task: createTask(),
        preset: OUTPUT_PRESETS[0],
        avatarVideoPath
      })
    ).rejects.toBeInstanceOf(SubtitleFallbackProviderUnavailableError);

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
