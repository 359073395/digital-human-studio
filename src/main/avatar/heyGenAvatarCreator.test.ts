// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { AvatarProviderUnavailableError } from "./avatarProvider";
import { HeyGenAvatarCreator } from "./heyGenAvatarCreator";

function createConfiguration(
  patch: Partial<ServiceConfiguration["settings"]> = {}
): ServiceConfiguration {
  return {
    providerId: "heygen",
    label: "HeyGen",
    kind: "avatar",
    settings: {
      baseUrl: "https://api.heygen.test",
      authMode: "api-key",
      resolution: "1080p",
      enabled: true,
      ...patch
    },
    credentialConfigured: true,
    updatedAt: "2026-06-15T00:00:00.000Z"
  };
}

function createCreator(options: {
  configuration?: ServiceConfiguration;
  credential?: string | null;
  fetchImpl: typeof fetch;
}): HeyGenAvatarCreator {
  return new HeyGenAvatarCreator(
    {
      getConfiguration: () => options.configuration ?? createConfiguration()
    },
    {
      readCredential: async () =>
        "credential" in options ? (options.credential ?? null) : "heygen-key"
    },
    {
      fetchImpl: options.fetchImpl,
      pollIntervalMs: 0,
      maxPollAttempts: 2
    }
  );
}

describe("HeyGenAvatarCreator", () => {
  it("creates a prompt avatar and returns the ready look", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/v3/avatars") && init?.method === "POST") {
        expect((init.headers as Record<string, string>)["x-api-key"]).toBe("heygen-key");
        expect(JSON.parse(String(init.body))).toMatchObject({
          type: "prompt",
          name: "带货主播",
          prompt: "年轻自然的带货主播",
          avatar_group_id: "group-existing"
        });
        return new Response(
          JSON.stringify({
            data: {
              avatar_item: {
                id: "look-created",
                group_id: "group-existing",
                name: "带货主播"
              }
            }
          })
        );
      }

      return new Response(
        JSON.stringify({
          data: {
            avatar_looks: [
              {
                id: "look-created",
                group_id: "group-existing",
                name: "带货主播",
                preview_image_url: "https://cdn.heygen.test/look.png",
                image_width: 720,
                image_height: 1280
              }
            ]
          }
        })
      );
    });

    const result = await createCreator({ fetchImpl: fetchMock }).createPromptAvatar({
      name: "带货主播",
      prompt: "年轻自然的带货主播",
      avatarGroupId: "group-existing"
    });

    expect(result.look).toMatchObject({
      id: "look-created",
      groupId: "group-existing",
      previewImageUrl: "https://cdn.heygen.test/look.png",
      orientation: "portrait"
    });
  });

  it("uses Bearer auth when configured for member/OAuth mode", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer oauth-token");
      return new Response(
        JSON.stringify({
          data: {
            avatar_item: {
              id: "look-created",
              group_id: "group-created",
              preview_image_url: "https://cdn.heygen.test/look.png"
            }
          }
        })
      );
    });

    await createCreator({
      fetchImpl: fetchMock,
      credential: "oauth-token",
      configuration: createConfiguration({ authMode: "oauth-bearer" })
    }).createPromptAvatar({
      name: "主播",
      prompt: "自然可信"
    });
  });

  it("is unavailable without credentials", async () => {
    await expect(
      createCreator({ fetchImpl: vi.fn<typeof fetch>(), credential: null }).createPromptAvatar({
        name: "主播",
        prompt: "自然可信"
      })
    ).rejects.toBeInstanceOf(AvatarProviderUnavailableError);
  });
});
