// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COVER_STYLE,
  DEFAULT_FRAME_TITLE_STYLE,
  DEFAULT_PERSONAL_IP_PROFILE,
  DEFAULT_SUBTITLE_STYLE,
  OUTPUT_PRESETS,
  type VideoTask
} from "../../shared/domain";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { AvatarProviderUnavailableError } from "./avatarProvider";
import { HeyGenAvatarProvider } from "./heyGenAvatarProvider";

const TEST_API_KEY = "sk-heygen-secret-123456";

function createTask(): VideoTask {
  return {
    id: "task-1",
    title: "HeyGen task",
    sourceScript: "Source script.",
    finalScript: "Final script for the avatar.",
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
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z"
  };
}

function createImagePresenterTask(): VideoTask {
  return {
    ...createTask(),
    generationMode: "product-avatar",
    avatarMode: "image-presenter",
    avatarDescriptionPrompt: "年轻印尼女主播，手拿商品。",
    motionPrompt: "手拿商品靠近镜头展示，轻微点头。"
  };
}

function createConfiguration(
  patch: Partial<ServiceConfiguration["settings"]> = {}
): ServiceConfiguration {
  return {
    providerId: "heygen",
    label: "HeyGen",
    kind: "avatar",
    settings: {
      baseUrl: "https://api.heygen.test",
      avatarId: "avatar-123",
      voiceId: "voice-456",
      resolution: "1080p",
      enabled: true,
      ...patch
    },
    credentialConfigured: true,
    updatedAt: "2026-06-15T00:00:00.000Z"
  };
}

function createProvider(options: {
  configuration?: ServiceConfiguration;
  apiKey?: string | null;
  fetchImpl: typeof fetch;
}): HeyGenAvatarProvider {
  return new HeyGenAvatarProvider(
    {
      getConfiguration: () => options.configuration ?? createConfiguration()
    },
    {
      readCredential: async () => ("apiKey" in options ? (options.apiKey ?? null) : TEST_API_KEY)
    },
    {
      fetchImpl: options.fetchImpl,
      pollIntervalMs: 0,
      maxPollAttempts: 2
    }
  );
}

describe("HeyGenAvatarProvider", () => {
  it("creates, polls, and maps a HeyGen avatar render", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/v3/videos") && init?.method === "POST") {
        return new Response(JSON.stringify({ data: { video_id: "video-123" } }));
      }

      return new Response(
        JSON.stringify({
          data: {
            status: "completed",
            video_url: "https://cdn.heygen.test/video.mp4",
            caption_url: "https://cdn.heygen.test/caption.srt",
            thumbnail_url: "https://cdn.heygen.test/thumb.jpg",
            duration: 12
          }
        })
      );
    });

    const result = await createProvider({ fetchImpl: fetchMock }).renderAvatar({
      task: createTask(),
      preset: OUTPUT_PRESETS[0]
    });
    const [createUrl, createInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const createBody = JSON.parse(String(createInit.body)) as Record<string, unknown>;
    const headers = createInit.headers as Record<string, string>;

    expect(createUrl).toBe("https://api.heygen.test/v3/videos");
    expect(headers["x-api-key"]).toBe(TEST_API_KEY);
    expect(headers["idempotency-key"]).toBe("task-1-portrait-9-16");
    expect(JSON.stringify(createBody)).not.toContain(TEST_API_KEY);
    expect(createBody).toMatchObject({
      type: "avatar",
      avatar_id: "avatar-123",
      voice_id: "voice-456",
      script: "Final script for the avatar.",
      aspect_ratio: "9:16",
      resolution: "1080p",
      output_format: "mp4"
    });
    expect(createBody.voice_settings).toMatchObject({ locale: "id-ID" });
    expect(result).toMatchObject({
      presetId: "portrait-9-16",
      providerVideoId: "video-123",
      videoUrl: "https://cdn.heygen.test/video.mp4",
      captionUrl: "https://cdn.heygen.test/caption.srt",
      thumbnailUrl: "https://cdn.heygen.test/thumb.jpg",
      durationSeconds: 12
    });
  });

  it("uploads a generated presenter image and creates an image-based HeyGen render", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-heygen-image-"));
    const imagePath = path.join(tempDir, "presenter.png");
    fs.writeFileSync(imagePath, Buffer.from("fake-image"));
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/v3/assets") && init?.method === "POST") {
        return new Response(JSON.stringify({ data: { asset_id: "asset-image-123" } }));
      }

      if (String(url).endsWith("/v3/videos") && init?.method === "POST") {
        return new Response(JSON.stringify({ data: { video_id: "video-image-123" } }));
      }

      return new Response(
        JSON.stringify({
          data: {
            status: "completed",
            video_url: "https://cdn.heygen.test/image-video.mp4"
          }
        })
      );
    });

    try {
      const result = await createProvider({
        fetchImpl: fetchMock,
        configuration: createConfiguration({ avatarId: "" })
      }).renderAvatar({
        task: createImagePresenterTask(),
        preset: OUTPUT_PRESETS[0],
        imagePath
      });
      const [assetUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
      const [createUrl, createInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      const createBody = JSON.parse(String(createInit.body)) as Record<string, unknown>;

      expect(assetUrl).toBe("https://api.heygen.test/v3/assets");
      expect(createUrl).toBe("https://api.heygen.test/v3/videos");
      expect(createBody).toMatchObject({
        type: "image",
        script: "Final script for the avatar.",
        motion_prompt: "手拿商品靠近镜头展示，轻微点头。"
      });
      expect(createBody.image).toMatchObject({
        type: "asset_id",
        asset_id: "asset-image-123"
      });
      expect(result.videoUrl).toBe("https://cdn.heygen.test/image-video.mp4");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("is unavailable when HeyGen is disabled, missing credentials, or missing avatar ID", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    await expect(
      createProvider({
        fetchImpl: fetchMock,
        configuration: createConfiguration({ enabled: false })
      }).renderAvatar({ task: createTask(), preset: OUTPUT_PRESETS[0] })
    ).rejects.toBeInstanceOf(AvatarProviderUnavailableError);

    await expect(
      createProvider({ fetchImpl: fetchMock, apiKey: null }).renderAvatar({
        task: createTask(),
        preset: OUTPUT_PRESETS[0]
      })
    ).rejects.toBeInstanceOf(AvatarProviderUnavailableError);

    await expect(
      createProvider({
        fetchImpl: fetchMock,
        configuration: createConfiguration({ avatarId: "" })
      }).renderAvatar({ task: createTask(), preset: OUTPUT_PRESETS[0] })
    ).rejects.toBeInstanceOf(AvatarProviderUnavailableError);
  });

  it("redacts HeyGen error bodies", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(`bad key ${TEST_API_KEY}`, { status: 401, statusText: "Unauthorized" });
    });

    try {
      await createProvider({ fetchImpl: fetchMock }).renderAvatar({
        task: createTask(),
        preset: OUTPUT_PRESETS[0]
      });
      throw new Error("Expected provider to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("[REDACTED]");
      expect((error as Error).message).not.toContain(TEST_API_KEY);
    }
  });
});
