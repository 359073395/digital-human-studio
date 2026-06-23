// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppPaths, getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { TaskRepository } from "../storage/taskRepository";
import { MixedCutWorkflowService } from "./mixedCutWorkflowService";

let tempDir: string;
let appPaths: AppPaths;
let database: TaskDatabase;
let repository: TaskRepository;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-mixed-cut-"));
  appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  repository = new TaskRepository(database, appPaths);
});

afterEach(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("MixedCutWorkflowService", () => {
  it("creates mixed-cut base videos and timed subtitles from uploaded material", () => {
    const task = repository.createTask({
      title: "Mixed cut",
      sourceScript: "Source script."
    });
    repository.updateTask({
      taskId: task.id,
      generationMode: "mixed-cut",
      finalScript: "First proof point. Second proof point. Final call to action.",
      selectedOutputPresets: ["portrait-9-16", "landscape-16-9"]
    });

    const materialPath = path.join(getTaskDirectory(appPaths, task.id), "source", "sample.png");
    fs.mkdirSync(path.dirname(materialPath), { recursive: true });
    fs.writeFileSync(materialPath, Buffer.from(SINGLE_PIXEL_PNG_BASE64, "base64"));
    repository.addMediaAsset(task.id, "mixed-cut-material", "source/sample.png");

    const completed = new MixedCutWorkflowService(repository, appPaths).prepareMixedCut(task.id);
    const taskDirectory = getTaskDirectory(appPaths, task.id);

    expect(completed.steps.find((step) => step.id === "subtitles")?.status).toBe("complete");
    expect(completed.steps.find((step) => step.id === "post-production")?.status).toBe("waiting");
    for (const presetId of ["portrait-9-16", "landscape-16-9"]) {
      const baseVideoPath = path.join(taskDirectory, "post", `mixed-cut-base-${presetId}.mp4`);
      const subtitlePath = path.join(
        taskDirectory,
        "subtitles",
        `mixed-cut-subtitles-${presetId}.srt`
      );
      expect(fs.existsSync(baseVideoPath)).toBe(true);
      expect(fs.statSync(baseVideoPath).size).toBeGreaterThan(1000);
      expect(fs.existsSync(subtitlePath)).toBe(true);
      expect(fs.readFileSync(subtitlePath, "utf8")).toContain("-->");
    }
  });
});

const SINGLE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
