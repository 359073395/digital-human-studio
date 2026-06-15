import { contextBridge, ipcRenderer } from "electron";
import type { VideoTask, VideoTaskSummary } from "../shared/domain";
import type { AppInfo, CreateTaskInput, DigitalHumanStudioAPI } from "../shared/ipc";

const IPC_CHANNELS = {
  getAppInfo: "app:get-info",
  openSettings: "app:open-settings",
  listTasks: "tasks:list",
  getTask: "tasks:get",
  createTask: "tasks:create"
} as const;

const api: DigitalHumanStudioAPI = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo) as Promise<AppInfo>,
  openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.openSettings) as Promise<void>,
  listTasks: () => ipcRenderer.invoke(IPC_CHANNELS.listTasks) as Promise<VideoTaskSummary[]>,
  getTask: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getTask, taskId) as Promise<VideoTask | null>,
  createTask: (input?: CreateTaskInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.createTask, input) as Promise<VideoTask>
};

contextBridge.exposeInMainWorld("digitalHumanStudio", api);
