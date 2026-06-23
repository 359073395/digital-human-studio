import fs from "node:fs";
import path from "node:path";
import type { VideoTask } from "../../shared/domain";
import type { SourceTranscriptionResult } from "../../shared/scriptGeneration";
import {
  buildKnowledgeContext,
  writeKnowledgeContextPreview
} from "../knowledge/knowledgeContextBuilder";
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
    const knowledgeContext = buildKnowledgeContext(
      this.paths,
      {
        ...task,
        sourceScript
      },
      "script"
    );
    writeKnowledgeContextPreview(this.paths, taskId, knowledgeContext);

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
        sourceScript: knowledgeContext.promptText
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
        error instanceof Error ? error.message : "文案生成失败。"
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
        error instanceof Error ? error.message : "源素材转写失败。"
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
