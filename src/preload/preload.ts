import { contextBridge, ipcRenderer } from "electron";
import type { VideoTask, VideoTaskSummary } from "../shared/domain";
import type {
  ProviderId,
  SaveServiceConfigurationInput,
  ServiceConfiguration,
  ServiceConnectionCheck
} from "../shared/serviceConfig";
import type { AppInfo, CreateTaskInput, DigitalHumanStudioAPI } from "../shared/ipc";

const IPC_CHANNELS = {
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

const api: DigitalHumanStudioAPI = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo) as Promise<AppInfo>,
  openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.openSettings) as Promise<void>,
  listTasks: () => ipcRenderer.invoke(IPC_CHANNELS.listTasks) as Promise<VideoTaskSummary[]>,
  getTask: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getTask, taskId) as Promise<VideoTask | null>,
  createTask: (input?: CreateTaskInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.createTask, input) as Promise<VideoTask>,
  listServiceConfigurations: () =>
    ipcRenderer.invoke(IPC_CHANNELS.listServiceConfigurations) as Promise<ServiceConfiguration[]>,
  saveServiceConfiguration: (input: SaveServiceConfigurationInput) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.saveServiceConfiguration,
      input
    ) as Promise<ServiceConfiguration>,
  clearServiceCredential: (providerId: ProviderId) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.clearServiceCredential,
      providerId
    ) as Promise<ServiceConfiguration>,
  testServiceConfiguration: (providerId: ProviderId) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.testServiceConfiguration,
      providerId
    ) as Promise<ServiceConnectionCheck>
};

contextBridge.exposeInMainWorld("digitalHumanStudio", api);
