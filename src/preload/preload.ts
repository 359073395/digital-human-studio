import { contextBridge, ipcRenderer } from "electron";
import type { VideoTask, VideoTaskSummary } from "../shared/domain";
import type {
  ProviderId,
  SaveServiceConfigurationInput,
  ServiceConfiguration,
  ServiceConnectionCheck
} from "../shared/serviceConfig";
import type {
  AppInfo,
  CreateTaskInput,
  DigitalHumanStudioAPI,
  HeyGenAvatarLook,
  ResolveTaskAssetUrlInput,
  RetryWorkflowStepInput,
  UpdateTaskInput
} from "../shared/ipc";
import type { SourceTranscriptionResult } from "../shared/scriptGeneration";

const IPC_CHANNELS = {
  getAppInfo: "app:get-info",
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
  analyzeSourceVisuals: "source:analyze-visuals",
  uploadProductImage: "source:upload-product-image",
  uploadReferenceImage: "source:upload-reference-image",
  uploadCustomFont: "source:upload-custom-font",
  generatePresenterImages: "image:generate-presenter-images",
  renderHeyGenAvatar: "avatar:render-heygen",
  listHeyGenAvatarLooks: "avatar:list-heygen-looks",
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

const api: DigitalHumanStudioAPI = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo) as Promise<AppInfo>,
  openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.openSettings) as Promise<void>,
  listTasks: () => ipcRenderer.invoke(IPC_CHANNELS.listTasks) as Promise<VideoTaskSummary[]>,
  getTask: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getTask, taskId) as Promise<VideoTask | null>,
  createTask: (input?: CreateTaskInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.createTask, input) as Promise<VideoTask>,
  deleteTask: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteTask, taskId) as Promise<VideoTaskSummary[]>,
  updateTask: (input: UpdateTaskInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateTask, input) as Promise<VideoTask>,
  chooseExportDirectory: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseExportDirectory, taskId) as Promise<VideoTask>,
  generateScript: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.generateScript, taskId) as Promise<VideoTask>,
  transcribeSource: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.transcribeSource, taskId) as Promise<SourceTranscriptionResult>,
  downloadOriginalVideo: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.downloadOriginalVideo, taskId) as Promise<VideoTask>,
  uploadSourceVideo: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.uploadSourceVideo, taskId) as Promise<VideoTask>,
  uploadMixedCutMaterial: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.uploadMixedCutMaterial, taskId) as Promise<VideoTask>,
  analyzeSourceVisuals: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.analyzeSourceVisuals, taskId) as Promise<VideoTask>,
  uploadProductImage: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.uploadProductImage, taskId) as Promise<VideoTask>,
  uploadReferenceImage: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.uploadReferenceImage, taskId) as Promise<VideoTask>,
  uploadCustomFont: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.uploadCustomFont, taskId) as Promise<VideoTask>,
  generatePresenterImages: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.generatePresenterImages, taskId) as Promise<VideoTask>,
  renderHeyGenAvatar: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.renderHeyGenAvatar, taskId) as Promise<VideoTask>,
  listHeyGenAvatarLooks: () =>
    ipcRenderer.invoke(IPC_CHANNELS.listHeyGenAvatarLooks) as Promise<HeyGenAvatarLook[]>,
  runRealWorkflow: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.runRealWorkflow, taskId) as Promise<VideoTask>,
  runMockWorkflow: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.runMockWorkflow, taskId) as Promise<VideoTask>,
  retryMockWorkflowStep: (input: RetryWorkflowStepInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.retryMockWorkflowStep, input) as Promise<VideoTask>,
  resolveTaskAssetUrl: (input: ResolveTaskAssetUrlInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.resolveTaskAssetUrl, input) as Promise<string>,
  openTaskExports: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.openTaskExports, taskId) as Promise<void>,
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
