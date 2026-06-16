import type {
  AvatarMode,
  CoverStyle,
  ContentLanguage,
  GenerationStepId,
  MediaAsset,
  OutputPresetId,
  PersonalIpProfile,
  SubtitleStyle,
  VideoGenerationMode,
  VideoTask,
  VideoTaskSummary
} from "./domain";
import type { SourceTranscriptionResult } from "./scriptGeneration";
import type {
  ProviderId,
  SaveServiceConfigurationInput,
  ServiceConfiguration,
  ServiceConnectionCheck
} from "./serviceConfig";

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
  listTasks: () => Promise<VideoTaskSummary[]>;
  getTask: (taskId: string) => Promise<VideoTask | null>;
  createTask: (input?: CreateTaskInput) => Promise<VideoTask>;
  updateTask: (input: UpdateTaskInput) => Promise<VideoTask>;
  generateScript: (taskId: string) => Promise<VideoTask>;
  transcribeSource: (taskId: string) => Promise<SourceTranscriptionResult>;
  uploadProductImage: (taskId: string) => Promise<VideoTask>;
  uploadReferenceImage: (taskId: string) => Promise<VideoTask>;
  generatePresenterImages: (taskId: string) => Promise<VideoTask>;
  renderHeyGenAvatar: (taskId: string) => Promise<VideoTask>;
  runRealWorkflow: (taskId: string) => Promise<VideoTask>;
  runMockWorkflow: (taskId: string) => Promise<VideoTask>;
  retryMockWorkflowStep: (input: RetryWorkflowStepInput) => Promise<VideoTask>;
  resolveTaskAssetUrl: (input: ResolveTaskAssetUrlInput) => Promise<string>;
  openTaskExports: (taskId: string) => Promise<void>;
  listServiceConfigurations: () => Promise<ServiceConfiguration[]>;
  saveServiceConfiguration: (input: SaveServiceConfigurationInput) => Promise<ServiceConfiguration>;
  clearServiceCredential: (providerId: ProviderId) => Promise<ServiceConfiguration>;
  testServiceConfiguration: (providerId: ProviderId) => Promise<ServiceConnectionCheck>;
}

export const IPC_CHANNELS = {
  getAppInfo: "app:get-info",
  openSettings: "app:open-settings",
  listTasks: "tasks:list",
  getTask: "tasks:get",
  createTask: "tasks:create",
  updateTask: "tasks:update",
  generateScript: "script:generate",
  transcribeSource: "source:transcribe",
  uploadProductImage: "source:upload-product-image",
  uploadReferenceImage: "source:upload-reference-image",
  generatePresenterImages: "image:generate-presenter-images",
  renderHeyGenAvatar: "avatar:render-heygen",
  runRealWorkflow: "workflow:real-run",
  runMockWorkflow: "workflow:mock-run",
  retryMockWorkflowStep: "workflow:mock-retry-step",
  resolveTaskAssetUrl: "assets:resolve-task-url",
  openTaskExports: "workflow:open-exports",
  listServiceConfigurations: "service-configurations:list",
  saveServiceConfiguration: "service-configurations:save",
  clearServiceCredential: "service-configurations:clear-credential",
  testServiceConfiguration: "service-configurations:test"
} as const;

export interface CreateTaskInput {
  title?: string;
  sourceScript?: string;
}

export interface UpdateTaskInput {
  taskId: string;
  title?: string;
  sourceScript?: string;
  contentLanguage?: ContentLanguage;
  generationMode?: VideoGenerationMode;
  avatarMode?: AvatarMode;
  avatarDescriptionPrompt?: string;
  motionPrompt?: string;
  productImageAssetId?: MediaAsset["id"] | null;
  referenceImageAssetId?: MediaAsset["id"] | null;
  generatedPresenterImageAssetId?: MediaAsset["id"] | null;
  selectedOutputPresets?: OutputPresetId[];
  subtitleStyle?: SubtitleStyle;
  coverStyle?: CoverStyle;
  personalIpProfile?: PersonalIpProfile;
}

export interface RetryWorkflowStepInput {
  taskId: string;
  stepId: GenerationStepId;
}

export interface ResolveTaskAssetUrlInput {
  taskId: string;
  relativePath: string;
}
