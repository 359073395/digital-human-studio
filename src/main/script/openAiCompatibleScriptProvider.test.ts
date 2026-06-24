// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COVER_STYLE,
  DEFAULT_CREATIVE_WORKFLOW,
  DEFAULT_FRAME_TITLE_STYLE,
  DEFAULT_PERSONAL_IP_PROFILE,
  DEFAULT_SUBTITLE_STYLE,
  type VideoTask
} from "../../shared/domain";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { OpenAiCompatibleScriptProvider } from "./openAiCompatibleScriptProvider";
import { ScriptProviderUnavailableError } from "./scriptProvider";

const TEST_API_KEY = "sk-secret-token-123456";

function createTask(): VideoTask {
  return {
    id: "task-1",
    title: "Script task",
    sourceScript: "If viewers watch but do not buy, the hook needs a stronger buying reason.",
    finalScript: "",
    similarityRisk: "unknown",
    scriptGenerationNotes: "",
    contentLanguage: "en-US",
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

function createConfiguration(
  patch: Partial<ServiceConfiguration["settings"]> = {}
): ServiceConfiguration {
  return {
    providerId: "llm",
    label: "大模型",
    kind: "language-model",
    settings: {
      baseUrl: "https://llm.example/v1",
      modelName: "script-model",
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
}): OpenAiCompatibleScriptProvider {
  return new OpenAiCompatibleScriptProvider(
    {
      getConfiguration: () => options.configuration ?? createConfiguration()
    },
    {
      readCredential: async () => ("apiKey" in options ? (options.apiKey ?? null) : TEST_API_KEY)
    }
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAiCompatibleScriptProvider", () => {
  it("builds an OpenAI-compatible request without leaking the API key into the body", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  finalScript: "Open with the buying reason, then prove it with one clear example.",
                  similarityRisk: "low",
                  notes: "Changed wording, proof, and rhythm."
                })
              }
            }
          ]
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createProvider({}).generate(createTask());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestBody = String(init.body);

    expect(url).toBe("https://llm.example/v1/chat/completions");
    expect(init.headers).toMatchObject({
      authorization: `Bearer ${TEST_API_KEY}`
    });
    expect(requestBody).toContain('"model":"script-model"');
    expect(requestBody).toContain("Return JSON exactly in this shape");
    expect(requestBody).not.toContain(TEST_API_KEY);
    expect(result.promptPreview).not.toContain(TEST_API_KEY);
    expect(result).toMatchObject({
      finalScript: "Open with the buying reason, then prove it with one clear example.",
      similarityRisk: "low",
      notes: "Changed wording, proof, and rhythm."
    });
  });

  it("parses JSON returned inside a markdown fence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '```json\n{"finalScript":"A new script.","similarityRisk":"medium","notes":"Fence parsed."}\n```'
                }
              }
            ]
          })
        );
      })
    );

    const result = await createProvider({}).generate(createTask());

    expect(result.finalScript).toBe("A new script.");
    expect(result.similarityRisk).toBe("medium");
  });

  it("is unavailable when the LLM is disabled or no API key is configured", async () => {
    await expect(
      createProvider({
        configuration: createConfiguration({ enabled: false })
      }).generate(createTask())
    ).rejects.toBeInstanceOf(ScriptProviderUnavailableError);

    await expect(
      createProvider({
        apiKey: null
      }).generate(createTask())
    ).rejects.toBeInstanceOf(ScriptProviderUnavailableError);
  });

  it("redacts provider error bodies before surfacing failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(`upstream rejected ${TEST_API_KEY}`, {
          status: 500,
          statusText: "Internal Server Error"
        });
      })
    );

    try {
      await createProvider({}).generate(createTask());
      throw new Error("Expected provider to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("[REDACTED]");
      expect((error as Error).message).not.toContain(TEST_API_KEY);
    }
  });
});
