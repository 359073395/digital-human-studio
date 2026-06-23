// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppPaths } from "./appPaths";
import { CredentialStore, type SecretCipher } from "./credentialStore";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "./database";
import { ServiceConfigurationRepository } from "./serviceConfigurationRepository";

class PrefixCipher implements SecretCipher {
  isAvailable(): boolean {
    return true;
  }

  async encrypt(value: string): Promise<string> {
    return `encrypted:${value}`;
  }

  async decrypt(encryptedValue: string): Promise<string> {
    return encryptedValue.replace(/^encrypted:/, "");
  }
}

let tempDir: string;
let database: TaskDatabase;
let repository: ServiceConfigurationRepository;
let credentialStore: CredentialStore;
let credentialFilePath: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-service-config-"));
  const appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  credentialFilePath = path.join(tempDir, "credentials.json");
  credentialStore = new CredentialStore(credentialFilePath, new PrefixCipher());
  repository = new ServiceConfigurationRepository(database, credentialStore);
});

afterEach(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("ServiceConfigurationRepository", () => {
  it("lists default provider configurations", () => {
    const configurations = repository.listConfigurations();

    expect(configurations.map((configuration) => configuration.providerId)).toEqual([
      "heygen",
      "source-parser",
      "llm",
      "image",
      "video",
      "asr",
      "tts"
    ]);
    expect(
      configurations.find((configuration) => configuration.providerId === "llm")?.settings.modelName
    ).toBe("gpt-4.1-mini");
    expect(
      configurations.find((configuration) => configuration.providerId === "image")?.settings
        .modelName
    ).toBe("gpt-image-2");
    expect(
      configurations.find((configuration) => configuration.providerId === "asr")?.settings.modelName
    ).toBe("");
    expect(
      configurations.find((configuration) => configuration.providerId === "asr")?.settings.enabled
    ).toBe(false);
    expect(
      configurations.find((configuration) => configuration.providerId === "source-parser")?.settings
        .baseUrl
    ).toBe("https://jiexi.hyjiexi.eu.org");
  });

  it("saves non-secret settings in SQLite and secret values outside SQLite", async () => {
    await repository.saveConfiguration({
      providerId: "llm",
      settings: {
        baseUrl: "https://example.test/v1",
        modelName: "custom-model",
        enabled: true
      },
      apiKey: "secret-api-key"
    });

    const configuration = repository.getConfiguration("llm");
    const sqliteBytes = fs.readFileSync(createAppPaths(tempDir).databasePath);
    const credentialFile = fs.readFileSync(credentialFilePath, "utf8");

    expect(configuration.settings.baseUrl).toBe("https://example.test/v1");
    expect(configuration.credentialConfigured).toBe(true);
    expect(sqliteBytes.toString("utf8")).not.toContain("secret-api-key");
    expect(credentialFile).not.toContain('"secret-api-key"');
  });

  it("saves HeyGen avatar defaults as non-secret settings", async () => {
    await repository.saveConfiguration({
      providerId: "heygen",
      settings: {
        baseUrl: "https://api.heygen.test",
        authMode: "oauth-bearer",
        avatarId: "avatar-123",
        voiceId: "voice-456",
        resolution: "1080p",
        enabled: true
      },
      apiKey: "heygen-secret"
    });

    const configuration = repository.getConfiguration("heygen");
    const sqliteBytes = fs.readFileSync(createAppPaths(tempDir).databasePath, "utf8");

    expect(configuration.settings).toMatchObject({
      authMode: "oauth-bearer",
      avatarId: "avatar-123",
      voiceId: "voice-456",
      resolution: "1080p"
    });
    expect(sqliteBytes).not.toContain("heygen-secret");
  });

  it("tests HeyGen credentials with a real API-style request", async () => {
    const seenRequests: Array<{ url: string; xApiKey?: string; authorization?: string }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const headers = init?.headers as Record<string, string>;
      seenRequests.push({
        url: String(url),
        xApiKey: headers?.["x-api-key"],
        authorization: headers?.authorization
      });
      const data = String(url).endsWith("/v3/users/me")
        ? { billing_type: "subscription" }
        : { avatar_looks: [{ id: "avatar-123" }] };
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };
    repository = new ServiceConfigurationRepository(database, credentialStore, fetchImpl);

    await expect(repository.testConfiguration("heygen")).resolves.toMatchObject({
      ok: false,
      message: "HeyGen API Key 尚未配置"
    });

    await repository.saveConfiguration({
      providerId: "heygen",
      settings: { baseUrl: "https://api.heygen.com/v2", avatarId: "", enabled: true },
      apiKey: "heygen-key"
    });

    await expect(repository.testConfiguration("heygen")).resolves.toMatchObject({
      ok: true,
      message: "HeyGen 测试通过，计费类型 subscription；预设数字人会在任务里自动读取后选择"
    });
    expect(seenRequests).toEqual([
      {
        url: "https://api.heygen.com/v3/users/me",
        xApiKey: "heygen-key",
        authorization: undefined
      },
      {
        url: "https://api.heygen.com/v3/avatars/looks?limit=1",
        xApiKey: "heygen-key",
        authorization: undefined
      }
    ]);
  });

  it("uses Bearer auth when HeyGen member/OAuth mode is selected", async () => {
    const seenAuthorizations: Array<string | undefined> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      seenAuthorizations.push((init?.headers as Record<string, string>).authorization);
      const data = String(url).endsWith("/v3/users/me")
        ? { billing_type: "subscription" }
        : { avatar_looks: [{ id: "avatar-123" }] };
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };
    repository = new ServiceConfigurationRepository(database, credentialStore, fetchImpl);

    await repository.saveConfiguration({
      providerId: "heygen",
      settings: {
        baseUrl: "https://api.heygen.com",
        authMode: "oauth-bearer",
        enabled: true
      },
      apiKey: "oauth-token"
    });

    await expect(repository.testConfiguration("heygen")).resolves.toMatchObject({ ok: true });
    expect(seenAuthorizations).toEqual(["Bearer oauth-token", "Bearer oauth-token"]);
  });

  it("tests the source parser provider with the quota endpoint", async () => {
    const seenRequests: Array<{ url: string; xApiKey?: string }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      seenRequests.push({
        url: String(url),
        xApiKey: (init?.headers as Record<string, string>)["x-api-key"]
      });
      return new Response(
        JSON.stringify({
          limit: 100,
          used: 1,
          remaining: 99,
          unlimited: false
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    };
    repository = new ServiceConfigurationRepository(database, credentialStore, fetchImpl);

    await repository.saveConfiguration({
      providerId: "source-parser",
      settings: {
        baseUrl: "https://jiexi.example",
        enabled: true
      },
      apiKey: "parser-key"
    });

    await expect(repository.testConfiguration("source-parser")).resolves.toMatchObject({
      ok: true,
      message: "原视频解析下载测试通过，总额度 100，已用 1，剩余 99"
    });
    expect(seenRequests).toEqual([
      {
        url: "https://jiexi.example/api/v1/quota",
        xApiKey: "parser-key"
      }
    ]);
    expect(fs.readFileSync(createAppPaths(tempDir).databasePath, "utf8")).not.toContain(
      "parser-key"
    );
  });

  it("tests the LLM provider with the chat completions endpoint used by generation", async () => {
    const fetchImpl: typeof fetch = async (url, init) => {
      expect(url).toBe("https://example.test/v1/chat/completions");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer llm-key");
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: "custom-model" });
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };
    repository = new ServiceConfigurationRepository(database, credentialStore, fetchImpl);
    await repository.saveConfiguration({
      providerId: "llm",
      settings: {
        baseUrl: "https://example.test/v1",
        modelName: "custom-model",
        enabled: true
      },
      apiKey: "llm-key"
    });

    await expect(repository.testConfiguration("llm")).resolves.toMatchObject({
      ok: true,
      message: "大模型（OpenAI 兼容） 测试通过，custom-model 的 chat/completions 可用"
    });
  });

  it("lists OpenAI-compatible models from the current draft settings", async () => {
    const seenRequests: Array<{ url: string; authorization?: string }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      seenRequests.push({
        url: String(url),
        authorization: (init?.headers as Record<string, string>).authorization
      });
      return new Response(
        JSON.stringify({
          data: [{ id: "gpt-5.5" }, { id: "gpt-image-2" }, { id: "gpt-5.5" }]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    };
    repository = new ServiceConfigurationRepository(database, credentialStore, fetchImpl);

    const result = await repository.listModels({
      providerId: "llm",
      settings: {
        baseUrl: "https://relay.example/v1",
        enabled: true
      },
      apiKey: "draft-key"
    });

    expect(result).toMatchObject({
      ok: true,
      models: ["gpt-5.5", "gpt-image-2"]
    });
    expect(seenRequests).toEqual([
      {
        url: "https://relay.example/v1/models",
        authorization: "Bearer draft-key"
      }
    ]);
    expect(fs.readFileSync(createAppPaths(tempDir).databasePath, "utf8")).not.toContain(
      "draft-key"
    );
  });

  it("fetches video models when the OpenAI-compatible video provider is selected", async () => {
    const seenRequests: string[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      seenRequests.push(String(url));
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer video-key");
      return new Response(
        JSON.stringify({
          data: [{ id: "seedance-video" }, { id: "wan-video" }]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    };
    repository = new ServiceConfigurationRepository(database, credentialStore, fetchImpl);

    const result = await repository.listModels({
      providerId: "video",
      settings: {
        baseUrl: "https://video.example/v1",
        enabled: true
      },
      apiKey: "video-key"
    });

    expect(result).toMatchObject({
      ok: true,
      models: ["seedance-video", "wan-video"]
    });
    expect(seenRequests).toEqual(["https://video.example/v1/models"]);
  });

  it("checks whether the LLM configuration can be reused for ASR when standalone ASR is disabled", async () => {
    const fetchImpl: typeof fetch = async (url, init) => {
      expect(url).toBe("https://example.test/v1/audio/transcriptions");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer llm-key");
      const formData = init?.body as FormData;
      expect(formData.get("model")).toBe("gpt-5.5");
      expect(formData.get("response_format")).toBe("text");
      expect(formData.getAll("file")).toHaveLength(1);
      return new Response("ok", { status: 200 });
    };
    repository = new ServiceConfigurationRepository(database, credentialStore, fetchImpl);
    await repository.saveConfiguration({
      providerId: "llm",
      settings: {
        baseUrl: "https://example.test/v1",
        modelName: "gpt-5.5",
        enabled: true
      },
      apiKey: "llm-key"
    });

    await expect(repository.testConfiguration("asr")).resolves.toMatchObject({
      ok: true,
      message: "ASR 独立配置未启用；已确认大模型 gpt-5.5 可以复用完成音频转写。"
    });
  });

  it("checks standalone ASR support with an audio transcription request", async () => {
    const fetchImpl: typeof fetch = async (url, init) => {
      expect(url).toBe("https://asr.example.test/v1/audio/transcriptions");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer asr-key");
      const formData = init?.body as FormData;
      expect(formData.get("model")).toBe("gpt-4o-mini-transcribe");
      expect(formData.get("response_format")).toBe("text");
      expect(formData.getAll("file")).toHaveLength(1);
      return new Response("ok", { status: 200 });
    };
    repository = new ServiceConfigurationRepository(database, credentialStore, fetchImpl);
    await repository.saveConfiguration({
      providerId: "asr",
      settings: {
        baseUrl: "https://asr.example.test/v1",
        modelName: "gpt-4o-mini-transcribe",
        enabled: true
      },
      apiKey: "asr-key"
    });

    await expect(repository.testConfiguration("asr")).resolves.toMatchObject({
      ok: true,
      message:
        "ASR 转写（OpenAI 兼容） 测试通过，gpt-4o-mini-transcribe 可以完成 audio/transcriptions 音频转写"
    });
  });

  it("fails standalone ASR checks clearly when ASR is enabled without a model name", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("ASR test should not call fetch without a model name.");
    };
    repository = new ServiceConfigurationRepository(database, credentialStore, fetchImpl);
    await repository.saveConfiguration({
      providerId: "asr",
      settings: {
        baseUrl: "https://asr.example.test/v1",
        modelName: "",
        enabled: true
      },
      apiKey: "asr-key"
    });

    await expect(repository.testConfiguration("asr")).resolves.toMatchObject({
      ok: false,
      message: "ASR 已启用但模型名为空。请填写支持音频转写的模型，或关闭 ASR 复用大模型配置。"
    });
  });

  it("asks for standalone ASR when the LLM model cannot transcribe audio", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "model does not support audio" }), {
        status: 400,
        statusText: "Bad Request"
      });
    repository = new ServiceConfigurationRepository(database, credentialStore, fetchImpl);
    await repository.saveConfiguration({
      providerId: "llm",
      settings: {
        baseUrl: "https://example.test/v1",
        modelName: "text-only-model",
        enabled: true
      },
      apiKey: "llm-key"
    });

    const result = await repository.testConfiguration("asr");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("请启用 ASR 转写并填写支持音频转写的模型");
  });

  it("does not fail image checks just because a relay hides the models endpoint", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "application/json" }
      });
    repository = new ServiceConfigurationRepository(database, credentialStore, fetchImpl);
    await repository.saveConfiguration({
      providerId: "image",
      settings: {
        baseUrl: "https://relay.example/v1",
        modelName: "gpt-image-2",
        enabled: true
      },
      apiKey: "image-key"
    });

    await expect(repository.testConfiguration("image")).resolves.toMatchObject({
      ok: true,
      message:
        "图片生成（OpenAI 兼容） 已保存。当前中转可能不开放 /models，gpt-image-2 会在实际生成时验证。"
    });
  });
});
