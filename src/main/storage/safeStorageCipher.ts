import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { SecretCipher } from "./credentialStore";

const LOCAL_CREDENTIAL_PREFIX = "dhs-local-v1:";
const LOCAL_KEY_FILE_NAME = "local-key.json";
const requireFromCurrentFile = createRequire(__filename);

type ElectronSafeStorage = typeof import("electron").safeStorage;

interface LocalCredentialKeyFile {
  algorithm: "aes-256-gcm";
  key: string;
}

export class SafeStorageCipher implements SecretCipher {
  constructor(private readonly appDataDir?: string) {}

  isAvailable(): boolean {
    if (this.appDataDir) {
      return true;
    }

    try {
      return getElectronSafeStorage().isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  async encrypt(value: string): Promise<string> {
    if (this.appDataDir) {
      return encryptWithLocalKey(value, this.appDataDir);
    }

    return getElectronSafeStorage().encryptString(value).toString("base64");
  }

  async decrypt(encryptedValue: string): Promise<string> {
    if (encryptedValue.startsWith(LOCAL_CREDENTIAL_PREFIX)) {
      if (!this.appDataDir) {
        throw new Error("项目本地凭据缺少数据目录，无法读取 API Key。");
      }

      return decryptWithLocalKey(encryptedValue, this.appDataDir);
    }

    return getElectronSafeStorage().decryptString(Buffer.from(encryptedValue, "base64"));
  }
}

let electronSafeStorageOverride: ElectronSafeStorage | null = null;
let cachedElectronSafeStorage: ElectronSafeStorage | null = null;

export function setElectronSafeStorageForTests(safeStorage: ElectronSafeStorage | null): void {
  electronSafeStorageOverride = safeStorage;
  cachedElectronSafeStorage = null;
}

function getElectronSafeStorage(): ElectronSafeStorage {
  if (electronSafeStorageOverride) {
    return electronSafeStorageOverride;
  }

  if (cachedElectronSafeStorage) {
    return cachedElectronSafeStorage;
  }

  const electronModule = requireFromCurrentFile("electron") as {
    safeStorage?: ElectronSafeStorage;
  };
  if (!electronModule.safeStorage) {
    throw new Error(
      "当前运行环境无法访问 Electron 安全存储。请在设置里重新保存 API Key 后再重试。"
    );
  }

  cachedElectronSafeStorage = electronModule.safeStorage;
  return cachedElectronSafeStorage;
}

function encryptWithLocalKey(value: string, appDataDir: string): string {
  const key = readOrCreateLocalKey(appDataDir);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${LOCAL_CREDENTIAL_PREFIX}${[
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(".")}`;
}

function decryptWithLocalKey(encryptedValue: string, appDataDir: string): string {
  const parts = encryptedValue.slice(LOCAL_CREDENTIAL_PREFIX.length).split(".");
  if (parts.length !== 3) {
    throw new Error("项目本地凭据格式无效，无法读取 API Key。");
  }

  const [ivText, authTagText, ciphertextText] = parts;
  const key = readOrCreateLocalKey(appDataDir);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagText, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function readOrCreateLocalKey(appDataDir: string): Buffer {
  const keyFilePath = getLocalKeyFilePath(appDataDir);
  if (!fs.existsSync(keyFilePath)) {
    const keyFile: LocalCredentialKeyFile = {
      algorithm: "aes-256-gcm",
      key: crypto.randomBytes(32).toString("base64")
    };
    fs.mkdirSync(path.dirname(keyFilePath), { recursive: true });
    fs.writeFileSync(keyFilePath, `${JSON.stringify(keyFile, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    return Buffer.from(keyFile.key, "base64");
  }

  const keyFile = JSON.parse(fs.readFileSync(keyFilePath, "utf8")) as LocalCredentialKeyFile;
  if (keyFile.algorithm !== "aes-256-gcm") {
    throw new Error("项目本地凭据密钥格式不受支持。");
  }

  const key = Buffer.from(keyFile.key, "base64");
  if (key.length !== 32) {
    throw new Error("项目本地凭据密钥长度无效。");
  }

  return key;
}

function getLocalKeyFilePath(appDataDir: string): string {
  return path.join(appDataDir, "credentials", LOCAL_KEY_FILE_NAME);
}
