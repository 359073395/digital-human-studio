import fs from "node:fs";
import path from "node:path";
import type { VideoTask } from "../../shared/domain";
import type { SourceTranscriptionResult } from "../../shared/scriptGeneration";
import { getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { TaskRepository } from "../storage/taskRepository";
import { MockAsrProvider } from "./mockAsrProvider";
import { defaultSourceScript, MockScriptProvider } from "./mockScriptProvider";
import { ScriptProviderUnavailableError, type ScriptProvider } from "./scriptProvider";

export class ScriptWorkflowService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly paths: AppPaths,
    private readonly scriptProvider: ScriptProvider = new MockScriptProvider(),
    private readonly asrProvider = new MockAsrProvider(),
    private readonly fallbackScriptProvider: ScriptProvider = new MockScriptProvider()
  ) {}

  async generateScript(taskId: string) {
    const task = this.requireTask(taskId);
    const sourceScript = task.sourceScript || defaultSourceScript(task.contentLanguage);
    const sourceBrief = buildSourceBrief(this.paths, task, sourceScript);

    this.taskRepository.updateStepStatus(taskId, "source", "complete");
    this.taskRepository.updateStepStatus(taskId, "script", "running");

    try {
      if (!task.sourceScript) {
        this.taskRepository.updateTask({
          taskId,
          sourceScript
        });
      }

      const result = await this.generateWithFallback({
        ...task,
        sourceScript: sourceBrief
      });

      writeTaskFile(
        this.paths,
        taskId,
        "source/script-generation-prompt.txt",
        result.promptPreview
      );
      writeTaskFile(this.paths, taskId, "source/final-script.txt", result.finalScript);

      this.taskRepository.updateScriptGeneration(taskId, {
        finalScript: result.finalScript,
        similarityRisk: result.similarityRisk,
        scriptGenerationNotes: result.notes
      });

      return this.taskRepository.updateStepStatus(taskId, "script", "complete");
    } catch (error) {
      return this.taskRepository.updateStepStatus(
        taskId,
        "script",
        "retry-ready",
        error instanceof Error ? error.message : "Script generation failed."
      );
    }
  }

  transcribeSource(taskId: string): SourceTranscriptionResult {
    const task = this.requireTask(taskId);
    this.taskRepository.updateStepStatus(taskId, "source", "running");

    try {
      const result = this.asrProvider.transcribe(task.contentLanguage);
      this.taskRepository.updateTask({
        taskId,
        sourceScript: result.transcript,
        contentLanguage: result.contentLanguage
      });
      writeTaskFile(this.paths, taskId, "source/source-transcript.txt", result.transcript);
      this.taskRepository.addMediaAsset(
        taskId,
        "source-transcript",
        "source/source-transcript.txt"
      );
      this.taskRepository.updateStepStatus(taskId, "source", "complete");
      return result;
    } catch (error) {
      this.taskRepository.updateStepStatus(
        taskId,
        "source",
        "retry-ready",
        error instanceof Error ? error.message : "Source transcription failed."
      );
      throw error;
    }
  }

  private requireTask(taskId: string) {
    const task = this.taskRepository.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    return task;
  }

  private async generateWithFallback(task: VideoTask) {
    try {
      return await this.scriptProvider.generate(task);
    } catch (error) {
      if (error instanceof ScriptProviderUnavailableError) {
        return this.fallbackScriptProvider.generate(task);
      }

      throw error;
    }
  }
}

function writeTaskFile(
  paths: AppPaths,
  taskId: string,
  relativePath: string,
  content: string
): void {
  const absolutePath = path.join(getTaskDirectory(paths, taskId), ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf8");
}

function buildSourceBrief(paths: AppPaths, task: VideoTask, sourceScript: string): string {
  const visualAnalysis = readLatestVisualAnalysis(paths, task);
  if (!visualAnalysis) {
    return sourceScript;
  }

  return [sourceScript, "", "Reference visual analysis brief:", visualAnalysis]
    .filter(Boolean)
    .join("\n");
}

function readLatestVisualAnalysis(paths: AppPaths, task: VideoTask): string {
  const asset = [...task.mediaAssets]
    .reverse()
    .find((candidate) => candidate.kind === "source-visual-analysis");
  if (!asset) {
    return "";
  }

  const absolutePath = path.join(
    getTaskDirectory(paths, task.id),
    ...asset.relativePath.split("/")
  );
  try {
    return fs.readFileSync(absolutePath, "utf8").slice(0, 5000);
  } catch {
    return "";
  }
}
