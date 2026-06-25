import crypto from "node:crypto";
import { LICENSE_CODE_PREFIX, LICENSE_PRODUCT_ID, type LicensePayload } from "../../shared/license";

export interface VerifiedLicense {
  payload: LicensePayload;
}

export function createLicenseCode(payload: LicensePayload, privateKeyPem: string): string {
  const normalizedPayload = normalizePayload(payload);
  const payloadPart = base64UrlEncode(JSON.stringify(normalizedPayload));
  const signingInput = `${LICENSE_CODE_PREFIX}.${payloadPart}`;
  const signature = crypto.sign(null, Buffer.from(signingInput, "utf8"), privateKeyPem);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export function verifyLicenseCode(input: {
  code: string;
  expectedMachineCode: string;
  publicKeyPem: string;
  now?: Date;
}): VerifiedLicense {
  const code = input.code.trim();
  const parts = code.split(".");
  if (parts.length !== 3 || parts[0] !== LICENSE_CODE_PREFIX) {
    throw new Error("激活码格式不正确。");
  }

  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = base64UrlDecode(parts[2]);
  const verified = crypto.verify(
    null,
    Buffer.from(signingInput, "utf8"),
    input.publicKeyPem,
    signature
  );
  if (!verified) {
    throw new Error("激活码签名无效，可能已被修改。");
  }

  const payload = parsePayload(base64UrlDecode(parts[1]).toString("utf8"));
  if (payload.productId !== LICENSE_PRODUCT_ID) {
    throw new Error("激活码不属于当前软件。");
  }

  if (
    normalizeMachineCode(payload.machineCode) !== normalizeMachineCode(input.expectedMachineCode)
  ) {
    throw new Error("激活码与本机机器码不匹配。");
  }

  const now = input.now ?? new Date();
  const expiresAt = parseIsoDate(payload.expiresAt, "到期时间");
  if (expiresAt.getTime() <= now.getTime()) {
    throw new Error("激活码已过期，请重新签发。");
  }

  parseIsoDate(payload.issuedAt, "签发时间");
  return { payload };
}

export function normalizeMachineCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/(.{4})(?=.)/g, "$1-");
}

function normalizePayload(payload: LicensePayload): LicensePayload {
  return {
    productId: payload.productId,
    holder: payload.holder.trim(),
    machineCode: normalizeMachineCode(payload.machineCode),
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    licenseId: payload.licenseId.trim()
  };
}

function parsePayload(json: string): LicensePayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("激活码内容无法解析。");
  }

  if (!isRecord(parsed)) {
    throw new Error("激活码内容不完整。");
  }

  const payload: LicensePayload = {
    productId: readRequiredString(parsed, "productId"),
    holder: readRequiredString(parsed, "holder"),
    machineCode: normalizeMachineCode(readRequiredString(parsed, "machineCode")),
    issuedAt: readRequiredString(parsed, "issuedAt"),
    expiresAt: readRequiredString(parsed, "expiresAt"),
    licenseId: readRequiredString(parsed, "licenseId")
  };

  return payload;
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`激活码缺少 ${key}。`);
  }
  return value.trim();
}

function parseIsoDate(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`激活码${label}无效。`);
  }
  return date;
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): Buffer {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    throw new Error("激活码包含无法识别的编码。");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
