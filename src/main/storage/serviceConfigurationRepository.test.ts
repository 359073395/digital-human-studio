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
let credentialFilePath: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-service-config-"));
  const appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  credentialFilePath = path.join(tempDir, "credentials.json");
  repository = new ServiceConfigurationRepository(
    database,
    new CredentialStore(credentialFilePath, new PrefixCipher())
  );
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

  it("reports local health check state", async () => {
    expect(repository.testConfiguration("heygen").ok).toBe(false);

    await repository.saveConfiguration({
      providerId: "heygen",
      settings: { baseUrl: "https://api.heygen.com", avatarId: "avatar-123", enabled: true },
      apiKey: "heygen-key"
    });

    expect(repository.testConfiguration("heygen")).toMatchObject({
      ok: true,
      message: "HeyGen 本地配置检查通过"
    });
  });
});
