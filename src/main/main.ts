import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import type { OpenDialogOptions } from "electron";
import type { ProviderId, SaveServiceConfigurationInput } from "../shared/serviceConfig";
import {
  IPC_CHANNELS,
  type AppInfo,
  type CreateTaskInput,
  type RetryWorkflowStepInput,
  type UpdateTaskInput
} from "../shared/ipc";
import { AvatarWorkflowService } from "./avatar/avatarWorkflowService";
import { HeyGenAvatarProvider } from "./avatar/heyGenAvatarProvider";
import { OpenAiImageProvider } from "./image/openAiImageProvider";
import { PresenterImageWorkflowService } from "./image/presenterImageWorkflowService";
import { createAppPaths, ensureAppPaths, getTaskMediaDirectory } from "./storage/appPaths";
import { CredentialStore, createCredentialFilePath } from "./storage/credentialStore";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "./storage/database";
import { OpenAiCompatibleScriptProvider } from "./script/openAiCompatibleScriptProvider";
import { SafeStorageCipher } from "./storage/safeStorageCipher";
import { ScriptWorkflowService } from "./script/scriptWorkflowService";
import { ServiceConfigurationRepository } from "./storage/serviceConfigurationRepository";
import { OpenAiAsrSubtitleProvider } from "./subtitles/openAiAsrSubtitleProvider";
import { TaskRepository } from "./storage/taskRepository";
import { MockWorkflowRunner } from "./workflow/mockWorkflowRunner";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

let mainWindow: BrowserWindow | null = null;
let taskDatabase: TaskDatabase | null = null;

function getPreloadPath(): string {
  return path.join(__dirname, "../preload/preload.js");
}

function getRendererEntry(): string {
  return path.join(__dirname, "../../dist-renderer/index.html");
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1180,
    minHeight: 720,
    title: "数字人口播工作台",
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
  serviceConfigurationRepository: ServiceConfigurationRepository;
  mockWorkflowRunner: MockWorkflowRunner;
  scriptWorkflowService: ScriptWorkflowService;
  avatarWorkflowService: AvatarWorkflowService;
  presenterImageWorkflowService: PresenterImageWorkflowService;
  appPaths: ReturnType<typeof createAppPaths>;
}

function createRepositories(): MainRepositories {
  const appDataDir = process.env.DHS_APP_DATA_DIR || app.getPath("userData");
  const appPaths = createAppPaths(appDataDir);
  ensureAppPaths(appPaths);

  taskDatabase = openTaskDatabase(appPaths.databasePath);
  runMigrations(taskDatabase);

  const credentialStore = new CredentialStore(
    createCredentialFilePath(appDataDir),
    new SafeStorageCipher()
  );
  const taskRepository = new TaskRepository(taskDatabase, appPaths);
  const serviceConfigurationRepository = new ServiceConfigurationRepository(
    taskDatabase,
    credentialStore
  );
  const scriptWorkflowService = new ScriptWorkflowService(
    taskRepository,
    appPaths,
    new OpenAiCompatibleScriptProvider(serviceConfigurationRepository, credentialStore)
  );
  const avatarWorkflowService = new AvatarWorkflowService(
    taskRepository,
    appPaths,
    new HeyGenAvatarProvider(serviceConfigurationRepository, credentialStore),
    new OpenAiAsrSubtitleProvider(serviceConfigurationRepository, credentialStore)
  );
  const presenterImageWorkflowService = new PresenterImageWorkflowService(
    taskRepository,
    appPaths,
    new OpenAiImageProvider(serviceConfigurationRepository, credentialStore)
  );
  const mockWorkflowRunner = new MockWorkflowRunner(taskRepository, appPaths);
  taskRepository.ensureSeedTask();
  return {
    taskRepository,
    serviceConfigurationRepository,
    mockWorkflowRunner,
    scriptWorkflowService,
    avatarWorkflowService,
    presenterImageWorkflowService,
    appPaths
  };
}

function registerIpcHandlers(repositories: MainRepositories): void {
  const {
    appPaths,
    avatarWorkflowService,
    mockWorkflowRunner,
    presenterImageWorkflowService,
    scriptWorkflowService,
    serviceConfigurationRepository,
    taskRepository
  } = repositories;

  ipcMain.handle(IPC_CHANNELS.getAppInfo, (): AppInfo => {
    return {
      name: app.getName(),
      version: app.getVersion(),
      environment: isDevelopment ? "development" : "production",
      platform: process.platform
    };
  });

  ipcMain.handle(IPC_CHANNELS.openSettings, () => {
    mainWindow?.webContents.send(IPC_CHANNELS.openSettings);
  });

  ipcMain.handle(IPC_CHANNELS.listTasks, () => taskRepository.listTasks());

  ipcMain.handle(IPC_CHANNELS.getTask, (_event, taskId: string) => taskRepository.getTask(taskId));

  ipcMain.handle(IPC_CHANNELS.createTask, (_event, input?: CreateTaskInput) =>
    taskRepository.createTask(input)
  );

  ipcMain.handle(IPC_CHANNELS.updateTask, (_event, input: UpdateTaskInput) =>
    taskRepository.updateTask(input)
  );

  ipcMain.handle(IPC_CHANNELS.generateScript, (_event, taskId: string) =>
    scriptWorkflowService.generateScript(taskId)
  );

  ipcMain.handle(IPC_CHANNELS.transcribeSource, (_event, taskId: string) =>
    scriptWorkflowService.transcribeSource(taskId)
  );

  ipcMain.handle(IPC_CHANNELS.uploadProductImage, async (_event, taskId: string) => {
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

  ipcMain.handle(IPC_CHANNELS.generatePresenterImages, (_event, taskId: string) =>
    presenterImageWorkflowService.generatePresenterImages(taskId)
  );

  ipcMain.handle(IPC_CHANNELS.renderHeyGenAvatar, (_event, taskId: string) =>
    avatarWorkflowService.renderHeyGenAvatar(taskId)
  );

  ipcMain.handle(IPC_CHANNELS.runMockWorkflow, (_event, taskId: string) =>
    mockWorkflowRunner.runTask(taskId)
  );

  ipcMain.handle(IPC_CHANNELS.retryMockWorkflowStep, (_event, input: RetryWorkflowStepInput) =>
    mockWorkflowRunner.retryStep(input.taskId, input.stepId)
  );

  ipcMain.handle(IPC_CHANNELS.openTaskExports, async (_event, taskId: string) => {
    const exportsDirectory = getTaskMediaDirectory(appPaths, taskId, "exports");
    await shell.openPath(exportsDirectory);
  });

  ipcMain.handle(IPC_CHANNELS.listServiceConfigurations, () =>
    serviceConfigurationRepository.listConfigurations()
  );

  ipcMain.handle(
    IPC_CHANNELS.saveServiceConfiguration,
    (_event, input: SaveServiceConfigurationInput) =>
      serviceConfigurationRepository.saveConfiguration(input)
  );

  ipcMain.handle(IPC_CHANNELS.clearServiceCredential, (_event, providerId: ProviderId) =>
    serviceConfigurationRepository.clearCredential(providerId)
  );

  ipcMain.handle(IPC_CHANNELS.testServiceConfiguration, (_event, providerId: ProviderId) =>
    serviceConfigurationRepository.testConfiguration(providerId)
  );
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
