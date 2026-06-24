import { contextBridge, ipcRenderer } from "electron";
import type { VideoTask, VideoTaskSummary } from "../shared/domain";
import type { AppPathSettingKind, AppPathSettings } from "../shared/appSettings";
import type {
  ProviderId,
  ListServiceModelsInput,
  SaveServiceConfigurationInput,
  ServiceConfiguration,
  ServiceConnectionCheck,
  ServiceModelList
} from "../shared/serviceConfig";
import type {
  AppInfo,
  CompleteHeyGenOAuthInput,
  CreateHeyGenAvatarInput,
  CreateHeyGenAvatarResult,
  CreateTaskInput,
  DigitalHumanStudioAPI,
  GeneratePresenterImagesInput,
  GenerateVisualStoryboardInput,
  HeyGenAvatarLook,
  ResolveTaskAssetUrlInput,
  RetryWorkflowStepInput,
  SelectGeneratedPresenterImageInput,
  SetMixedCutTargetCountInput,
  StartHeyGenOAuthInput,
  StartHeyGenOAuthResult,
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
  chooseMixedCutMaterialDirectory: "source:choose-mixed-cut-material-directory",
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
  chooseAppPathSetting: "app-settings:choose-path"
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
  chooseMixedCutMaterialDirectory: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseMixedCutMaterialDirectory, taskId) as Promise<VideoTask>,
  setMixedCutTargetCount: (input: SetMixedCutTargetCountInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.setMixedCutTargetCount, input) as Promise<VideoTask>,
  renderMixedCutBatch: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.renderMixedCutBatch, taskId) as Promise<VideoTask>,
  importDedupSourceVideo: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.importDedupSourceVideo, taskId) as Promise<VideoTask>,
  runVideoDedup: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.runVideoDedup, taskId) as Promise<VideoTask>,
  runOriginalityScore: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.runOriginalityScore, taskId) as Promise<VideoTask>,
  uploadKnowledgeDocuments: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.uploadKnowledgeDocuments, taskId) as Promise<VideoTask>,
  uploadViralCopyReferences: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.uploadViralCopyReferences, taskId) as Promise<VideoTask>,
  analyzeSourceVisuals: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.analyzeSourceVisuals, taskId) as Promise<VideoTask>,
  generateStoryScriptOptions: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.generateStoryScriptOptions, taskId) as Promise<VideoTask>,
  generateVisualStoryboard: (input: GenerateVisualStoryboardInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.generateVisualStoryboard, input) as Promise<VideoTask>,
  uploadProductImage: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.uploadProductImage, taskId) as Promise<VideoTask>,
  uploadReferenceImage: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.uploadReferenceImage, taskId) as Promise<VideoTask>,
  uploadCustomFont: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.uploadCustomFont, taskId) as Promise<VideoTask>,
  generatePresenterImages: (input: GeneratePresenterImagesInput | string) =>
    ipcRenderer.invoke(IPC_CHANNELS.generatePresenterImages, input) as Promise<VideoTask>,
  selectGeneratedPresenterImage: (input: SelectGeneratedPresenterImageInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.selectGeneratedPresenterImage, input) as Promise<VideoTask>,
  renderHeyGenAvatar: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.renderHeyGenAvatar, taskId) as Promise<VideoTask>,
  listHeyGenAvatarLooks: () =>
    ipcRenderer.invoke(IPC_CHANNELS.listHeyGenAvatarLooks) as Promise<HeyGenAvatarLook[]>,
  createHeyGenAvatar: (input: CreateHeyGenAvatarInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.createHeyGenAvatar, input) as Promise<CreateHeyGenAvatarResult>,
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
    ) as Promise<ServiceConnectionCheck>,
  listServiceModels: (input: ListServiceModelsInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.listServiceModels, input) as Promise<ServiceModelList>,
  startHeyGenOAuth: (input: StartHeyGenOAuthInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.startHeyGenOAuth, input) as Promise<StartHeyGenOAuthResult>,
  authorizeHeyGenOAuth: (input: StartHeyGenOAuthInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.authorizeHeyGenOAuth, input) as Promise<ServiceConnectionCheck>,
  completeHeyGenOAuth: (input: CompleteHeyGenOAuthInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.completeHeyGenOAuth, input) as Promise<ServiceConnectionCheck>,
  getAppPathSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getAppPathSettings) as Promise<AppPathSettings>,
  chooseAppPathSetting: (kind: AppPathSettingKind) =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseAppPathSetting, kind) as Promise<AppPathSettings>
};

contextBridge.exposeInMainWorld("digitalHumanStudio", api);
