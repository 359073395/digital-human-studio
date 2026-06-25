// @vitest-environment node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LICENSE_PRODUCT_ID, type LicensePayload } from "../../shared/license";
import { createAppPaths } from "../storage/appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { createLicenseCode, verifyLicenseCode } from "./licenseCrypto";
import { LicenseRepository } from "./licenseRepository";
import { LicenseService } from "./licenseService";

let tempDir: string;
let database: TaskDatabase;
let privateKeyPem: string;
let publicKeyPem: string;

const MACHINE_CODE = "ABCD-1234-EFGH-5678";
const NOW = new Date("2026-06-25T00:00:00.000Z");

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-license-"));
  const appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  const keyPair = crypto.generateKeyPairSync("ed25519");
  privateKeyPem = keyPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  publicKeyPem = keyPair.publicKey.export({ type: "spki", format: "pem" }).toString();
});

afterEach(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("LicenseService", () => {
  it("activates a valid machine-bound license", () => {
    const service = createService();
    const code = createCode({
      machineCode: MACHINE_CODE,
      expiresAt: "2026-09-25T00:00:00.000Z"
    });

    const result = service.activate({ code });

    expect(result.ok).toBe(true);
    expect(result.status.activated).toBe(true);
    expect(result.status.machineCode).toBe(MACHINE_CODE);
    expect(result.status.holder).toBe("内部试用");
    expect(service.getStatus().activated).toBe(true);
  });

  it("rejects a license for another machine", () => {
    const service = createService();
    const code = createCode({
      machineCode: "ZZZZ-9999-YYYY-8888",
      expiresAt: "2026-09-25T00:00:00.000Z"
    });

    const result = service.activate({ code });

    expect(result.ok).toBe(false);
    expect(result.status.error).toContain("机器码不匹配");
  });

  it("rejects expired licenses", () => {
    const service = createService();
    const code = createCode({
      machineCode: MACHINE_CODE,
      expiresAt: "2026-06-24T23:59:59.000Z"
    });

    const result = service.activate({ code });

    expect(result.ok).toBe(false);
    expect(result.status.error).toContain("已过期");
  });

  it("rejects tampered payloads or signatures", () => {
    const code = createCode({
      machineCode: MACHINE_CODE,
      expiresAt: "2026-09-25T00:00:00.000Z"
    });
    const tampered = `${code.slice(0, -2)}aa`;

    expect(() =>
      verifyLicenseCode({
        code: tampered,
        expectedMachineCode: MACHINE_CODE,
        publicKeyPem,
        now: NOW
      })
    ).toThrow("签名无效");
  });

  it("clears a saved activation", () => {
    const service = createService();
    const code = createCode({
      machineCode: MACHINE_CODE,
      expiresAt: "2026-09-25T00:00:00.000Z"
    });
    expect(service.activate({ code }).ok).toBe(true);

    const status = service.clear();

    expect(status.activated).toBe(false);
    expect(service.getStatus().activated).toBe(false);
  });
});

function createService(): LicenseService {
  return new LicenseService(new LicenseRepository(database), {
    isDevelopment: false,
    publicKeyPem,
    machineCodeProvider: () => MACHINE_CODE,
    nowProvider: () => NOW
  });
}

function createCode(input: Pick<LicensePayload, "machineCode" | "expiresAt">): string {
  return createLicenseCode(
    {
      productId: LICENSE_PRODUCT_ID,
      holder: "内部试用",
      machineCode: input.machineCode,
      issuedAt: "2026-06-25T00:00:00.000Z",
      expiresAt: input.expiresAt,
      licenseId: "test-license"
    },
    privateKeyPem
  );
}
