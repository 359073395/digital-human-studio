export type UpdateStatusCode =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error"
  | "unsupported";

export interface AppUpdateStatus {
  status: UpdateStatusCode;
  currentVersion: string;
  availableVersion?: string;
  downloaded?: boolean;
  progressPercent?: number;
  releaseUrl?: string;
  message: string;
}
