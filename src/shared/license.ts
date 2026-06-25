export const LICENSE_PRODUCT_ID = "paoliang-video-workbench";
export const LICENSE_CODE_PREFIX = "PLV1";

export interface LicensePayload {
  productId: string;
  holder: string;
  machineCode: string;
  issuedAt: string;
  expiresAt: string;
  licenseId: string;
}

export interface LicenseStatus {
  activated: boolean;
  machineCode: string;
  productId: string;
  bypassed?: boolean;
  holder?: string;
  licenseId?: string;
  issuedAt?: string;
  expiresAt?: string;
  daysRemaining?: number;
  error?: string;
}

export interface ActivateLicenseInput {
  code: string;
}

export interface ActivationResult {
  ok: boolean;
  status: LicenseStatus;
  message: string;
}
