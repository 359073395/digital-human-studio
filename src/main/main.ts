import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import type { ProviderId, SaveServiceConfigurationInput } from "../shared/serviceConfig";
import {
  IPC_CHANNELS,
  type AppInfo,
  type CreateTaskInput,
  type RetryWorkflowStepInput,
  type UpdateTaskInput
} from "../shared/ipc";
import { createAppPaths, ensureAppPaths, getTaskMediaDirectory } from "./storage/appPaths";
import { CredentialStore, createCredentialFilePath } from "./storage/credentialStore";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "./storage/database";
import { SafeStorageCipher } from "./storage/safeStorageCipher";
import { ServiceConfigurationRepository } from "./storage/serviceConfigurationRepository";
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
  const mockWorkflowRunner = new MockWorkflowRunner(taskRepository, appPaths);
  taskRepository.ensureSeedTask();
  return { taskRepository, serviceConfigurationRepository, mockWorkflowRunner, appPaths };
}

function registerIpcHandlers(repositories: MainRepositories): void {
  const { appPaths, mockWorkflowRunner, serviceConfigurationRepository, taskRepository } =
    repositories;

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
