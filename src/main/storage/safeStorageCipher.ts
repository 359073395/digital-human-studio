import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { safeStorage } from "electron";
import type { SecretCipher } from "./credentialStore";

const LOCAL_CREDENTIAL_PREFIX = "dhs-local-v1:";
const LOCAL_KEY_FILE_NAME = "local-key.json";

interface LocalCredentialKeyFile {
  algorithm: "aes-256-gcm";
  key: string;
}

export class SafeStorageCipher implements SecretCipher {
  constructor(private readonly appDataDir?: string) {}

  isAvailable(): boolean {
    return Boolean(this.appDataDir) || safeStorage.isEncryptionAvailable();
  }

  async encrypt(value: string): Promise<string> {
    if (this.appDataDir) {
      return encryptWithLocalKey(value, this.appDataDir);
    }

    return safeStorage.encryptString(value).toString("base64");
  }

  async decrypt(encryptedValue: string): Promise<string> {
    if (encryptedValue.startsWith(LOCAL_CREDENTIAL_PREFIX)) {
      if (!this.appDataDir) {
        throw new Error("项目本地凭据缺少数据目录，无法读取 API Key。");
      }

      return decryptWithLocalKey(encryptedValue, this.appDataDir);
    }

    return safeStorage.decryptString(Buffer.from(encryptedValue, "base64"));
  }
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
