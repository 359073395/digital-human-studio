// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppPaths, getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { TaskRepository } from "../storage/taskRepository";
import { ExportWorkflowService } from "./exportWorkflowService";

let tempDir: string;
let appPaths: AppPaths;
let database: TaskDatabase;
let repository: TaskRepository;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-export-"));
  appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  repository = new TaskRepository(database, appPaths);
});

afterEach(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("ExportWorkflowService", () => {
  it("copies real avatar videos into final exports", () => {
    const service = new ExportWorkflowService(repository, appPaths);
    const task = repository.createTask({
      title: "Real export",
      sourceScript: "Source script."
    });
    repository.updateFinalScript(task.id, "Final script.");
    const avatarPath = path.join(
      getTaskDirectory(appPaths, task.id),
      "avatar",
      "avatar-portrait-9-16.mp4"
    );
    fs.mkdirSync(path.dirname(avatarPath), { recursive: true });
    fs.writeFileSync(avatarPath, Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]));
    repository.addMediaAsset(task.id, "avatar-video", "avatar/avatar-portrait-9-16.mp4");

    const exported = service.exportTask(task.id);
    const finalPath = path.join(
      getTaskDirectory(appPaths, task.id),
      "exports",
      "portrait-9-16",
      "finished-portrait-9-16.mp4"
    );

    expect(exported.steps.find((step) => step.id === "export")?.status).toBe("complete");
    expect(exported.outputVariants[0]?.finishedVideoPath).toBe(
      "exports/portrait-9-16/finished-portrait-9-16.mp4"
    );
    expect(fs.readFileSync(finalPath)).toEqual(fs.readFileSync(avatarPath));
  });

  it("rejects mock placeholder avatar files", () => {
    const service = new ExportWorkflowService(repository, appPaths);
    const task = repository.createTask({
      title: "Mock export",
      sourceScript: "Source script."
    });
    const avatarPath = path.join(
      getTaskDirectory(appPaths, task.id),
      "avatar",
      "avatar-portrait-9-16.mp4"
    );
    fs.mkdirSync(path.dirname(avatarPath), { recursive: true });
    fs.writeFileSync(avatarPath, "Digital Human Studio mock avatar video");
    repository.addMediaAsset(task.id, "avatar-video", "avatar/avatar-portrait-9-16.mp4");

    const exported = service.exportTask(task.id);

    expect(exported.steps.find((step) => step.id === "export")?.status).toBe("retry-ready");
    expect(exported.steps.find((step) => step.id === "export")?.errorMessage).toContain(
      "Mock 占位文件"
    );
    expect(exported.outputVariants[0]?.status).toBe("failed");
  });
});
