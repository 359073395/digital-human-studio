// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { AvatarProviderUnavailableError } from "./avatarProvider";
import { HeyGenAvatarCatalog } from "./heyGenAvatarCatalog";

const TEST_API_KEY = "sk-heygen-secret-123456";

function createConfiguration(
  patch: Partial<ServiceConfiguration["settings"]> = {}
): ServiceConfiguration {
  return {
    providerId: "heygen",
    label: "HeyGen",
    kind: "avatar",
    settings: {
      baseUrl: "https://api.heygen.test",
      resolution: "1080p",
      enabled: true,
      ...patch
    },
    credentialConfigured: true,
    updatedAt: "2026-06-15T00:00:00.000Z"
  };
}

function createCatalog(options: {
  configuration?: ServiceConfiguration;
  apiKey?: string | null;
  fetchImpl: typeof fetch;
}): HeyGenAvatarCatalog {
  return new HeyGenAvatarCatalog(
    {
      getConfiguration: () => options.configuration ?? createConfiguration()
    },
    {
      readCredential: async () => ("apiKey" in options ? (options.apiKey ?? null) : TEST_API_KEY)
    },
    {
      fetchImpl: options.fetchImpl,
      limit: 2
    }
  );
}

describe("HeyGenAvatarCatalog", () => {
  it("lists and normalizes HeyGen avatar looks", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          data: {
            avatar_looks: [
              {
                avatar_id: "avatar-1",
                group_id: "group-1",
                name: "Presenter A",
                preview_image_url: "https://cdn.heygen.test/avatar-1.jpg",
                preview_video_url: "https://cdn.heygen.test/avatar-1.mp4",
                image_width: 720,
                image_height: 1280,
                gender: "female",
                default_voice_id: "voice-1",
                status: "completed"
              },
              {
                avatarId: "avatar-2",
                avatarName: "Presenter B",
                thumbnailUrl: "https://cdn.heygen.test/avatar-2.jpg"
              }
            ]
          }
        })
      );
    });

    const looks = await createCatalog({ fetchImpl: fetchMock }).listAvatarLooks();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;

    expect(url).toBe("https://api.heygen.test/v3/avatars/looks?limit=2");
    expect(headers["x-api-key"]).toBe(TEST_API_KEY);
    expect(looks).toEqual([
      {
        id: "avatar-1",
        groupId: "group-1",
        name: "Presenter A",
        previewImageUrl: "https://cdn.heygen.test/avatar-1.jpg",
        previewVideoUrl: "https://cdn.heygen.test/avatar-1.mp4",
        gender: "female",
        defaultVoiceId: "voice-1",
        status: "completed",
        avatarType: "",
        orientation: "portrait",
        imageWidth: 720,
        imageHeight: 1280
      },
      {
        id: "avatar-2",
        groupId: "",
        name: "Presenter B",
        previewImageUrl: "https://cdn.heygen.test/avatar-2.jpg",
        previewVideoUrl: "",
        gender: "",
        defaultVoiceId: "",
        status: "",
        avatarType: "",
        orientation: "unknown",
        imageWidth: undefined,
        imageHeight: undefined
      }
    ]);
  });

  it("is unavailable without enabled HeyGen credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    await expect(
      createCatalog({
        fetchImpl: fetchMock,
        configuration: createConfiguration({ enabled: false })
      }).listAvatarLooks()
    ).rejects.toBeInstanceOf(AvatarProviderUnavailableError);

    await expect(
      createCatalog({ fetchImpl: fetchMock, apiKey: null }).listAvatarLooks()
    ).rejects.toBeInstanceOf(AvatarProviderUnavailableError);
  });

  it("redacts HeyGen error bodies", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(`bad key ${TEST_API_KEY}`, { status: 401, statusText: "Unauthorized" });
    });

    await expect(createCatalog({ fetchImpl: fetchMock }).listAvatarLooks()).rejects.toThrow(
      "[REDACTED]"
    );
  });
});
