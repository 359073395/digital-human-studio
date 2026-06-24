// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
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
import { AvatarProviderUnavailableError } from "./avatarProvider";
import { HeyGenAvatarProvider } from "./heyGenAvatarProvider";
import { stringifyHeyGenOAuthCredential } from "./heyGenAuth";

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
    mixedCutTargetCount: 1,
    mixedCutMaterialDirectory: "",
    mixedCutBackgroundMusicDirectory: "",
    mixedCutDubbingDirectory: "",
    mixedCutChapterMode: "fill-with-bgm",
    mixedCutReuseRate: 35,
    mixedCutRemoveOriginalAudio: false,
    mixedCutEnableTransitions: false,
    mixedCutBgmVolume: 70,
    dedupTargetScore: 80,
    dedupStrategy: "content-rewrite",
    dedupAttemptCount: 0,
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

  it("resolves an avatar group to an orientation-matching look before rendering", async () => {
    const task = {
      ...createTask(),
      presetAvatarId: "",
      presetAvatarGroupId: "group-123",
      selectedOutputPresets: ["landscape-16-9" as const]
    };
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).includes("/v3/avatars/looks")) {
        return new Response(
          JSON.stringify({
            data: {
              avatar_looks: [
                {
                  id: "look-portrait",
                  group_id: "group-123",
                  image_width: 720,
                  image_height: 1280
                },
                {
                  id: "look-landscape",
                  group_id: "group-123",
                  image_width: 1280,
                  image_height: 720
                }
              ]
            }
          })
        );
      }

      if (String(url).endsWith("/v3/videos") && init?.method === "POST") {
        return new Response(JSON.stringify({ data: { video_id: "video-123" } }));
      }

      return new Response(
        JSON.stringify({
          data: {
            status: "completed",
            video_url: "https://cdn.heygen.test/video.mp4"
          }
        })
      );
    });

    await createProvider({
      fetchImpl: fetchMock,
      configuration: createConfiguration({ avatarId: "" })
    }).renderAvatar({
      task,
      preset: OUTPUT_PRESETS[1]
    });
    const [, createInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const createBody = JSON.parse(String(createInit.body)) as Record<string, unknown>;

    expect(createBody.avatar_id).toBe("look-landscape");
  });

  it("uses Bearer auth and Video Agent route for HeyGen member/OAuth mode", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer oauth-token");
      if (String(url).endsWith("/v3/video-agents") && init?.method === "POST") {
        return new Response(JSON.stringify({ data: { session_id: "session-123" } }));
      }

      if (String(url).endsWith("/v3/video-agents/session-123") && init?.method === "GET") {
        return new Response(JSON.stringify({ data: { video_id: "video-123" } }));
      }

      return new Response(
        JSON.stringify({
          data: {
            status: "completed",
            video_url: "https://cdn.heygen.test/video.mp4"
          }
        })
      );
    });

    await createProvider({
      fetchImpl: fetchMock,
      apiKey: "oauth-token",
      configuration: createConfiguration({ authMode: "oauth-bearer" })
    }).renderAvatar({
      task: createTask(),
      preset: OUTPUT_PRESETS[0]
    });
    const [createUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(createUrl).toBe("https://api.heygen.test/v3/video-agents");
  });

  it("refreshes an expired HeyGen OAuth credential before rendering", async () => {
    let savedCredential = stringifyHeyGenOAuthCredential({
      kind: "heygen-oauth-v1",
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      tokenType: "Bearer"
    });
    const seenAuthorizations: Array<string | undefined> = [];
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/oauth/refresh_token")) {
        const body = init?.body instanceof URLSearchParams ? init.body.toString() : "";
        expect(body).toContain("client_id=client-123");
        expect(body).toContain("grant_type=refresh_token");
        expect(body).toContain("refresh_token=refresh-token");
        return Response.json({
          access_token: "fresh-token",
          refresh_token: "fresh-refresh-token",
          expires_in: 864000,
          token_type: "Bearer"
        });
      }

      seenAuthorizations.push((init?.headers as Record<string, string>).authorization);
      if (String(url).endsWith("/v3/video-agents") && init?.method === "POST") {
        return new Response(JSON.stringify({ data: { session_id: "session-123" } }));
      }

      if (String(url).endsWith("/v3/video-agents/session-123") && init?.method === "GET") {
        return new Response(JSON.stringify({ data: { video_id: "video-123" } }));
      }

      return new Response(
        JSON.stringify({
          data: {
            status: "completed",
            video_url: "https://cdn.heygen.test/video.mp4"
          }
        })
      );
    });

    const provider = new HeyGenAvatarProvider(
      {
        getConfiguration: () =>
          createConfiguration({
            authMode: "oauth-bearer",
            oauthClientId: "client-123",
            oauthRefreshTokenUrl: "https://api2.heygen.com/v1/oauth/refresh_token"
          })
      },
      {
        readCredential: async () => savedCredential,
        saveCredential: async (_providerId, secret) => {
          savedCredential = secret;
        }
      },
      {
        fetchImpl: fetchMock,
        pollIntervalMs: 0,
        maxPollAttempts: 2
      }
    );

    const result = await provider.renderAvatar({
      task: createTask(),
      preset: OUTPUT_PRESETS[0]
    });

    expect(result.videoUrl).toBe("https://cdn.heygen.test/video.mp4");
    expect(savedCredential).toContain("fresh-token");
    expect(seenAuthorizations).toEqual([
      "Bearer fresh-token",
      "Bearer fresh-token",
      "Bearer fresh-token"
    ]);
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

  it("uses a built-in HeyGen voice when no voice ID is configured", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-heygen-default-voice-"));
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
      await createProvider({
        fetchImpl: fetchMock,
        configuration: createConfiguration({ avatarId: "", voiceId: "" })
      }).renderAvatar({
        task: createImagePresenterTask(),
        preset: OUTPUT_PRESETS[0],
        imagePath
      });
      const [, createInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      const createBody = JSON.parse(String(createInit.body)) as Record<string, unknown>;

      expect(createBody.voice_id).toBe("06e81a5d7c8b41818d3f0b38f7cf15a1");
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

  it("explains API credit failures for API Key mode", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          message: "Insufficient credit. This operation requires 'api' credits."
        }),
        { status: 402, statusText: "Payment Required" }
      );
    });

    await expect(
      createProvider({ fetchImpl: fetchMock }).renderAvatar({
        task: createTask(),
        preset: OUTPUT_PRESETS[0]
      })
    ).rejects.toThrow("已自动尝试 HeyGen Video Agent 会员路由");
  });

  it("falls back to Video Agent when Direct Video requires API credits", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/v3/videos") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            message: "Insufficient credit. This operation requires 'api' credits."
          }),
          { status: 402, statusText: "Payment Required" }
        );
      }

      if (String(url).endsWith("/v3/video-agents") && init?.method === "POST") {
        return new Response(JSON.stringify({ data: { session_id: "session-123" } }));
      }

      if (String(url).endsWith("/v3/video-agents/session-123") && init?.method === "GET") {
        return new Response(JSON.stringify({ data: { video_id: "video-123" } }));
      }

      return new Response(
        JSON.stringify({
          data: {
            status: "completed",
            video_url: "https://cdn.heygen.test/video.mp4"
          }
        })
      );
    });

    const result = await createProvider({ fetchImpl: fetchMock }).renderAvatar({
      task: createTask(),
      preset: OUTPUT_PRESETS[0]
    });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.heygen.test/v3/videos",
      "https://api.heygen.test/v3/video-agents",
      "https://api.heygen.test/v3/video-agents/session-123",
      "https://api.heygen.test/v3/videos/video-123"
    ]);
    expect(result.videoUrl).toBe("https://cdn.heygen.test/video.mp4");
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
