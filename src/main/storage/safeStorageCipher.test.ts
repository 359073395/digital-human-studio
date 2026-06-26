// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const safeStorageMock = vi.hoisted(() => ({
  decryptString: vi.fn(),
  encryptString: vi.fn(),
  isEncryptionAvailable: vi.fn()
}));

import { SafeStorageCipher, setElectronSafeStorageForTests } from "./safeStorageCipher";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-safe-storage-"));
  safeStorageMock.decryptString.mockReset();
  safeStorageMock.encryptString.mockReset();
  safeStorageMock.isEncryptionAvailable.mockReset();
  setElectronSafeStorageForTests(
    safeStorageMock as unknown as Parameters<typeof setElectronSafeStorageForTests>[0]
  );
});

afterEach(() => {
  setElectronSafeStorageForTests(null);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("SafeStorageCipher", () => {
  it("encrypts and decrypts credentials with a project-local key when app data is provided", async () => {
    const cipher = new SafeStorageCipher(tempDir);

    const encryptedValue = await cipher.encrypt("image-api-key");

    expect(encryptedValue).toMatch(/^dhs-local-v1:/);
    expect(encryptedValue).not.toContain("image-api-key");
    expect(await cipher.decrypt(encryptedValue)).toBe("image-api-key");
    expect(fs.existsSync(path.join(tempDir, "credentials", "local-key.json"))).toBe(true);
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
    expect(safeStorageMock.decryptString).not.toHaveBeenCalled();
  });

  it("keeps reading legacy safeStorage ciphertext", async () => {
    safeStorageMock.decryptString.mockReturnValue("legacy-key");
    const cipher = new SafeStorageCipher(tempDir);

    await expect(cipher.decrypt(Buffer.from("legacy-ciphertext").toString("base64"))).resolves.toBe(
      "legacy-key"
    );

    expect(safeStorageMock.decryptString).toHaveBeenCalledOnce();
  });
});
