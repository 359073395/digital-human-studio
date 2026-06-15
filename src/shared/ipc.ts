import type {
  ContentLanguage,
  GenerationStepId,
  OutputPresetId,
  VideoTask,
  VideoTaskSummary
} from "./domain";
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
  runMockWorkflow: (taskId: string) => Promise<VideoTask>;
  retryMockWorkflowStep: (input: RetryWorkflowStepInput) => Promise<VideoTask>;
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
  runMockWorkflow: "workflow:mock-run",
  retryMockWorkflowStep: "workflow:mock-retry-step",
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
  selectedOutputPresets?: OutputPresetId[];
}

export interface RetryWorkflowStepInput {
  taskId: string;
  stepId: GenerationStepId;
}
