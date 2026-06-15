export type ContentLanguage = "zh-CN" | "en-US";

export type StepStatus = "waiting" | "running" | "complete" | "failed" | "retry-ready";

export type GenerationStepId =
  | "source"
  | "script"
  | "avatar"
  | "subtitles"
  | "post-production"
  | "export";

export type OutputPresetId = "portrait-9-16" | "landscape-16-9";

export type OutputVariantStatus = "waiting" | "rendering" | "complete" | "failed";

export type MediaAssetKind =
  | "source-audio"
  | "source-video"
  | "avatar-video"
  | "subtitle-file"
  | "background-music"
  | "cover-image"
  | "finished-video"
  | "publishing-package";

export interface GenerationStep {
  id: GenerationStepId;
  label: string;
  status: StepStatus;
  errorMessage?: string;
  updatedAt: string;
}

export interface OutputPreset {
  id: OutputPresetId;
  label: string;
  aspectRatio: "9:16" | "16:9";
  width: number;
  height: number;
  defaultSelected: boolean;
}

export interface OutputVariant {
  id: string;
  taskId: string;
  presetId: OutputPresetId;
  status: OutputVariantStatus;
  finishedVideoPath?: string;
  coverImagePath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAsset {
  id: string;
  taskId: string;
  kind: MediaAssetKind;
  relativePath: string;
  createdAt: string;
}

export interface PublishingPackage {
  title: string;
  description: string;
  tags: string[];
  notes: string;
  exportDirectory?: string;
}

export interface VideoTask {
  id: string;
  title: string;
  sourceScript: string;
  finalScript: string;
  contentLanguage: ContentLanguage;
  selectedOutputPresets: OutputPresetId[];
  steps: GenerationStep[];
  outputVariants: OutputVariant[];
  mediaAssets: MediaAsset[];
  publishingPackage: PublishingPackage;
  createdAt: string;
  updatedAt: string;
}

export interface VideoTaskSummary {
  id: string;
  title: string;
  contentLanguage: ContentLanguage;
  selectedOutputPresets: OutputPresetId[];
  activeStepLabel: string;
  status: StepStatus;
  createdAt: string;
  updatedAt: string;
}

export const OUTPUT_PRESETS: OutputPreset[] = [
  {
    id: "portrait-9-16",
    label: "竖屏 9:16",
    aspectRatio: "9:16",
    width: 1080,
    height: 1920,
    defaultSelected: true
  },
  {
    id: "landscape-16-9",
    label: "横屏 16:9",
    aspectRatio: "16:9",
    width: 1920,
    height: 1080,
    defaultSelected: false
  }
];

export const DEFAULT_GENERATION_STEPS: Omit<GenerationStep, "updatedAt">[] = [
  { id: "source", label: "源文案", status: "waiting" },
  { id: "script", label: "原创脚本", status: "waiting" },
  { id: "avatar", label: "数字人", status: "waiting" },
  { id: "subtitles", label: "字幕", status: "waiting" },
  { id: "post-production", label: "合成", status: "waiting" },
  { id: "export", label: "导出", status: "waiting" }
];

export const DEFAULT_PUBLISHING_PACKAGE: PublishingPackage = {
  title: "",
  description: "",
  tags: [],
  notes: ""
};

export function defaultOutputPresetIds(): OutputPresetId[] {
  return OUTPUT_PRESETS.filter((preset) => preset.defaultSelected).map((preset) => preset.id);
}

export function isOutputPresetId(value: string): value is OutputPresetId {
  return OUTPUT_PRESETS.some((preset) => preset.id === value);
}
