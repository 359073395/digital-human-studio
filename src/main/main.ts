import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import type { ProviderId, SaveServiceConfigurationInput } from "../shared/serviceConfig";
import {
  IPC_CHANNELS,
  type AppInfo,
  type CreateTaskInput,
  type ResolveTaskAssetUrlInput,
  type RetryWorkflowStepInput,
  type UpdateTaskInput
} from "../shared/ipc";
import { AvatarWorkflowService } from "./avatar/avatarWorkflowService";
import { HeyGenAvatarCatalog } from "./avatar/heyGenAvatarCatalog";
import { HeyGenAvatarProvider } from "./avatar/heyGenAvatarProvider";
import { OpenAiImageProvider } from "./image/openAiImageProvider";
import { PresenterImageWorkflowService } from "./image/presenterImageWorkflowService";
import {
  createAppPaths,
  ensureAppPaths,
  getTaskDirectory,
  getTaskMediaDirectory
} from "./storage/appPaths";
import { CredentialStore, createCredentialFilePath } from "./storage/credentialStore";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "./storage/database";
import { OpenAiCompatibleScriptProvider } from "./script/openAiCompatibleScriptProvider";
import { SafeStorageCipher } from "./storage/safeStorageCipher";
import { ScriptWorkflowService } from "./script/scriptWorkflowService";
import { ServiceConfigurationRepository } from "./storage/serviceConfigurationRepository";
import { SourceAssetService } from "./source/sourceAssetService";
import { OpenAiAsrSubtitleProvider } from "./subtitles/openAiAsrSubtitleProvider";
import { TaskRepository } from "./storage/taskRepository";
import { ExportWorkflowService } from "./workflow/exportWorkflowService";
import { MockWorkflowRunner } from "./workflow/mockWorkflowRunner";
import { RealWorkflowRunner } from "./workflow/realWorkflowRunner";

const APP_DISPLAY_NAME = "自媒体视频工作台";
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

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1180,
    minHeight: 720,
    title: APP_DISPLAY_NAME,
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
  heyGenAvatarCatalog: HeyGenAvatarCatalog;
  avatarWorkflowService: AvatarWorkflowService;
  presenterImageWorkflowService: PresenterImageWorkflowService;
  sourceAssetService: SourceAssetService;
  realWorkflowRunner: RealWorkflowRunner;
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
    new SafeStorageCipher(appDataDir)
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
  const heyGenAvatarCatalog = new HeyGenAvatarCatalog(
    serviceConfigurationRepository,
    credentialStore
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
  const sourceAssetService = new SourceAssetService(taskRepository, appPaths);
  const exportWorkflowService = new ExportWorkflowService(taskRepository, appPaths);
  const realWorkflowRunner = new RealWorkflowRunner(
    taskRepository,
    scriptWorkflowService,
    presenterImageWorkflowService,
    avatarWorkflowService,
    exportWorkflowService
  );
  const mockWorkflowRunner = new MockWorkflowRunner(taskRepository, appPaths);
  taskRepository.ensureSeedTask();
  return {
    taskRepository,
    serviceConfigurationRepository,
    mockWorkflowRunner,
    scriptWorkflowService,
    heyGenAvatarCatalog,
    avatarWorkflowService,
    presenterImageWorkflowService,
    sourceAssetService,
    realWorkflowRunner,
    appPaths
  };
}

function registerIpcHandlers(repositories: MainRepositories): void {
  const {
    appPaths,
    avatarWorkflowService,
    heyGenAvatarCatalog,
    mockWorkflowRunner,
    presenterImageWorkflowService,
    realWorkflowRunner,
    scriptWorkflowService,
    serviceConfigurationRepository,
    sourceAssetService,
    taskRepository
  } = repositories;

  ipcMain.handle(IPC_CHANNELS.getAppInfo, (): AppInfo => {
    return {
      name: APP_DISPLAY_NAME,
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

  ipcMain.handle(IPC_CHANNELS.deleteTask, (_event, taskId: string) => {
    taskRepository.deleteTask(taskId);
    if (taskRepository.listTasks().length === 0) {
      taskRepository.createTask({ title: "新建视频任务" });
    }
    return taskRepository.listTasks();
  });

  ipcMain.handle(IPC_CHANNELS.updateTask, (_event, input: UpdateTaskInput) =>
    taskRepository.updateTask(input)
  );

  ipcMain.handle(IPC_CHANNELS.chooseExportDirectory, async (_event, taskId: string) => {
    const task = taskRepository.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }

    const exportDirectoryDialogOptions: OpenDialogOptions = {
      title: "选择保存目录",
      properties: ["openDirectory", "createDirectory"],
      defaultPath: task.exportDirectory || app.getPath("videos")
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

  ipcMain.handle(IPC_CHANNELS.generateScript, (_event, taskId: string) =>
    scriptWorkflowService.generateScript(taskId)
  );

  ipcMain.handle(IPC_CHANNELS.transcribeSource, (_event, taskId: string) =>
    scriptWorkflowService.transcribeSource(taskId)
  );

  ipcMain.handle(IPC_CHANNELS.downloadOriginalVideo, (_event, taskId: string) =>
    sourceAssetService.downloadOriginalVideo(taskId)
  );

  ipcMain.handle(IPC_CHANNELS.uploadSourceVideo, async (_event, taskId: string) => {
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

  ipcMain.handle(IPC_CHANNELS.uploadMixedCutMaterial, async (_event, taskId: string) => {
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

  ipcMain.handle(IPC_CHANNELS.analyzeSourceVisuals, (_event, taskId: string) =>
    sourceAssetService.analyzeSourceVisuals(taskId)
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

  ipcMain.handle(IPC_CHANNELS.uploadReferenceImage, async (_event, taskId: string) => {
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

  ipcMain.handle(IPC_CHANNELS.uploadCustomFont, async (_event, taskId: string) => {
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

  ipcMain.handle(IPC_CHANNELS.generatePresenterImages, (_event, taskId: string) =>
    presenterImageWorkflowService.generatePresenterImages(taskId)
  );

  ipcMain.handle(IPC_CHANNELS.renderHeyGenAvatar, (_event, taskId: string) =>
    avatarWorkflowService.renderHeyGenAvatar(taskId)
  );

  ipcMain.handle(IPC_CHANNELS.listHeyGenAvatarLooks, () => heyGenAvatarCatalog.listAvatarLooks());

  ipcMain.handle(IPC_CHANNELS.runMockWorkflow, (_event, taskId: string) =>
    mockWorkflowRunner.runTask(taskId)
  );

  ipcMain.handle(IPC_CHANNELS.runRealWorkflow, (_event, taskId: string) =>
    realWorkflowRunner.runTask(taskId)
  );

  ipcMain.handle(IPC_CHANNELS.retryMockWorkflowStep, (_event, input: RetryWorkflowStepInput) =>
    mockWorkflowRunner.retryStep(input.taskId, input.stepId)
  );

  ipcMain.handle(IPC_CHANNELS.resolveTaskAssetUrl, (_event, input: ResolveTaskAssetUrlInput) => {
    const absolutePath = resolveTaskAssetPath(appPaths, input.taskId, input.relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`素材文件不存在：${input.relativePath}`);
    }

    return createTaskAssetUrl(input.taskId, input.relativePath);
  });

  ipcMain.handle(IPC_CHANNELS.openTaskExports, async (_event, taskId: string) => {
    const task = taskRepository.getTask(taskId);
    const exportsDirectory = task?.publishingPackage.exportDirectory
      ? resolveExportDirectory(appPaths, taskId, task.publishingPackage.exportDirectory)
      : getTaskMediaDirectory(appPaths, taskId, "exports");
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
