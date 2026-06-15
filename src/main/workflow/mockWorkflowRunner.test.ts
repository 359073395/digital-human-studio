// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppPaths, getTaskDirectory } from "../storage/appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { TaskRepository } from "../storage/taskRepository";
import { MockWorkflowRunner } from "./mockWorkflowRunner";

let tempDir: string;
let database: TaskDatabase;
let repository: TaskRepository;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-workflow-"));
  const appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  repository = new TaskRepository(database, appPaths);
});

afterEach(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("MockWorkflowRunner", () => {
  it("runs the mock workflow end-to-end for portrait and landscape outputs", async () => {
    const appPaths = createAppPaths(tempDir);
    const runner = new MockWorkflowRunner(repository, appPaths);
    const task = repository.createTask({
      title: "Workflow test",
      sourceScript: "A useful source script."
    });
    repository.updateTask({
      taskId: task.id,
      selectedOutputPresets: ["portrait-9-16", "landscape-16-9"]
    });

    const completed = await runner.runTask(task.id);
    const taskDirectory = getTaskDirectory(appPaths, task.id);

    expect(completed.steps.every((step) => step.status === "complete")).toBe(true);
    expect(completed.outputVariants).toHaveLength(2);
    expect(completed.outputVariants.every((variant) => variant.status === "complete")).toBe(true);
    expect(completed.mediaAssets.some((asset) => asset.kind === "publishing-package")).toBe(true);
    expect(
      fs.existsSync(path.join(taskDirectory, "exports", "publishing-package", "manifest.json"))
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(taskDirectory, "exports", "landscape-16-9", "finished-landscape-16-9.mp4")
      )
    ).toBe(true);
  });

  it("marks a failed mock step retry-ready and succeeds on single-step retry", async () => {
    const appPaths = createAppPaths(tempDir);
    const runner = new MockWorkflowRunner(repository, appPaths, {
      failStepsOnce: ["avatar"]
    });
    const task = repository.createTask({
      title: "Retry test",
      sourceScript: "A source script."
    });

    const failed = await runner.retryStep(task.id, "avatar");

    expect(failed.steps.find((step) => step.id === "avatar")?.status).toBe("retry-ready");
    expect(failed.outputVariants[0]?.status).toBe("failed");

    const retried = await runner.retryStep(task.id, "avatar");

    expect(retried.steps.find((step) => step.id === "avatar")?.status).toBe("complete");
    expect(retried.mediaAssets.some((asset) => asset.kind === "avatar-video")).toBe(true);
  });

  it("stops the full mock workflow when a step fails", async () => {
    const appPaths = createAppPaths(tempDir);
    const runner = new MockWorkflowRunner(repository, appPaths, {
      failStepsOnce: ["avatar"]
    });
    const task = repository.createTask({
      title: "Stop on failure",
      sourceScript: "A source script."
    });

    const failed = await runner.runTask(task.id);

    expect(failed.steps.find((step) => step.id === "avatar")?.status).toBe("retry-ready");
    expect(failed.steps.find((step) => step.id === "subtitles")?.status).toBe("waiting");
    expect(failed.steps.find((step) => step.id === "export")?.status).toBe("waiting");
  });
});
