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
      "llm",
      "image",
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
    ).toBe("whisper-1");
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
      avatarId: "avatar-123",
      voiceId: "voice-456",
      resolution: "1080p"
    });
    expect(sqliteBytes).not.toContain("heygen-secret");
  });

  it("tests HeyGen credentials with a real API-style request", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ data: { avatar_looks: [{ id: "avatar-123" }] } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    repository = new ServiceConfigurationRepository(database, credentialStore, fetchImpl);

    await expect(repository.testConfiguration("heygen")).resolves.toMatchObject({
      ok: false,
      message: "HeyGen API Key 尚未配置"
    });

    await repository.saveConfiguration({
      providerId: "heygen",
      settings: { baseUrl: "https://api.heygen.com", avatarId: "avatar-123", enabled: true },
      apiKey: "heygen-key"
    });

    await expect(repository.testConfiguration("heygen")).resolves.toMatchObject({
      ok: true,
      message: "HeyGen 测试通过，API Key 和 Avatar ID 可用于生成前检查"
    });
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
