// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CredentialStore, type SecretCipher } from "./credentialStore";

class ReverseCipher implements SecretCipher {
  isAvailable(): boolean {
    return true;
  }

  async encrypt(value: string): Promise<string> {
    return [...value].reverse().join("");
  }

  async decrypt(encryptedValue: string): Promise<string> {
    return [...encryptedValue].reverse().join("");
  }
}

class FailingDecryptCipher extends ReverseCipher {
  override async decrypt(): Promise<string> {
    throw new Error("Error while decrypting the ciphertext provided to safeStorage.decryptString.");
  }
}

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-credentials-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("CredentialStore", () => {
  it("saves encrypted credentials without writing plaintext", async () => {
    const credentialFilePath = path.join(tempDir, "credentials.json");
    const store = new CredentialStore(credentialFilePath, new ReverseCipher());

    await store.saveCredential("heygen", "secret-key");

    expect(store.hasCredential("heygen")).toBe(true);
    expect(await store.readCredential("heygen")).toBe("secret-key");
    expect(fs.readFileSync(credentialFilePath, "utf8")).not.toContain("secret-key");
  });

  it("clears credentials", async () => {
    const credentialFilePath = path.join(tempDir, "credentials.json");
    const store = new CredentialStore(credentialFilePath, new ReverseCipher());

    await store.saveCredential("llm", "llm-key");
    await store.clearCredential("llm");

    expect(store.hasCredential("llm")).toBe(false);
    expect(await store.readCredential("llm")).toBeNull();
  });

  it("returns a recoverable message when a saved credential cannot be decrypted", async () => {
    const credentialFilePath = path.join(tempDir, "credentials.json");
    const writableStore = new CredentialStore(credentialFilePath, new ReverseCipher());
    await writableStore.saveCredential("image", "image-key");

    const failingStore = new CredentialStore(credentialFilePath, new FailingDecryptCipher());

    await expect(failingStore.readCredential("image")).rejects.toThrow(
      "本机已保存的 图片生成（OpenAI 兼容） API Key 无法解密"
    );
  });
});
