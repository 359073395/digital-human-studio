import fs from "node:fs";
import path from "node:path";
import type { ProviderId } from "../../shared/serviceConfig";

export interface SecretCipher {
  encrypt: (value: string) => Promise<string>;
  decrypt: (encryptedValue: string) => Promise<string>;
  isAvailable: () => boolean;
}

interface CredentialRecord {
  encryptedValue: string;
  updatedAt: string;
}

type CredentialFile = Partial<Record<ProviderId, CredentialRecord>>;

export class CredentialStore {
  constructor(
    private readonly credentialFilePath: string,
    private readonly cipher: SecretCipher
  ) {}

  hasCredential(providerId: ProviderId): boolean {
    return Boolean(this.readCredentialFile()[providerId]?.encryptedValue);
  }

  async saveCredential(providerId: ProviderId, secret: string): Promise<void> {
    const trimmedSecret = secret.trim();
    if (!trimmedSecret) {
      await this.clearCredential(providerId);
      return;
    }

    if (!this.cipher.isAvailable()) {
      throw new Error("当前系统不可用安全存储，无法保存 API Key。");
    }

    const credentialFile = this.readCredentialFile();
    credentialFile[providerId] = {
      encryptedValue: await this.cipher.encrypt(trimmedSecret),
      updatedAt: new Date().toISOString()
    };
    this.writeCredentialFile(credentialFile);
  }

  async readCredential(providerId: ProviderId): Promise<string | null> {
    const record = this.readCredentialFile()[providerId];
    if (!record?.encryptedValue) {
      return null;
    }

    if (!this.cipher.isAvailable()) {
      throw new Error("当前系统不可用安全存储，无法读取 API Key。");
    }

    return this.cipher.decrypt(record.encryptedValue);
  }

  async clearCredential(providerId: ProviderId): Promise<void> {
    const credentialFile = this.readCredentialFile();
    delete credentialFile[providerId];
    this.writeCredentialFile(credentialFile);
  }

  private readCredentialFile(): CredentialFile {
    if (!fs.existsSync(this.credentialFilePath)) {
      return {};
    }

    const raw = fs.readFileSync(this.credentialFilePath, "utf8");
    if (!raw.trim()) {
      return {};
    }

    return JSON.parse(raw) as CredentialFile;
  }

  private writeCredentialFile(credentialFile: CredentialFile): void {
    fs.mkdirSync(path.dirname(this.credentialFilePath), { recursive: true });
    fs.writeFileSync(this.credentialFilePath, `${JSON.stringify(credentialFile, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
  }
}

export function createCredentialFilePath(appDataDir: string): string {
  return path.join(appDataDir, "credentials", "credentials.json");
}
