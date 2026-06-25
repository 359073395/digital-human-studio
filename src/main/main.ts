import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import { autoUpdater } from "electron-updater";
import type { ActivateLicenseInput } from "../shared/license";
import {
  DEFAULT_HEYGEN_LOCAL_OAUTH_REDIRECT_URI,
  type ListServiceModelsInput,
  type ProviderId,
  type SaveServiceConfigurationInput
} from "../shared/serviceConfig";
import type { AppPathSettingKind } from "../shared/appSettings";
import {
  IPC_CHANNELS,
  type AppInfo,
  type CompleteHeyGenOAuthInput,
  type CreateHeyGenAvatarInput,
  type CreateTaskInput,
  type GeneratePresenterImagesInput,
  type GenerateVisualStoryboardInput,
  type ResolveTaskAssetUrlInput,
  type RetryWorkflowStepInput,
  type SelectGeneratedPresenterImageInput,
  type StartHeyGenOAuthInput,
  type UpdateTaskInput
} from "../shared/ipc";
import { AvatarWorkflowService } from "./avatar/avatarWorkflowService";
import { HeyGenAvatarCatalog } from "./avatar/heyGenAvatarCatalog";
import { HeyGenAvatarCreator } from "./avatar/heyGenAvatarCreator";
import { HeyGenAvatarProvider } from "./avatar/heyGenAvatarProvider";
import { createHeyGenLocalOAuthCallbackServer } from "./avatar/heyGenLocalOAuthCallback";
import { OpenAiImageProvider } from "./image/openAiImageProvider";
import { PresenterImageWorkflowService } from "./image/presenterImageWorkflowService";
import { getMachineCode } from "./license/machineCode";
import { LICENSE_PUBLIC_KEY_PEM } from "./license/licensePublicKey";
import { LicenseRepository } from "./license/licenseRepository";
import { LicenseService } from "./license/licenseService";
import { OpenAiCompatibleSourceTranscriptionProvider } from "./media/sourceTranscriptionProvider";
import { OpenAiCompatibleVisualAnalysisProvider } from "./media/visualAnalysisProvider";
import {
  createAppPaths,
  ensureAppPaths,
  getTaskDirectory,
  getTaskMediaDirectory
} from "./storage/appPaths";
import { AppSettingsRepository } from "./storage/appSettingsRepository";
import { CredentialStore, createCredentialFilePath } from "./storage/credentialStore";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "./storage/database";
import { OpenAiCompatibleScriptProvider } from "./script/openAiCompatibleScriptProvider";
import { SafeStorageCipher } from "./storage/safeStorageCipher";
import { ScriptWorkflowService } from "./script/scriptWorkflowService";
import { ServiceConfigurationRepository } from "./storage/serviceConfigurationRepository";
import { SourceAssetService } from "./source/sourceAssetService";
import { OpenAiCompatibleStoryboardProvider } from "./storyboard/openAiCompatibleStoryboardProvider";
import { StoryboardWorkflowService } from "./storyboard/storyboardWorkflowService";
import { OpenAiAsrSubtitleProvider } from "./subtitles/openAiAsrSubtitleProvider";
import { TaskRepository } from "./storage/taskRepository";
import { UpdateService } from "./updates/updateService";
import { ExportWorkflowService } from "./workflow/exportWorkflowService";
import { MixedCutWorkflowService } from "./workflow/mixedCutWorkflowService";
import { MockWorkflowRunner } from "./workflow/mockWorkflowRunner";
import { RealWorkflowRunner } from "./workflow/realWorkflowRunner";
import { detectRuntimePerformanceProfile } from "./workflow/runtimePerformanceProfile";
import { VideoDedupWorkflowService } from "./workflow/videoDedupWorkflowService";
import type { RuntimePerformanceProfile } from "../shared/performanceProfile";

const APP_DISPLAY_NAME = "跑量自媒体视频工作台";
const APP_LEGACY_DATA_DIR_NAME = "自媒体视频工作台";
const UPDATE_RELEASE_PAGE_URL = "https://github.com/359073395/digital-human-studio/releases";
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const ASSET_PROTOCOL = "dhs-asset";

app.setName(APP_DISPLAY_NAME);

let mainWindow: BrowserWindow | null = null;
let taskDatabase: TaskDatabase | null = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
]);

function getPreloadPath(): string {
  return path.join(__dirname, "../preload/preload.js");
}

function getRendererEntry(): string {
  return path.join(__dirname, "../../dist-renderer/index.html");
}

function resolveAppIconPath(): string {
  const candidates = [
    path.join(process.cwd(), "public", "app-logo.ico"),
    path.join(process.cwd(), "public", "app-logo.png"),
    path.join(__dirname, "../../dist-renderer/app-logo.png"),
    path.join(__dirname, "../../public/app-logo.png")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function createMainWindow(): void {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1180,
    minHeight: 720,
    title: APP_DISPLAY_NAME,
    icon: resolveAppIconPath(),
    autoHideMenuBar: true,
    backgroundColor: "#f5f7fb",
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDevelopment) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(getRendererEntry());
  }
}

interface MainRepositories {
  taskRepository: TaskRepository;
  appSettingsRepository: AppSettingsRepository;
  serviceConfigurationRepository: ServiceConfigurationRepository;
  mockWorkflowRunner: MockWorkflowRunner;
  scriptWorkflowService: ScriptWorkflowService;
  heyGenAvatarCatalog: HeyGenAvatarCatalog;
  heyGenAvatarCreator: HeyGenAvatarCreator;
  avatarWorkflowService: AvatarWorkflowService;
  presenterImageWorkflowService: PresenterImageWorkflowService;
  storyboardWorkflowService: StoryboardWorkflowService;
  sourceAssetService: SourceAssetService;
  mixedCutWorkflowService: MixedCutWorkflowService;
  videoDedupWorkflowService: VideoDedupWorkflowService;
  realWorkflowRunner: RealWorkflowRunner;
  licenseService: LicenseService;
  updateService: UpdateService;
  appPaths: ReturnType<typeof createAppPaths>;
  performanceProfile: RuntimePerformanceProfile;
}

function createRepositories(): MainRepositories {
  const appDataDir =
    process.env.DHS_APP_DATA_DIR || path.join(app.getPath("appData"), APP_LEGACY_DATA_DIR_NAME);
  const appPaths = createAppPaths(appDataDir);
  ensureAppPaths(appPaths);
  const performanceProfile = detectRuntimePerformanceProfile(appDataDir);

  taskDatabase = openTaskDatabase(appPaths.databasePath);
  runMigrations(taskDatabase);

  const credentialStore = new CredentialStore(
    createCredentialFilePath(appDataDir),
    new SafeStorageCipher(appDataDir)
  );
  const taskRepository = new TaskRepository(taskDatabase, appPaths);
  const appSettingsRepository = new AppSettingsRepository(taskDatabase);
  const licenseService = new LicenseService(new LicenseRepository(taskDatabase), {
    isDevelopment: isDevelopment || !app.isPackaged,
    publicKeyPem: LICENSE_PUBLIC_KEY_PEM,
    machineCodeProvider: getMachineCode
  });
  const updateService = new UpdateService({
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    releasePageUrl: UPDATE_RELEASE_PAGE_URL,
    updater: autoUpdater,
    openExternal: (url) => shell.openExternal(url)
  });
  const serviceConfigurationRepository = new ServiceConfigurationRepository(
    taskDatabase,
    credentialStore
  );
  const scriptWorkflowService = new ScriptWorkflowService(
    taskRepository,
    appPaths,
    new OpenAiCompatibleScriptProvider(serviceConfigurationRepository, credentialStore),
    new OpenAiCompatibleSourceTranscriptionProvider(serviceConfigurationRepository, credentialStore)
  );
  const heyGenAvatarCatalog = new HeyGenAvatarCatalog(
    serviceConfigurationRepository,
    credentialStore
  );
  const heyGenAvatarCreator = new HeyGenAvatarCreator(
    serviceConfigurationRepository,
    credentialStore
  );
  const avatarWorkflowService = new AvatarWorkflowService(
    taskRepository,
    appPaths,
    new HeyGenAvatarProvider(serviceConfigurationRepository, credentialStore),
    new OpenAiAsrSubtitleProvider(serviceConfigurationRepository, credentialStore)
  );
  const imageProvider = new OpenAiImageProvider(serviceConfigurationRepository, credentialStore);
  const presenterImageWorkflowService = new PresenterImageWorkflowService(
    taskRepository,
    appPaths,
    imageProvider,
    appSettingsRepository
  );
  const storyboardWorkflowService = new StoryboardWorkflowService(
    taskRepository,
    appPaths,
    new OpenAiCompatibleStoryboardProvider(serviceConfigurationRepository, credentialStore),
    imageProvider
  );
  const sourceAssetService = new SourceAssetService(
    taskRepository,
    appPaths,
    fetch,
    serviceConfigurationRepository,
    credentialStore,
    appSettingsRepository,
    new OpenAiCompatibleVisualAnalysisProvider(serviceConfigurationRepository, credentialStore)
  );
  const exportWorkflowService = new ExportWorkflowService(
    taskRepository,
    appPaths,
    undefined,
    appSettingsRepository
  );
  const mixedCutWorkflowService = new MixedCutWorkflowService(
    taskRepository,
    appPaths,
    appSettingsRepository,
    { getPerformanceProfile: () => performanceProfile }
  );
  const videoDedupWorkflowService = new VideoDedupWorkflowService(
    taskRepository,
    appPaths,
    appSettingsRepository,
    { getPerformanceProfile: () => performanceProfile }
  );
  const realWorkflowRunner = new RealWorkflowRunner(
    taskRepository,
    scriptWorkflowService,
    presenterImageWorkflowService,
    avatarWorkflowService,
    exportWorkflowService,
    mixedCutWorkflowService,
    videoDedupWorkflowService
  );
  const mockWorkflowRunner = new MockWorkflowRunner(taskRepository, appPaths);
  return {
    taskRepository,
    appSettingsRepository,
    serviceConfigurationRepository,
    mockWorkflowRunner,
    scriptWorkflowService,
    heyGenAvatarCatalog,
    heyGenAvatarCreator,
    avatarWorkflowService,
    presenterImageWorkflowService,
    storyboardWorkflowService,
    sourceAssetService,
    mixedCutWorkflowService,
    videoDedupWorkflowService,
    realWorkflowRunner,
    licenseService,
    updateService,
    appPaths,
    performanceProfile
  };
}

function registerIpcHandlers(repositories: MainRepositories): void {
  const {
    appPaths,
    appSettingsRepository,
    avatarWorkflowService,
    heyGenAvatarCreator,
    heyGenAvatarCatalog,
    mockWorkflowRunner,
    presenterImageWorkflowService,
    realWorkflowRunner,
    scriptWorkflowService,
    serviceConfigurationRepository,
    sourceAssetService,
    storyboardWorkflowService,
    taskRepository,
    mixedCutWorkflowService,
    videoDedupWorkflowService,
    licenseService,
    updateService,
    performanceProfile
  } = repositories;

  ipcMain.handle(IPC_CHANNELS.getAppInfo, (): AppInfo => {
    return {
      name: APP_DISPLAY_NAME,
      version: app.getVersion(),
      environment: isDevelopment ? "development" : "production",
      platform: process.platform,
      performanceProfile
    };
  });

  ipcMain.handle(IPC_CHANNELS.getLicenseStatus, () => licenseService.getStatus());

  ipcMain.handle(IPC_CHANNELS.activateLicense, (_event, input: ActivateLicenseInput) =>
    licenseService.activate(input)
  );

  ipcMain.handle(IPC_CHANNELS.clearLicense, () => licenseService.clear());

  const protectedHandle = (
    channel: string,
    listener: Parameters<typeof ipcMain.handle>[1]
  ): void => {
    ipcMain.handle(channel, async (event, ...args) => {
      licenseService.requireActivated();
      return listener(event, ...args);
    });
  };

  protectedHandle(IPC_CHANNELS.openSettings, () => {
    mainWindow?.webContents.send(IPC_CHANNELS.openSettings);
  });

  protectedHandle(IPC_CHANNELS.getAppPathSettings, () => appSettingsRepository.getPathSettings());

  protectedHandle(IPC_CHANNELS.chooseAppPathSetting, async (_event, kind: AppPathSettingKind) => {
    const current = appSettingsRepository.getPathSettings();
    const defaultPath = resolveExistingDirectory(
      current[kind] || defaultPathSettingDirectory(kind) || app.getPath("documents")
    );
    const options: OpenDialogOptions = {
      title: pathSettingDialogTitle(kind),
      properties: ["openDirectory", "createDirectory"],
      defaultPath
    };
    const result = await dialog.showOpenDialog(options);

    if (result.canceled || !result.filePaths[0]) {
      return current;
    }

    return appSettingsRepository.updatePathSetting(kind, result.filePaths[0]);
  });

  protectedHandle(IPC_CHANNELS.getUpdateStatus, () => updateService.getStatus());

  protectedHandle(IPC_CHANNELS.checkForUpdates, () => updateService.checkForUpdates());

  protectedHandle(IPC_CHANNELS.downloadUpdate, () => updateService.downloadUpdate());

  protectedHandle(IPC_CHANNELS.installUpdate, () => updateService.installUpdate());

  protectedHandle(IPC_CHANNELS.openUpdateReleasePage, () => updateService.openReleasePage());

  protectedHandle(IPC_CHANNELS.listTasks, () => taskRepository.listTasks());

  protectedHandle(IPC_CHANNELS.getTask, (_event, taskId: string) => taskRepository.getTask(taskId));

  protectedHandle(IPC_CHANNELS.createTask, (_event, input?: CreateTaskInput) =>
    taskRepository.createTask(input)
  );

  protectedHandle(IPC_CHANNELS.deleteTask, (_event, taskId: string) => {
    taskRepository.deleteTask(taskId);
    return taskRepository.listTasks();
  });

  protectedHandle(IPC_CHANNELS.updateTask, (_event, input: UpdateTaskInput) =>
    taskRepository.updateTask(input)
  );

  protectedHandle(IPC_CHANNELS.chooseExportDirectory, async (_event, taskId: string) => {
    const task = taskRepository.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }

    const exportDirectoryDialogOptions: OpenDialogOptions = {
      title: "选择保存目录",
      properties: ["openDirectory", "createDirectory"],
      defaultPath:
        task.exportDirectory ||
        appSettingsRepository.getPathSettings().generatedVideoDirectory ||
        app.getPath("videos")
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, exportDirectoryDialogOptions)
      : await dialog.showOpenDialog(exportDirectoryDialogOptions);

    if (result.canceled || !result.filePaths[0]) {
      return task;
    }

    return taskRepository.updateTask({
      taskId,
      exportDirectory: result.filePaths[0]
    });
  });

  protectedHandle(IPC_CHANNELS.generateScript, (_event, taskId: string) =>
    scriptWorkflowService.generateScript(taskId)
  );

  protectedHandle(IPC_CHANNELS.transcribeSource, (_event, taskId: string) =>
    scriptWorkflowService.transcribeSource(taskId)
  );

  protectedHandle(IPC_CHANNELS.downloadOriginalVideo, (_event, taskId: string) =>
    sourceAssetService.downloadOriginalVideo(taskId)
  );

  protectedHandle(IPC_CHANNELS.uploadSourceVideo, async (_event, taskId: string) => {
    const sourceVideoDialogOptions: OpenDialogOptions = {
      title: "选择原视频或原音频",
      properties: ["openFile"],
      filters: [
        {
          name: "视频/音频",
          extensions: ["mp4", "mov", "m4v", "webm", "mkv", "avi", "mp3", "wav", "m4a", "aac", "ogg"]
        }
      ]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, sourceVideoDialogOptions)
      : await dialog.showOpenDialog(sourceVideoDialogOptions);

    if (result.canceled || !result.filePaths[0]) {
      const task = taskRepository.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} was not found.`);
      }
      return task;
    }

    return sourceAssetService.importSourceVideo(taskId, result.filePaths[0]);
  });

  protectedHandle(IPC_CHANNELS.uploadMixedCutMaterial, async (_event, taskId: string) => {
    const materialDialogOptions: OpenDialogOptions = {
      title: "选择混剪素材",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "视频/音频/图片",
          extensions: [
            "mp4",
            "mov",
            "m4v",
            "webm",
            "mkv",
            "avi",
            "mp3",
            "wav",
            "m4a",
            "aac",
            "ogg",
            "png",
            "jpg",
            "jpeg",
            "webp"
          ]
        }
      ]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, materialDialogOptions)
      : await dialog.showOpenDialog(materialDialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      const task = taskRepository.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} was not found.`);
      }
      return task;
    }

    return sourceAssetService.importMixedCutMaterials(taskId, result.filePaths);
  });

  protectedHandle(IPC_CHANNELS.chooseMixedCutMaterialDirectory, async (_event, taskId: string) => {
    const directoryDialogOptions: OpenDialogOptions = {
      title: "选择混剪素材文件夹",
      properties: ["openDirectory"]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, directoryDialogOptions)
      : await dialog.showOpenDialog(directoryDialogOptions);

    if (result.canceled || !result.filePaths[0]) {
      const task = taskRepository.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} was not found.`);
      }
      return task;
    }

    return sourceAssetService.importMixedCutMaterialDirectory(taskId, result.filePaths[0]);
  });

  protectedHandle(IPC_CHANNELS.uploadMixedCutAudio, async (_event, taskId: string) => {
    const audioDialogOptions: OpenDialogOptions = {
      title: "选择混剪配音或音乐",
      properties: ["openFile"],
      filters: [
        {
          name: "音频",
          extensions: ["mp3", "wav", "m4a", "aac", "ogg"]
        }
      ]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, audioDialogOptions)
      : await dialog.showOpenDialog(audioDialogOptions);

    if (result.canceled || !result.filePaths[0]) {
      const task = taskRepository.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} was not found.`);
      }
      return task;
    }

    return sourceAssetService.importMixedCutAudio(taskId, result.filePaths[0]);
  });

  protectedHandle(IPC_CHANNELS.setMixedCutTargetCount, (_event, input) =>
    taskRepository.updateTask({
      taskId: input.taskId,
      mixedCutTargetCount: input.count
    })
  );

  protectedHandle(IPC_CHANNELS.renderMixedCutBatch, (_event, taskId: string) =>
    mixedCutWorkflowService.prepareMixedCut(taskId)
  );

  protectedHandle(IPC_CHANNELS.importDedupSourceVideo, async (_event, taskId: string) => {
    const dedupDialogOptions: OpenDialogOptions = {
      title: "选择待去重视频",
      properties: ["openFile"],
      filters: [
        {
          name: "视频",
          extensions: ["mp4", "mov", "m4v", "webm", "mkv", "avi"]
        }
      ]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dedupDialogOptions)
      : await dialog.showOpenDialog(dedupDialogOptions);

    if (result.canceled || !result.filePaths[0]) {
      const task = taskRepository.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} was not found.`);
      }
      return task;
    }

    return videoDedupWorkflowService.importSourceVideo(taskId, result.filePaths[0]);
  });

  protectedHandle(IPC_CHANNELS.runVideoDedup, (_event, taskId: string) =>
    videoDedupWorkflowService.runVideoDedup(taskId)
  );

  protectedHandle(IPC_CHANNELS.runOriginalityScore, (_event, taskId: string) =>
    videoDedupWorkflowService.runOriginalityScore(taskId)
  );

  protectedHandle(IPC_CHANNELS.uploadKnowledgeDocuments, async (_event, taskId: string) => {
    const knowledgeDialogOptions: OpenDialogOptions = {
      title: "选择知识库文档",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "知识文档",
          extensions: ["txt", "md", "json", "csv", "pdf", "doc", "docx"]
        }
      ]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, knowledgeDialogOptions)
      : await dialog.showOpenDialog(knowledgeDialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      const task = taskRepository.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} was not found.`);
      }
      return task;
    }

    return sourceAssetService.importKnowledgeDocuments(taskId, result.filePaths);
  });

  protectedHandle(IPC_CHANNELS.uploadViralCopyReferences, async (_event, taskId: string) => {
    const referenceDialogOptions: OpenDialogOptions = {
      title: "选择爆款文案/案例",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "爆款文案/案例",
          extensions: ["txt", "md", "json", "csv", "pdf", "doc", "docx"]
        }
      ]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, referenceDialogOptions)
      : await dialog.showOpenDialog(referenceDialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      const task = taskRepository.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} was not found.`);
      }
      return task;
    }

    return sourceAssetService.importViralCopyReferences(taskId, result.filePaths);
  });

  protectedHandle(IPC_CHANNELS.analyzeSourceVisuals, (_event, taskId: string) =>
    sourceAssetService.analyzeSourceVisuals(taskId)
  );

  protectedHandle(IPC_CHANNELS.generateStoryScriptOptions, (_event, taskId: string) =>
    storyboardWorkflowService.generateStoryScriptOptions(taskId)
  );

  protectedHandle(
    IPC_CHANNELS.generateVisualStoryboard,
    (_event, input: GenerateVisualStoryboardInput) =>
      storyboardWorkflowService.generateVisualStoryboard(input.taskId, input.panelCount)
  );

  protectedHandle(IPC_CHANNELS.uploadProductImage, async (_event, taskId: string) => {
    const productImageDialogOptions: OpenDialogOptions = {
      title: "选择商品图片",
      properties: ["openFile"],
      filters: [
        {
          name: "图片",
          extensions: ["png", "jpg", "jpeg", "webp"]
        }
      ]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, productImageDialogOptions)
      : await dialog.showOpenDialog(productImageDialogOptions);

    if (result.canceled || !result.filePaths[0]) {
      const task = taskRepository.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} was not found.`);
      }
      return task;
    }

    return presenterImageWorkflowService.importProductImage(taskId, result.filePaths[0]);
  });

  protectedHandle(IPC_CHANNELS.uploadReferenceImage, async (_event, taskId: string) => {
    const referenceImageDialogOptions: OpenDialogOptions = {
      title: "选择人物图片",
      properties: ["openFile"],
      filters: [
        {
          name: "图片",
          extensions: ["png", "jpg", "jpeg", "webp"]
        }
      ]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, referenceImageDialogOptions)
      : await dialog.showOpenDialog(referenceImageDialogOptions);

    if (result.canceled || !result.filePaths[0]) {
      const task = taskRepository.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} was not found.`);
      }
      return task;
    }

    return presenterImageWorkflowService.importReferenceImage(taskId, result.filePaths[0]);
  });

  protectedHandle(IPC_CHANNELS.uploadCustomFont, async (_event, taskId: string) => {
    const fontDialogOptions: OpenDialogOptions = {
      title: "选择字体文件",
      properties: ["openFile"],
      filters: [
        {
          name: "字体",
          extensions: ["ttf", "otf", "woff", "woff2"]
        }
      ]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, fontDialogOptions)
      : await dialog.showOpenDialog(fontDialogOptions);

    if (result.canceled || !result.filePaths[0]) {
      const task = taskRepository.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} was not found.`);
      }
      return task;
    }

    return presenterImageWorkflowService.importCustomFont(taskId, result.filePaths[0]);
  });

  protectedHandle(
    IPC_CHANNELS.generatePresenterImages,
    (_event, input: string | GeneratePresenterImagesInput) =>
      presenterImageWorkflowService.generatePresenterImages(input)
  );

  protectedHandle(
    IPC_CHANNELS.selectGeneratedPresenterImage,
    (_event, input: SelectGeneratedPresenterImageInput) =>
      presenterImageWorkflowService.selectGeneratedPresenterImage(input)
  );

  protectedHandle(IPC_CHANNELS.renderHeyGenAvatar, (_event, taskId: string) =>
    avatarWorkflowService.renderHeyGenAvatar(taskId)
  );

  protectedHandle(IPC_CHANNELS.listHeyGenAvatarLooks, () => heyGenAvatarCatalog.listAvatarLooks());

  protectedHandle(IPC_CHANNELS.createHeyGenAvatar, (_event, input: CreateHeyGenAvatarInput) =>
    heyGenAvatarCreator.createPromptAvatar(input)
  );

  protectedHandle(IPC_CHANNELS.runMockWorkflow, (_event, taskId: string) =>
    mockWorkflowRunner.runTask(taskId)
  );

  protectedHandle(IPC_CHANNELS.runRealWorkflow, (_event, taskId: string) =>
    realWorkflowRunner.runTask(taskId)
  );

  protectedHandle(IPC_CHANNELS.retryMockWorkflowStep, (_event, input: RetryWorkflowStepInput) =>
    mockWorkflowRunner.retryStep(input.taskId, input.stepId)
  );

  protectedHandle(IPC_CHANNELS.resolveTaskAssetUrl, (_event, input: ResolveTaskAssetUrlInput) => {
    const absolutePath = resolveTaskAssetPath(appPaths, input.taskId, input.relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`素材文件不存在：${input.relativePath}`);
    }

    return createTaskAssetUrl(input.taskId, input.relativePath);
  });

  protectedHandle(IPC_CHANNELS.openTaskExports, async (_event, taskId: string) => {
    const task = taskRepository.getTask(taskId);
    const exportsDirectory = task?.publishingPackage.exportDirectory
      ? resolveExportDirectory(appPaths, taskId, task.publishingPackage.exportDirectory)
      : getTaskMediaDirectory(appPaths, taskId, "exports");
    await shell.openPath(exportsDirectory);
  });

  protectedHandle(IPC_CHANNELS.listServiceConfigurations, () =>
    serviceConfigurationRepository.listConfigurations()
  );

  protectedHandle(
    IPC_CHANNELS.saveServiceConfiguration,
    (_event, input: SaveServiceConfigurationInput) =>
      serviceConfigurationRepository.saveConfiguration(input)
  );

  protectedHandle(IPC_CHANNELS.clearServiceCredential, (_event, providerId: ProviderId) =>
    serviceConfigurationRepository.clearCredential(providerId)
  );

  protectedHandle(IPC_CHANNELS.testServiceConfiguration, (_event, providerId: ProviderId) =>
    serviceConfigurationRepository.testConfiguration(providerId)
  );

  protectedHandle(IPC_CHANNELS.listServiceModels, (_event, input: ListServiceModelsInput) =>
    serviceConfigurationRepository.listModels(input)
  );

  protectedHandle(IPC_CHANNELS.startHeyGenOAuth, async (_event, input: StartHeyGenOAuthInput) => {
    const result = serviceConfigurationRepository.startHeyGenOAuth({
      settings: {
        ...input.settings,
        authMode: "oauth-bearer",
        oauthRedirectUri: input.settings.oauthRedirectUri || DEFAULT_HEYGEN_LOCAL_OAUTH_REDIRECT_URI
      }
    });
    await shell.openExternal(result.authorizationUrl);
    return result;
  });

  protectedHandle(
    IPC_CHANNELS.authorizeHeyGenOAuth,
    async (_event, input: StartHeyGenOAuthInput) => {
      const settings = {
        ...input.settings,
        authMode: "oauth-bearer" as const,
        enabled: true,
        oauthRedirectUri: chooseHeyGenLocalOAuthRedirectUri(input.settings.oauthRedirectUri)
      };
      const oauthStart = serviceConfigurationRepository.startHeyGenOAuth({ settings });
      const callbackServer = createHeyGenLocalOAuthCallbackServer({
        expectedState: oauthStart.state,
        redirectUri: oauthStart.redirectUri
      });

      try {
        await callbackServer.ready;
        await shell.openExternal(oauthStart.authorizationUrl);
        const callbackUrlOrCode = await callbackServer.callback;
        return await serviceConfigurationRepository.completeHeyGenOAuth({
          settings,
          callbackUrlOrCode,
          codeVerifier: oauthStart.codeVerifier,
          expectedState: oauthStart.state
        });
      } catch (error) {
        callbackServer.close();
        throw error;
      }
    }
  );

  protectedHandle(IPC_CHANNELS.completeHeyGenOAuth, (_event, input: CompleteHeyGenOAuthInput) =>
    serviceConfigurationRepository.completeHeyGenOAuth(input)
  );

  protocol.handle(ASSET_PROTOCOL, (request) => {
    try {
      const { taskId, relativePath } = parseTaskAssetUrl(request.url);
      const absolutePath = resolveTaskAssetPath(appPaths, taskId, relativePath);
      if (!fs.existsSync(absolutePath)) {
        return new Response("Asset not found", { status: 404 });
      }

      return net.fetch(pathToFileURL(absolutePath).toString());
    } catch {
      return new Response("Invalid asset URL", { status: 400 });
    }
  });
}

function chooseHeyGenLocalOAuthRedirectUri(redirectUri: string | undefined): string {
  const trimmedRedirectUri = redirectUri?.trim();
  if (!trimmedRedirectUri) {
    return DEFAULT_HEYGEN_LOCAL_OAUTH_REDIRECT_URI;
  }

  try {
    const url = new URL(trimmedRedirectUri);
    if (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname) && url.port) {
      return trimmedRedirectUri;
    }
  } catch {
    return DEFAULT_HEYGEN_LOCAL_OAUTH_REDIRECT_URI;
  }

  return DEFAULT_HEYGEN_LOCAL_OAUTH_REDIRECT_URI;
}

function createTaskAssetUrl(taskId: string, relativePath: string): string {
  const encodedSegments = relativePath.split("/").map(encodeURIComponent).join("/");
  return `${ASSET_PROTOCOL}://task/${encodeURIComponent(taskId)}/${encodedSegments}`;
}

function parseTaskAssetUrl(urlValue: string): { taskId: string; relativePath: string } {
  const url = new URL(urlValue);
  if (url.protocol !== `${ASSET_PROTOCOL}:` || url.hostname !== "task") {
    throw new Error("Invalid task asset URL.");
  }

  const [taskId, ...relativeSegments] = url.pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  const relativePath = relativeSegments.join("/");
  if (!taskId || !relativePath) {
    throw new Error("Task asset URL is missing path segments.");
  }

  return { taskId, relativePath };
}

function resolveTaskAssetPath(
  appPaths: ReturnType<typeof createAppPaths>,
  taskId: string,
  relativePath: string
): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) {
    throw new Error("任务 ID 不合法。");
  }

  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("\\")) {
    throw new Error("素材路径不合法。");
  }

  const taskDirectory = getTaskMediaDirectory(appPaths, taskId, "source");
  const taskRoot = path.dirname(taskDirectory);
  const absolutePath = path.resolve(taskRoot, ...relativePath.split("/"));
  const normalizedRoot = path.resolve(taskRoot);
  const isInsideTaskRoot =
    absolutePath === normalizedRoot || absolutePath.startsWith(`${normalizedRoot}${path.sep}`);

  if (!isInsideTaskRoot) {
    throw new Error("素材路径越界。");
  }

  return absolutePath;
}

function resolveExportDirectory(
  appPaths: ReturnType<typeof createAppPaths>,
  taskId: string,
  exportDirectory: string
): string {
  if (path.isAbsolute(exportDirectory)) {
    return exportDirectory;
  }

  return path.join(getTaskDirectory(appPaths, taskId), ...exportDirectory.split("/"));
}

function pathSettingDialogTitle(kind: AppPathSettingKind): string {
  switch (kind) {
    case "sourceDownloadDirectory":
      return "选择原视频下载目录";
    case "generatedImageDirectory":
      return "选择生成图片保存目录";
    case "generatedVideoDirectory":
      return "选择生成视频保存目录";
  }
}

function defaultPathSettingDirectory(kind: AppPathSettingKind): string {
  switch (kind) {
    case "sourceDownloadDirectory":
      return app.getPath("downloads");
    case "generatedImageDirectory":
      return app.getPath("pictures");
    case "generatedVideoDirectory":
      return app.getPath("videos");
  }
}

function resolveExistingDirectory(directory: string): string {
  let candidate = directory;
  while (candidate && !fs.existsSync(candidate)) {
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      break;
    }
    candidate = parent;
  }

  return candidate || app.getPath("documents");
}

app.whenReady().then(() => {
  const repositories = createRepositories();
  registerIpcHandlers(repositories);
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  taskDatabase?.close();
  taskDatabase = null;
});
