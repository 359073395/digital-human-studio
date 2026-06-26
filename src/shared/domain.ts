export type ContentLanguage = "zh-CN" | "en-US" | "id-ID";

export type SimilarityRisk = "unknown" | "low" | "medium" | "high";

export type AvatarMode = "preset-avatar" | "image-presenter";

export type VideoGenerationMode =
  | "preset-avatar"
  | "product-avatar"
  | "image-lipsync"
  | "personal-ip"
  | "viral-remix"
  | "mixed-cut"
  | "video-dedup";

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

export type SubtitlePosition = "top" | "middle" | "bottom";

export type TextWeight = "regular" | "bold";

export type MixedCutChapterMode = "fill-with-bgm" | "fixed-material-count";

export interface MixedCutGroupSetting {
  groupId: string;
  reuseRate: number;
}

export type MediaAssetKind =
  | "source-audio"
  | "source-video"
  | "generated-voiceover-audio"
  | "source-transcript"
  | "source-visual-analysis"
  | "knowledge-document"
  | "viral-copy-reference"
  | "story-script-options"
  | "visual-storyboard"
  | "product-image"
  | "reference-image"
  | "mixed-cut-material"
  | "mixed-cut-audio"
  | "mixed-cut-video"
  | "dedup-source-video"
  | "dedup-processed-video"
  | "dedup-report"
  | "edit-decision-record"
  | "custom-font"
  | "generated-presenter-image"
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

export interface ContentLanguageOption {
  id: ContentLanguage;
  label: string;
  voiceLocale: string;
}

export interface SubtitleStyle {
  enabled: boolean;
  position: SubtitlePosition;
  verticalPercent: number;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  fontWeight: TextWeight;
}

export interface FrameTitleStyle {
  enabled: boolean;
  text: string;
  verticalPercent: number;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  fontWeight: TextWeight;
}

export interface CoverStyle {
  title: string;
  subtitle: string;
  verticalPercent: number;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  accentColor: string;
  fontWeight: TextWeight;
}

export interface PersonalIpProfile {
  name: string;
  persona: string;
  tone: string;
  catchphrases: string;
  bannedWords: string;
}

export interface CreativeWorkflow {
  referenceAnalysis: string;
  sellingPoints: string;
  storyboard: string;
  dailyPipeline: string;
  aiVideoPrompt: string;
  mixedCutPlan: string;
}

export type DedupStrategy =
  | "fidelity-light"
  | "fidelity-strong"
  | "pixel-remix"
  | "content-rewrite"
  | "light-polish";

export interface OriginalityScoreReport {
  score: number;
  targetScore: number;
  passed: boolean;
  strategy: DedupStrategy;
  attempt: number;
  summary: string;
  metrics: {
    segmentRestructure: number;
    sourceReuse: number;
    visualVariation: number;
    subtitleTitleCoverVariation: number;
    audioVariation: number;
    scriptSimilarityRisk: number;
    watermarkRisk: number;
  };
  suggestions: string[];
  generatedAt: string;
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

export type GeneratedPresenterImageSelections = Partial<Record<OutputPresetId, MediaAsset["id"]>>;

export interface PublishingPackage {
  title: string;
  description: string;
  tags: string[];
  notes: string;
  exportDirectory?: string;
}

export type VisualStoryboardPanelCount = "auto" | 6 | 8 | 9 | 12;

export interface StoryScriptOption {
  id: string;
  title: string;
  angle: string;
  targetAudience: string;
  hook: string;
  beatSheet: string[];
  script: string;
  reason: string;
  riskNotes: string;
}

export interface StoryScriptPackage {
  title: string;
  productAnalysis: string;
  referenceMechanics: string;
  conversionStrategy: string;
  options: StoryScriptOption[];
  recommendedOptionId: string;
  originalityNotes: string;
}

export interface VisualStoryboardShot {
  shotNumber: number;
  durationSeconds: number;
  shotType: string;
  visualAction: string;
  subjectAction: string;
  productAction: string;
  voiceoverOrText: string;
  cameraMovement: string;
  imagePrompt: string;
  videoMotionPrompt: string;
  negativePrompt: string;
  continuityNotes: string;
}

export interface VisualStoryboardBible {
  protagonist: string;
  product: string;
  wardrobe: string;
  location: string;
  lighting: string;
  colorPalette: string;
  cameraStyle: string;
  subtitleSafeSpace: string;
  consistencyLocks: string[];
}

export interface VisualStoryboardPackage {
  title: string;
  sourceSummary: string;
  remakeStrategy: string;
  productAnalysis: string;
  referenceMechanics: string;
  selectedScript: string;
  panelCount: number;
  layout: string;
  visualBible: VisualStoryboardBible;
  shots: VisualStoryboardShot[];
  boardImagePrompt: string;
  wholeVideoPrompt: string;
}

export interface VideoTask {
  id: string;
  title: string;
  originalVideoUrl?: string;
  exportDirectory?: string;
  sourceScript: string;
  finalScript: string;
  similarityRisk: SimilarityRisk;
  scriptGenerationNotes: string;
  contentLanguage: ContentLanguage;
  generationMode: VideoGenerationMode;
  avatarMode: AvatarMode;
  presetAvatarId?: string;
  presetAvatarGroupId?: string;
  avatarDescriptionPrompt: string;
  motionPrompt: string;
  productImageAssetId?: string;
  referenceImageAssetId?: string;
  generatedPresenterImageAssetId?: string;
  generatedPresenterImageSelections?: GeneratedPresenterImageSelections;
  mixedCutTargetCount: number;
  mixedCutMaterialDirectory: string;
  mixedCutBackgroundMusicDirectory: string;
  mixedCutDubbingDirectory: string;
  mixedCutChapterMode: MixedCutChapterMode;
  mixedCutReuseRate: number;
  mixedCutGroupSettings?: MixedCutGroupSetting[];
  mixedCutRemoveOriginalAudio: boolean;
  mixedCutEnableTransitions: boolean;
  mixedCutBgmVolume: number;
  dedupSourceVideoAssetId?: string;
  dedupTargetScore: number;
  dedupStrategy: DedupStrategy;
  dedupAttemptCount: number;
  customFontAssetId?: string;
  customFontFamily?: string;
  selectedOutputPresets: OutputPresetId[];
  frameTitleStyle: FrameTitleStyle;
  subtitleStyle: SubtitleStyle;
  coverStyle: CoverStyle;
  personalIpProfile: PersonalIpProfile;
  creativeWorkflow: CreativeWorkflow;
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
  generationMode: VideoGenerationMode;
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

export const CONTENT_LANGUAGES: ContentLanguageOption[] = [
  {
    id: "zh-CN",
    label: "中文",
    voiceLocale: "zh-CN"
  },
  {
    id: "en-US",
    label: "English",
    voiceLocale: "en-US"
  },
  {
    id: "id-ID",
    label: "印尼语",
    voiceLocale: "id-ID"
  }
];

export const DEFAULT_GENERATION_STEPS: Omit<GenerationStep, "updatedAt">[] = [
  { id: "source", label: "提取文案", status: "waiting" },
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

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  enabled: true,
  position: "bottom",
  verticalPercent: 82,
  fontFamily: "Microsoft YaHei",
  fontSize: 34,
  textColor: "#ffffff",
  backgroundColor: "#111827",
  fontWeight: "bold"
};

export const DEFAULT_FRAME_TITLE_STYLE: FrameTitleStyle = {
  enabled: true,
  text: "",
  verticalPercent: 18,
  fontFamily: "Microsoft YaHei",
  fontSize: 42,
  textColor: "#ffffff",
  backgroundColor: "#111827",
  fontWeight: "bold"
};

export const DEFAULT_COVER_STYLE: CoverStyle = {
  title: "",
  subtitle: "数字人口播",
  verticalPercent: 54,
  fontFamily: "Microsoft YaHei",
  fontSize: 56,
  textColor: "#ffffff",
  backgroundColor: "#152238",
  accentColor: "#3b82f6",
  fontWeight: "bold"
};

export const DEFAULT_PERSONAL_IP_PROFILE: PersonalIpProfile = {
  name: "",
  persona: "",
  tone: "",
  catchphrases: "",
  bannedWords: ""
};

export const DEFAULT_CREATIVE_WORKFLOW: CreativeWorkflow = {
  referenceAnalysis: "",
  sellingPoints: "",
  storyboard: "",
  dailyPipeline: "",
  aiVideoPrompt: "",
  mixedCutPlan: ""
};

export function defaultOutputPresetIds(): OutputPresetId[] {
  return OUTPUT_PRESETS.filter((preset) => preset.defaultSelected).map((preset) => preset.id);
}

export function isOutputPresetId(value: string): value is OutputPresetId {
  return OUTPUT_PRESETS.some((preset) => preset.id === value);
}

export function isContentLanguage(value: string): value is ContentLanguage {
  return CONTENT_LANGUAGES.some((language) => language.id === value);
}

export function isVideoGenerationMode(value: string): value is VideoGenerationMode {
  return (
    value === "preset-avatar" ||
    value === "product-avatar" ||
    value === "image-lipsync" ||
    value === "personal-ip" ||
    value === "viral-remix" ||
    value === "mixed-cut" ||
    value === "video-dedup"
  );
}
