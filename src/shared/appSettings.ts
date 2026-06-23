export type AppPathSettingKind =
  | "sourceDownloadDirectory"
  | "generatedImageDirectory"
  | "generatedVideoDirectory";

export interface AppPathSettings {
  sourceDownloadDirectory: string;
  generatedImageDirectory: string;
  generatedVideoDirectory: string;
}

export const DEFAULT_APP_PATH_SETTINGS: AppPathSettings = {
  sourceDownloadDirectory: "",
  generatedImageDirectory: "",
  generatedVideoDirectory: ""
};
