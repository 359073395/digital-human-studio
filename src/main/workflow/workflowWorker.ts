import { parentPort, workerData } from "node:worker_threads";
import { HeyGenAvatarProvider } from "../avatar/heyGenAvatarProvider";
import { OpenAiImageProvider } from "../image/openAiImageProvider";
import { PresenterImageWorkflowService } from "../image/presenterImageWorkflowService";
import { OpenAiCompatibleSourceTranscriptionProvider } from "../media/sourceTranscriptionProvider";
import { OpenAiCompatibleScriptProvider } from "../script/openAiCompatibleScriptProvider";
import { ScriptWorkflowService } from "../script/scriptWorkflowService";
import { createAppPaths, ensureAppPaths } from "../storage/appPaths";
import { AppSettingsRepository } from "../storage/appSettingsRepository";
import { CredentialStore, createCredentialFilePath } from "../storage/credentialStore";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { SafeStorageCipher } from "../storage/safeStorageCipher";
import { ServiceConfigurationRepository } from "../storage/serviceConfigurationRepository";
import { TaskRepository } from "../storage/taskRepository";
import { OpenAiAsrSubtitleProvider } from "../subtitles/openAiAsrSubtitleProvider";
import type { VideoTask } from "../../shared/domain";
import { AvatarWorkflowService } from "../avatar/avatarWorkflowService";
import { ExportWorkflowService } from "./exportWorkflowService";
import { MixedCutWorkflowService } from "./mixedCutWorkflowService";
import { RealWorkflowRunner } from "./realWorkflowRunner";
import { detectRuntimePerformanceProfile } from "./runtimePerformanceProfile";
import { VideoDedupWorkflowService } from "./videoDedupWorkflowService";

export type WorkflowWorkerKind = "real-run" | "mixed-cut" | "dedup";

export interface WorkflowWorkerInput {
  kind: WorkflowWorkerKind;
  taskId: string;
  appDataDir: string;
}

type WorkflowWorkerResult =
  | {
      ok: true;
      task: VideoTask;
    }
  | {
      ok: false;
      error: {
        message: string;
        name?: string;
        stack?: string;
      };
    };

type WorkflowWorkerError = Extract<WorkflowWorkerResult, { ok: false }>["error"];

interface WorkerServices {
  database: TaskDatabase;
  mixedCutWorkflowService: MixedCutWorkflowService;
  realWorkflowRunner: RealWorkflowRunner;
  videoDedupWorkflowService: VideoDedupWorkflowService;
}

async function runWorker(): Promise<void> {
  const input = parseWorkerInput(workerData);
  const services = createWorkerServices(input.appDataDir);
  let result: WorkflowWorkerResult;

  try {
    const task = await runWorkflow(input, services);
    result = {
      ok: true,
      task
    };
  } catch (error) {
    result = {
      ok: false,
      error: serializeError(error)
    };
  } finally {
    services.database.close();
  }

  postResult(result);
}

function createWorkerServices(appDataDir: string): WorkerServices {
  const appPaths = createAppPaths(appDataDir);
  ensureAppPaths(appPaths);
  const performanceProfile = detectRuntimePerformanceProfile(appDataDir);
  const database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);

  const credentialStore = new CredentialStore(
    createCredentialFilePath(appDataDir),
    new SafeStorageCipher(appDataDir)
  );
  const taskRepository = new TaskRepository(database, appPaths);
  const appSettingsRepository = new AppSettingsRepository(database);
  const serviceConfigurationRepository = new ServiceConfigurationRepository(
    database,
    credentialStore
  );
  const scriptWorkflowService = new ScriptWorkflowService(
    taskRepository,
    appPaths,
    new OpenAiCompatibleScriptProvider(serviceConfigurationRepository, credentialStore),
    new OpenAiCompatibleSourceTranscriptionProvider(serviceConfigurationRepository, credentialStore)
  );
  const imageProvider = new OpenAiImageProvider(serviceConfigurationRepository, credentialStore);
  const presenterImageWorkflowService = new PresenterImageWorkflowService(
    taskRepository,
    appPaths,
    imageProvider,
    appSettingsRepository
  );
  const avatarWorkflowService = new AvatarWorkflowService(
    taskRepository,
    appPaths,
    new HeyGenAvatarProvider(serviceConfigurationRepository, credentialStore),
    new OpenAiAsrSubtitleProvider(serviceConfigurationRepository, credentialStore)
  );
  const exportWorkflowService = new ExportWorkflowService(
    taskRepository,
    appPaths,
    undefined,
    appSettingsRepository,
    { getPerformanceProfile: () => performanceProfile }
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

  return {
    database,
    mixedCutWorkflowService,
    realWorkflowRunner,
    videoDedupWorkflowService
  };
}

async function runWorkflow(
  input: WorkflowWorkerInput,
  services: WorkerServices
): Promise<VideoTask> {
  switch (input.kind) {
    case "mixed-cut":
      return services.mixedCutWorkflowService.prepareMixedCut(input.taskId);
    case "dedup":
      return services.videoDedupWorkflowService.runVideoDedup(input.taskId);
    case "real-run":
      return services.realWorkflowRunner.runTask(input.taskId);
  }
}

function parseWorkerInput(value: unknown): WorkflowWorkerInput {
  if (!value || typeof value !== "object") {
    throw new Error("Workflow worker input is missing.");
  }

  const record = value as Partial<WorkflowWorkerInput>;
  if (record.kind !== "real-run" && record.kind !== "mixed-cut" && record.kind !== "dedup") {
    throw new Error("Workflow worker kind is invalid.");
  }
  if (!record.taskId || typeof record.taskId !== "string") {
    throw new Error("Workflow worker taskId is missing.");
  }
  if (!record.appDataDir || typeof record.appDataDir !== "string") {
    throw new Error("Workflow worker appDataDir is missing.");
  }

  return {
    kind: record.kind,
    taskId: record.taskId,
    appDataDir: record.appDataDir
  };
}

function postResult(result: WorkflowWorkerResult): void {
  if (!parentPort) {
    throw new Error("Workflow worker parent port is unavailable.");
  }

  parentPort.postMessage(result);
}

function serializeError(error: unknown): WorkflowWorkerError {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack
    };
  }

  return {
    message: String(error || "Workflow worker failed.")
  };
}

void runWorker();
