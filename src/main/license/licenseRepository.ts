import type { LicensePayload } from "../../shared/license";
import type { TaskDatabase } from "../storage/database";

const LICENSE_PREFERENCE_KEY = "license-activation";

export interface StoredLicenseActivation {
  activationCode: string;
  machineCode: string;
  activatedAt: string;
  payload: LicensePayload;
}

export class LicenseRepository {
  constructor(private readonly database: TaskDatabase) {}

  getActivation(): StoredLicenseActivation | null {
    const row = this.database
      .prepare("SELECT value_json FROM app_preferences WHERE key = ?")
      .get(LICENSE_PREFERENCE_KEY) as { value_json?: string } | undefined;
    if (!row?.value_json) {
      return null;
    }

    try {
      return sanitizeStoredLicenseActivation(JSON.parse(row.value_json));
    } catch {
      return null;
    }
  }

  saveActivation(activation: StoredLicenseActivation): void {
    this.database
      .prepare(
        `
        INSERT INTO app_preferences (key, value_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at
      `
      )
      .run(LICENSE_PREFERENCE_KEY, JSON.stringify(activation), new Date().toISOString());
  }

  clearActivation(): void {
    this.database.prepare("DELETE FROM app_preferences WHERE key = ?").run(LICENSE_PREFERENCE_KEY);
  }
}

function sanitizeStoredLicenseActivation(value: unknown): StoredLicenseActivation | null {
  if (!isRecord(value) || !isRecord(value.payload)) {
    return null;
  }

  const activationCode = readString(value.activationCode);
  const machineCode = readString(value.machineCode);
  const activatedAt = readString(value.activatedAt);
  const payload = {
    productId: readString(value.payload.productId),
    holder: readString(value.payload.holder),
    machineCode: readString(value.payload.machineCode),
    issuedAt: readString(value.payload.issuedAt),
    expiresAt: readString(value.payload.expiresAt),
    licenseId: readString(value.payload.licenseId)
  };

  if (
    !activationCode ||
    !machineCode ||
    !activatedAt ||
    Object.values(payload).some((item) => !item)
  ) {
    return null;
  }

  return { activationCode, machineCode, activatedAt, payload };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
