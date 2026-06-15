import type { VideoTask, VideoTaskSummary } from "./domain";
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
  listServiceConfigurations: "service-configurations:list",
  saveServiceConfiguration: "service-configurations:save",
  clearServiceCredential: "service-configurations:clear-credential",
  testServiceConfiguration: "service-configurations:test"
} as const;

export interface CreateTaskInput {
  title?: string;
  sourceScript?: string;
}
