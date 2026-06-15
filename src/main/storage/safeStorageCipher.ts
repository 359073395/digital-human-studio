import { safeStorage } from "electron";
import type { SecretCipher } from "./credentialStore";

export class SafeStorageCipher implements SecretCipher {
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  async encrypt(value: string): Promise<string> {
    return safeStorage.encryptString(value).toString("base64");
  }

  async decrypt(encryptedValue: string): Promise<string> {
    return safeStorage.decryptString(Buffer.from(encryptedValue, "base64"));
  }
}
