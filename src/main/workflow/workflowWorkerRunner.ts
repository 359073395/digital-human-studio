import path from "node:path";
import { Worker } from "node:worker_threads";
import type { VideoTask } from "../../shared/domain";
import type { WorkflowWorkerInput, WorkflowWorkerKind } from "./workflowWorker";

const WORKFLOW_WORKER_TIMEOUT_MS = 60 * 60 * 1000;

const runningTaskIds = new Set<string>();

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

export function runWorkflowInWorker(input: {
  appDataDir: string;
  kind: WorkflowWorkerKind;
  taskId: string;
}): Promise<VideoTask> {
  if (runningTaskIds.has(input.taskId)) {
    return Promise.reject(new Error("该任务正在输出中，请等待当前输出完成后再操作。"));
  }

  runningTaskIds.add(input.taskId);
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, "workflowWorker.js");
    const workerInput: WorkflowWorkerInput = {
      appDataDir: input.appDataDir,
      kind: input.kind,
      taskId: input.taskId
    };
    const worker = new Worker(workerPath, {
      workerData: workerInput
    });
    let settled = false;
    const timeout = setTimeout(() => {
      settle(() => {
        void worker.terminate();
        reject(new Error("视频输出后台任务超时，请检查素材数量、视频长度或 FFmpeg 状态后重试。"));
      });
    }, WORKFLOW_WORKER_TIMEOUT_MS);

    const settle = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      runningTaskIds.delete(input.taskId);
      callback();
    };

    worker.once("message", (message: WorkflowWorkerResult) => {
      settle(() => {
        if (message.ok) {
          resolve(message.task);
          return;
        }

        const error = new Error(message.error.message);
        error.name = message.error.name || "WorkflowWorkerError";
        error.stack = message.error.stack || error.stack;
        reject(error);
      });
    });

    worker.once("error", (error) => {
      settle(() => reject(error));
    });

    worker.once("exit", (code) => {
      if (code === 0) {
        return;
      }

      settle(() => reject(new Error(`视频输出后台任务异常退出，退出码 ${code}。`)));
    });
  });
}
