import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type AppInfo, type DigitalHumanStudioAPI } from "../shared/ipc";

const api: DigitalHumanStudioAPI = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo) as Promise<AppInfo>,
  openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.openSettings) as Promise<void>
};

contextBridge.exposeInMainWorld("digitalHumanStudio", api);
