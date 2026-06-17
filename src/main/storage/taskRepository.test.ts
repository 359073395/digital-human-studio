// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TASK_MEDIA_DIRECTORIES,
  createAppPaths,
  getTaskDirectory,
  getTaskMediaDirectory
} from "./appPaths";
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
    expect(task.similarityRisk).toBe("unknown");
    expect(task.scriptGenerationNotes).toBe("");
    expect(task.avatarMode).toBe("preset-avatar");
    expect(task.avatarDescriptionPrompt).toBe("");
    expect(task.motionPrompt).toBe("");
    expect(task.exportDirectory).toBe("");
    expect(task.steps).toHaveLength(6);
    expect(task.outputVariants).toHaveLength(1);

    const summaries = repository.listTasks();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.title).toBe("测试任务");
    expect(summaries[0]?.generationMode).toBe("preset-avatar");

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

  it("deletes a task and its media directory", () => {
    const task = repository.createTask({ title: "删除测试" });
    const appPaths = createAppPaths(tempDir);
    const taskDirectory = getTaskDirectory(appPaths, task.id);
    const markerPath = path.join(taskDirectory, "source", "marker.txt");
    fs.writeFileSync(markerPath, "delete me");

    repository.deleteTask(task.id);

    expect(repository.getTask(task.id)).toBeNull();
    expect(repository.listTasks()).toHaveLength(0);
    expect(fs.existsSync(taskDirectory)).toBe(false);
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

  it("updates task settings and keeps output variants in sync", () => {
    const task = repository.createTask({ title: "Preset test" });

    const withLandscape = repository.updateTask({
      taskId: task.id,
      contentLanguage: "id-ID",
      avatarMode: "image-presenter",
      avatarDescriptionPrompt: "年轻印尼女主播，手拿商品。",
      motionPrompt: "轻微点头，手拿商品靠近镜头。",
      selectedOutputPresets: ["portrait-9-16", "landscape-16-9"],
      sourceScript: "Updated source"
    });

    expect(withLandscape.contentLanguage).toBe("id-ID");
    expect(withLandscape.avatarMode).toBe("image-presenter");
    expect(withLandscape.avatarDescriptionPrompt).toBe("年轻印尼女主播，手拿商品。");
    expect(withLandscape.motionPrompt).toBe("轻微点头，手拿商品靠近镜头。");
    expect(withLandscape.sourceScript).toBe("Updated source");
    expect(withLandscape.outputVariants.map((variant) => variant.presetId)).toEqual([
      "portrait-9-16",
      "landscape-16-9"
    ]);

    const portraitOnly = repository.updateTask({
      taskId: task.id,
      selectedOutputPresets: ["portrait-9-16"]
    });

    expect(portraitOnly.outputVariants.map((variant) => variant.presetId)).toEqual([
      "portrait-9-16"
    ]);
  });

  it("persists editable copy, avatar selection, source link, and preview style settings", () => {
    const task = repository.createTask({ title: "Editable settings test" });

    const updated = repository.updateTask({
      taskId: task.id,
      originalVideoUrl: "https://example.com/video/123",
      exportDirectory: path.join(tempDir, "exports"),
      finalScript: "Final edited copy with corrected price.",
      presetAvatarId: "avatar-custom-123",
      customFontFamily: "DHS Custom Font",
      subtitleStyle: {
        ...task.subtitleStyle,
        fontFamily: "DHS Custom Font",
        verticalPercent: 64
      },
      frameTitleStyle: {
        ...task.frameTitleStyle,
        text: "画面标题",
        verticalPercent: 22,
        fontFamily: "DHS Custom Font"
      },
      coverStyle: {
        ...task.coverStyle,
        fontFamily: "DHS Custom Font",
        verticalPercent: 48
      }
    });

    expect(updated.originalVideoUrl).toBe("https://example.com/video/123");
    expect(updated.exportDirectory).toBe(path.join(tempDir, "exports"));
    expect(updated.finalScript).toBe("Final edited copy with corrected price.");
    expect(updated.presetAvatarId).toBe("avatar-custom-123");
    expect(updated.customFontFamily).toBe("DHS Custom Font");
    expect(updated.subtitleStyle.verticalPercent).toBe(64);
    expect(updated.subtitleStyle.fontFamily).toBe("DHS Custom Font");
    expect(updated.frameTitleStyle.text).toBe("画面标题");
    expect(updated.frameTitleStyle.verticalPercent).toBe(22);
    expect(updated.frameTitleStyle.fontFamily).toBe("DHS Custom Font");
    expect(updated.coverStyle.fontFamily).toBe("DHS Custom Font");
    expect(updated.coverStyle.verticalPercent).toBe(48);
  });

  it("persists media assets, output metadata, and publishing package", () => {
    const task = repository.createTask({ title: "Artifact test" });

    repository.addMediaAsset(task.id, "finished-video", "exports/portrait-9-16/mock.mp4");
    repository.addMediaAsset(task.id, "finished-video", "exports/portrait-9-16/mock.mp4");
    repository.updateOutputVariant(task.id, "portrait-9-16", {
      status: "complete",
      finishedVideoPath: "exports/portrait-9-16/mock.mp4"
    });
    const updated = repository.updatePublishingPackage(task.id, {
      title: "Ready to publish",
      description: "Mock package",
      tags: ["mock"],
      notes: "Generated by tests",
      exportDirectory: "exports/publishing-package"
    });

    expect(updated.mediaAssets).toHaveLength(1);
    expect(updated.outputVariants[0]?.status).toBe("complete");
    expect(updated.outputVariants[0]?.finishedVideoPath).toBe("exports/portrait-9-16/mock.mp4");
    expect(updated.publishingPackage.exportDirectory).toBe("exports/publishing-package");
  });

  it("persists generated script metadata", () => {
    const task = repository.createTask({ title: "Script metadata test" });

    const updated = repository.updateScriptGeneration(task.id, {
      finalScript: "Generated original script",
      similarityRisk: "low",
      scriptGenerationNotes: "Mock notes"
    });

    expect(updated.finalScript).toBe("Generated original script");
    expect(updated.similarityRisk).toBe("low");
    expect(updated.scriptGenerationNotes).toBe("Mock notes");
  });
});
