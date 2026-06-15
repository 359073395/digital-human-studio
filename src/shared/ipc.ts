export type AppEnvironment = "development" | "production";

export interface AppInfo {
  name: string;
  version: string;
  environment: AppEnvironment;
  platform: string;
}

export interface DigitalHumanStudioAPI {
  getAppInfo: () => Promise<AppInfo>;
  openSettings: () => Promise<void>;
}

export const IPC_CHANNELS = {
  getAppInfo: "app:get-info",
  openSettings: "app:open-settings"
} as const;
