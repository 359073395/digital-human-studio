import {
  LICENSE_PRODUCT_ID,
  type ActivateLicenseInput,
  type ActivationResult,
  type LicensePayload,
  type LicenseStatus
} from "../../shared/license";
import { verifyLicenseCode } from "./licenseCrypto";
import type { LicenseRepository, StoredLicenseActivation } from "./licenseRepository";

interface LicenseServiceOptions {
  isDevelopment: boolean;
  publicKeyPem: string;
  machineCodeProvider: () => string;
  nowProvider?: () => Date;
}

export class LicenseService {
  constructor(
    private readonly repository: LicenseRepository,
    private readonly options: LicenseServiceOptions
  ) {}

  getStatus(): LicenseStatus {
    const machineCode = this.options.machineCodeProvider();
    if (this.isBypassAllowed()) {
      return {
        activated: true,
        bypassed: true,
        machineCode,
        productId: LICENSE_PRODUCT_ID,
        holder: "开发测试",
        expiresAt: "2099-12-31T23:59:59.999Z",
        daysRemaining: 9999
      };
    }

    const activation = this.repository.getActivation();
    if (!activation) {
      return {
        activated: false,
        machineCode,
        productId: LICENSE_PRODUCT_ID
      };
    }

    try {
      const { payload } = verifyLicenseCode({
        code: activation.activationCode,
        expectedMachineCode: machineCode,
        publicKeyPem: this.options.publicKeyPem,
        now: this.options.nowProvider?.() ?? new Date()
      });
      return createActiveStatus(machineCode, payload, this.options.nowProvider?.() ?? new Date());
    } catch (error) {
      return {
        activated: false,
        machineCode,
        productId: LICENSE_PRODUCT_ID,
        error: error instanceof Error ? error.message : "激活状态校验失败。"
      };
    }
  }

  activate(input: ActivateLicenseInput): ActivationResult {
    const machineCode = this.options.machineCodeProvider();
    try {
      const { payload } = verifyLicenseCode({
        code: input.code,
        expectedMachineCode: machineCode,
        publicKeyPem: this.options.publicKeyPem,
        now: this.options.nowProvider?.() ?? new Date()
      });
      const activation: StoredLicenseActivation = {
        activationCode: input.code.trim(),
        machineCode,
        activatedAt: new Date().toISOString(),
        payload
      };
      this.repository.saveActivation(activation);
      const status = createActiveStatus(
        machineCode,
        payload,
        this.options.nowProvider?.() ?? new Date()
      );
      return {
        ok: true,
        status,
        message: `激活成功，有效期至 ${formatDate(payload.expiresAt)}。`
      };
    } catch (error) {
      const status: LicenseStatus = {
        activated: false,
        machineCode,
        productId: LICENSE_PRODUCT_ID,
        error: error instanceof Error ? error.message : "激活失败。"
      };
      return {
        ok: false,
        status,
        message: status.error ?? "激活失败。"
      };
    }
  }

  clear(): LicenseStatus {
    this.repository.clearActivation();
    return this.getStatus();
  }

  requireActivated(): void {
    const status = this.getStatus();
    if (!status.activated) {
      throw new Error(status.error || "软件未激活，请先输入激活码。");
    }
  }

  private isBypassAllowed(): boolean {
    return this.options.isDevelopment && process.env.DHS_LICENSE_TEST_BYPASS === "1";
  }
}

function createActiveStatus(
  machineCode: string,
  payload: LicensePayload,
  now: Date
): LicenseStatus {
  return {
    activated: true,
    machineCode,
    productId: payload.productId,
    holder: payload.holder,
    licenseId: payload.licenseId,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    daysRemaining: Math.max(
      0,
      Math.ceil((new Date(payload.expiresAt).getTime() - now.getTime()) / 86_400_000)
    )
  };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}
