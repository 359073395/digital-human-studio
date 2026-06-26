import type {
  AvatarMode,
  CoverStyle,
  CreativeWorkflow,
  ContentLanguage,
  FrameTitleStyle,
  GeneratedPresenterImageSelections,
  GenerationStepId,
  MediaAsset,
  MixedCutGroupSetting,
  OutputPresetId,
  PersonalIpProfile,
  SubtitleStyle,
  VisualStoryboardPanelCount,
  VideoGenerationMode,
  VideoTask,
  VideoTaskSummary
} from "./domain";
import type { SourceTranscriptionResult } from "./scriptGeneration";
import type {
  ProviderId,
  ListServiceModelsInput,
  ServiceModelList,
  SaveServiceConfigurationInput,
  ServiceConfiguration,
  ServiceConnectionCheck
} from "./serviceConfig";
import type { AppPathSettingKind, AppPathSettings } from "./appSettings";
import type { ActivateLicenseInput, ActivationResult, LicenseStatus } from "./license";
import type { RuntimePerformanceProfile } from "./performanceProfile";
import type { AppUpdateStatus } from "./updates";

export type AppEnvironment = "development" | "production";

export interface AppInfo {
  name: string;
  version: string;
  environment: AppEnvironment;
  platform: string;
  performanceProfile: RuntimePerformanceProfile;
}

export interface DigitalHumanStudioAPI {
  getAppInfo: () => Promise<AppInfo>;
  getLicenseStatus: () => Promise<LicenseStatus>;
  activateLicense: (input: ActivateLicenseInput) => Promise<ActivationResult>;
  clearLicense: () => Promise<LicenseStatus>;
  openSettings: () => Promise<void>;
  listTasks: () => Promise<VideoTaskSummary[]>;
  getTask: (taskId: string) => Promise<VideoTask | null>;
  createTask: (input?: CreateTaskInput) => Promise<VideoTask>;
  deleteTask: (taskId: string) => Promise<VideoTaskSummary[]>;
  updateTask: (input: UpdateTaskInput) => Promise<VideoTask>;
  chooseExportDirectory: (taskId: string) => Promise<VideoTask>;
  generateScript: (taskId: string) => Promise<VideoTask>;
  transcribeSource: (taskId: string) => Promise<SourceTranscriptionResult>;
  downloadOriginalVideo: (taskId: string) => Promise<VideoTask>;
  uploadSourceVideo: (taskId: string) => Promise<VideoTask>;
  uploadMixedCutMaterial: (taskId: string) => Promise<VideoTask>;
  chooseMixedCutMaterialDirectory: (taskId: string) => Promise<VideoTask>;
  uploadMixedCutAudio: (taskId: string) => Promise<VideoTask>;
  generateScriptVoiceover: (taskId: string) => Promise<VideoTask>;
  removeTaskMediaAsset: (input: RemoveTaskMediaAssetInput) => Promise<VideoTask>;
  setMixedCutTargetCount: (input: SetMixedCutTargetCountInput) => Promise<VideoTask>;
  renderMixedCutBatch: (taskId: string) => Promise<VideoTask>;
  importDedupSourceVideo: (taskId: string) => Promise<VideoTask>;
  runVideoDedup: (taskId: string) => Promise<VideoTask>;
  runOriginalityScore: (taskId: string) => Promise<VideoTask>;
  uploadKnowledgeDocuments: (taskId: string) => Promise<VideoTask>;
  uploadViralCopyReferences: (taskId: string) => Promise<VideoTask>;
  analyzeSourceVisuals: (taskId: string) => Promise<VideoTask>;
  generateStoryScriptOptions: (taskId: string) => Promise<VideoTask>;
  generateVisualStoryboard: (input: GenerateVisualStoryboardInput) => Promise<VideoTask>;
  uploadProductImage: (taskId: string) => Promise<VideoTask>;
  uploadReferenceImage: (taskId: string) => Promise<VideoTask>;
  uploadCustomFont: (taskId: string) => Promise<VideoTask>;
  generatePresenterImages: (input: GeneratePresenterImagesInput | string) => Promise<VideoTask>;
  selectGeneratedPresenterImage: (input: SelectGeneratedPresenterImageInput) => Promise<VideoTask>;
  renderHeyGenAvatar: (taskId: string) => Promise<VideoTask>;
  listHeyGenAvatarLooks: () => Promise<HeyGenAvatarLook[]>;
  createHeyGenAvatar: (input: CreateHeyGenAvatarInput) => Promise<CreateHeyGenAvatarResult>;
  runRealWorkflow: (taskId: string) => Promise<VideoTask>;
  runMockWorkflow: (taskId: string) => Promise<VideoTask>;
  retryMockWorkflowStep: (input: RetryWorkflowStepInput) => Promise<VideoTask>;
  resolveTaskAssetUrl: (input: ResolveTaskAssetUrlInput) => Promise<string>;
  openTaskExports: (taskId: string) => Promise<void>;
  listServiceConfigurations: () => Promise<ServiceConfiguration[]>;
  saveServiceConfiguration: (input: SaveServiceConfigurationInput) => Promise<ServiceConfiguration>;
  clearServiceCredential: (providerId: ProviderId) => Promise<ServiceConfiguration>;
  testServiceConfiguration: (providerId: ProviderId) => Promise<ServiceConnectionCheck>;
  listServiceModels: (input: ListServiceModelsInput) => Promise<ServiceModelList>;
  startHeyGenOAuth: (input: StartHeyGenOAuthInput) => Promise<StartHeyGenOAuthResult>;
  authorizeHeyGenOAuth: (input: StartHeyGenOAuthInput) => Promise<ServiceConnectionCheck>;
  completeHeyGenOAuth: (input: CompleteHeyGenOAuthInput) => Promise<ServiceConnectionCheck>;
  getAppPathSettings: () => Promise<AppPathSettings>;
  chooseAppPathSetting: (kind: AppPathSettingKind) => Promise<AppPathSettings>;
  getUpdateStatus: () => Promise<AppUpdateStatus>;
  checkForUpdates: () => Promise<AppUpdateStatus>;
  downloadUpdate: () => Promise<AppUpdateStatus>;
  installUpdate: () => Promise<AppUpdateStatus>;
  openUpdateReleasePage: () => Promise<AppUpdateStatus>;
}

export const IPC_CHANNELS = {
  getAppInfo: "app:get-info",
  getLicenseStatus: "license:get-status",
  activateLicense: "license:activate",
  clearLicense: "license:clear",
  openSettings: "app:open-settings",
  listTasks: "tasks:list",
  getTask: "tasks:get",
  createTask: "tasks:create",
  deleteTask: "tasks:delete",
  updateTask: "tasks:update",
  chooseExportDirectory: "workflow:choose-export-directory",
  generateScript: "script:generate",
  transcribeSource: "source:transcribe",
  downloadOriginalVideo: "source:download-original-video",
  uploadSourceVideo: "source:upload-source-video",
  uploadMixedCutMaterial: "source:upload-mixed-cut-material",
  chooseMixedCutMaterialDirectory: "source:choose-mixed-cut-material-directory",
  uploadMixedCutAudio: "source:upload-mixed-cut-audio",
  generateScriptVoiceover: "source:generate-script-voiceover",
  removeTaskMediaAsset: "source:remove-media-asset",
  setMixedCutTargetCount: "mixed-cut:set-target-count",
  renderMixedCutBatch: "mixed-cut:render-batch",
  importDedupSourceVideo: "dedup:import-source-video",
  runVideoDedup: "dedup:run",
  runOriginalityScore: "dedup:score",
  uploadKnowledgeDocuments: "source:upload-knowledge-documents",
  uploadViralCopyReferences: "source:upload-viral-copy-references",
  analyzeSourceVisuals: "source:analyze-visuals",
  generateStoryScriptOptions: "storyboard:generate-story-scripts",
  generateVisualStoryboard: "storyboard:generate-visual",
  uploadProductImage: "source:upload-product-image",
  uploadReferenceImage: "source:upload-reference-image",
  uploadCustomFont: "source:upload-custom-font",
  generatePresenterImages: "image:generate-presenter-images",
  selectGeneratedPresenterImage: "image:select-generated-presenter-image",
  renderHeyGenAvatar: "avatar:render-heygen",
  listHeyGenAvatarLooks: "avatar:list-heygen-looks",
  createHeyGenAvatar: "avatar:create-heygen",
  runRealWorkflow: "workflow:real-run",
  runMockWorkflow: "workflow:mock-run",
  retryMockWorkflowStep: "workflow:mock-retry-step",
  resolveTaskAssetUrl: "assets:resolve-task-url",
  openTaskExports: "workflow:open-exports",
  listServiceConfigurations: "service-configurations:list",
  saveServiceConfiguration: "service-configurations:save",
  clearServiceCredential: "service-configurations:clear-credential",
  testServiceConfiguration: "service-configurations:test",
  listServiceModels: "service-configurations:list-models",
  startHeyGenOAuth: "service-configurations:heygen-oauth-start",
  authorizeHeyGenOAuth: "service-configurations:heygen-oauth-authorize",
  completeHeyGenOAuth: "service-configurations:heygen-oauth-complete",
  getAppPathSettings: "app-settings:get-paths",
  chooseAppPathSetting: "app-settings:choose-path",
  getUpdateStatus: "updates:get-status",
  checkForUpdates: "updates:check",
  downloadUpdate: "updates:download",
  installUpdate: "updates:install",
  openUpdateReleasePage: "updates:open-release-page"
} as const;

export interface CreateTaskInput {
  title?: string;
  sourceScript?: string;
}

export interface UpdateTaskInput {
  taskId: string;
  title?: string;
  originalVideoUrl?: string;
  exportDirectory?: string;
  sourceScript?: string;
  finalScript?: string;
  contentLanguage?: ContentLanguage;
  generationMode?: VideoGenerationMode;
  avatarMode?: AvatarMode;
  presetAvatarId?: string;
  presetAvatarGroupId?: string;
  avatarDescriptionPrompt?: string;
  motionPrompt?: string;
  productImageAssetId?: MediaAsset["id"] | null;
  referenceImageAssetId?: MediaAsset["id"] | null;
  generatedPresenterImageAssetId?: MediaAsset["id"] | null;
  generatedPresenterImageSelections?: GeneratedPresenterImageSelections;
  mixedCutTargetCount?: number;
  mixedCutMaterialDirectory?: string;
  mixedCutBackgroundMusicDirectory?: string;
  mixedCutDubbingDirectory?: string;
  mixedCutChapterMode?: VideoTask["mixedCutChapterMode"];
  mixedCutReuseRate?: number;
  mixedCutGroupSettings?: MixedCutGroupSetting[];
  mixedCutRemoveOriginalAudio?: boolean;
  mixedCutEnableTransitions?: boolean;
  mixedCutBgmVolume?: number;
  dedupSourceVideoAssetId?: MediaAsset["id"] | null;
  dedupTargetScore?: number;
  dedupStrategy?: VideoTask["dedupStrategy"];
  dedupAttemptCount?: number;
  customFontAssetId?: MediaAsset["id"] | null;
  customFontFamily?: string;
  selectedOutputPresets?: OutputPresetId[];
  frameTitleStyle?: FrameTitleStyle;
  subtitleStyle?: SubtitleStyle;
  coverStyle?: CoverStyle;
  personalIpProfile?: PersonalIpProfile;
  creativeWorkflow?: CreativeWorkflow;
}

export interface GenerateVisualStoryboardInput {
  taskId: string;
  panelCount?: VisualStoryboardPanelCount;
}

export interface GeneratePresenterImagesInput {
  taskId: string;
  presetIds?: OutputPresetId[];
  promptOverride?: string;
}

export interface SelectGeneratedPresenterImageInput {
  taskId: string;
  presetId: OutputPresetId;
  assetId: MediaAsset["id"];
}

export interface SetMixedCutTargetCountInput {
  taskId: string;
  count: number;
}

export interface RemoveTaskMediaAssetInput {
  taskId: string;
  assetId: MediaAsset["id"];
}

export interface StartHeyGenOAuthInput {
  settings: ServiceConfiguration["settings"];
}

export interface StartHeyGenOAuthResult {
  authorizationUrl: string;
  codeVerifier: string;
  state: string;
  redirectUri: string;
  message: string;
}

export interface CompleteHeyGenOAuthInput {
  settings: ServiceConfiguration["settings"];
  callbackUrlOrCode: string;
  codeVerifier: string;
  expectedState: string;
}

export interface HeyGenAvatarLook {
  id: string;
  groupId?: string;
  name: string;
  previewImageUrl?: string;
  previewVideoUrl?: string;
  gender?: string;
  defaultVoiceId?: string;
  status?: string;
  avatarType?: string;
  orientation?: "portrait" | "landscape" | "square" | "unknown";
  imageWidth?: number;
  imageHeight?: number;
}

export interface CreateHeyGenAvatarInput {
  name: string;
  prompt: string;
  avatarGroupId?: string;
}

export interface CreateHeyGenAvatarResult {
  look: HeyGenAvatarLook;
  message: string;
}

export interface RetryWorkflowStepInput {
  taskId: string;
  stepId: GenerationStepId;
}

export interface ResolveTaskAssetUrlInput {
  taskId: string;
  relativePath: string;
}
