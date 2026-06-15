// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TASK_MEDIA_DIRECTORIES, createAppPaths, getTaskMediaDirectory } from "./appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "./database";
import { TaskRepository } from "./taskRepository";

let tempDir: string;
let database: TaskDatabase;
let repository: TaskRepository;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-storage-"));
  const appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  repository = new TaskRepository(database, appPaths);
});

afterEach(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("TaskRepository", () => {
  it("creates, lists, and loads a persisted video task", () => {
    const task = repository.createTask({
      title: "测试任务",
      sourceScript: "这是一段源文案。"
    });

    expect(task.title).toBe("测试任务");
    expect(task.sourceScript).toBe("这是一段源文案。");
    expect(task.selectedOutputPresets).toEqual(["portrait-9-16"]);
    expect(task.steps).toHaveLength(6);
    expect(task.outputVariants).toHaveLength(1);

    const summaries = repository.listTasks();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.title).toBe("测试任务");

    const loaded = repository.getTask(task.id);
    expect(loaded?.id).toBe(task.id);
  });

  it("creates media directories for each task", () => {
    const task = repository.createTask({ title: "目录测试" });
    const appPaths = createAppPaths(tempDir);

    for (const directory of TASK_MEDIA_DIRECTORIES) {
      expect(fs.existsSync(getTaskMediaDirectory(appPaths, task.id, directory))).toBe(true);
    }
  });

  it("persists step status updates", () => {
    const task = repository.createTask({ title: "状态测试" });

    repository.updateStepStatus(task.id, "source", "complete");
    repository.updateStepStatus(task.id, "avatar", "failed", "HeyGen 请求失败");

    const reopenedDatabase = openTaskDatabase(createAppPaths(tempDir).databasePath);
    const reopenedRepository = new TaskRepository(reopenedDatabase, createAppPaths(tempDir));
    const loaded = reopenedRepository.getTask(task.id);

    expect(loaded?.steps.find((step) => step.id === "source")?.status).toBe("complete");
    expect(loaded?.steps.find((step) => step.id === "avatar")?.status).toBe("failed");
    expect(loaded?.steps.find((step) => step.id === "avatar")?.errorMessage).toBe(
      "HeyGen 请求失败"
    );

    reopenedDatabase.close();
  });
});
