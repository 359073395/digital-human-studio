// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppPaths, getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { TaskRepository } from "../storage/taskRepository";
import { ExportWorkflowService } from "./exportWorkflowService";
import { CopyFinishedVideoRenderer } from "./finishedVideoRenderer";

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
    const service = new ExportWorkflowService(
      repository,
      appPaths,
      new CopyFinishedVideoRenderer()
    );
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
    const frameCoverPath = path.join(
      getTaskDirectory(appPaths, task.id),
      "post",
      "video-frame-cover-portrait-9-16.jpg"
    );
    fs.mkdirSync(path.dirname(frameCoverPath), { recursive: true });
    fs.writeFileSync(frameCoverPath, Buffer.from("first-frame-cover"));
    repository.addMediaAsset(task.id, "cover-image", "post/video-frame-cover-portrait-9-16.jpg");
    const subtitlePath = path.join(
      getTaskDirectory(appPaths, task.id),
      "subtitles",
      "provider-subtitles-portrait-9-16.srt"
    );
    fs.mkdirSync(path.dirname(subtitlePath), { recursive: true });
    fs.writeFileSync(subtitlePath, "1\n00:00:00,000 --> 00:00:01,000\nFinal script.");
    repository.addMediaAsset(
      task.id,
      "subtitle-file",
      "subtitles/provider-subtitles-portrait-9-16.srt"
    );

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
    expect(exported.outputVariants[0]?.coverImagePath).toBe("post/cover-portrait-9-16.svg");
    expect(fs.readFileSync(finalPath)).toEqual(fs.readFileSync(avatarPath));
    expect(
      fs.readFileSync(
        path.join(getTaskDirectory(appPaths, task.id), "post", "cover-portrait-9-16.svg"),
        {
          encoding: "utf8"
        }
      )
    ).toContain("data:image/jpeg;base64");
  });

  it("copies final outputs into the selected export directory", () => {
    const service = new ExportWorkflowService(
      repository,
      appPaths,
      new CopyFinishedVideoRenderer()
    );
    const selectedExportDirectory = path.join(tempDir, "selected-exports");
    const task = repository.createTask({
      title: "External Export Test",
      sourceScript: "Source script."
    });
    repository.updateTask({
      taskId: task.id,
      exportDirectory: selectedExportDirectory
    });
    repository.updateFinalScript(task.id, "Final script.");
    const taskDirectory = getTaskDirectory(appPaths, task.id);
    const avatarPath = path.join(taskDirectory, "avatar", "avatar-portrait-9-16.mp4");
    fs.mkdirSync(path.dirname(avatarPath), { recursive: true });
    fs.writeFileSync(avatarPath, Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]));
    repository.addMediaAsset(task.id, "avatar-video", "avatar/avatar-portrait-9-16.mp4");

    const subtitlePath = path.join(
      taskDirectory,
      "subtitles",
      "provider-subtitles-portrait-9-16.srt"
    );
    fs.mkdirSync(path.dirname(subtitlePath), { recursive: true });
    fs.writeFileSync(subtitlePath, "1\n00:00:00,000 --> 00:00:01,000\nFinal script.");
    repository.addMediaAsset(
      task.id,
      "subtitle-file",
      "subtitles/provider-subtitles-portrait-9-16.srt"
    );

    const exported = service.exportTask(task.id);
    const externalDirectory = exported.publishingPackage.exportDirectory;

    expect(externalDirectory).toBeDefined();
    expect(externalDirectory?.startsWith(selectedExportDirectory)).toBe(true);
    expect(
      fs.existsSync(path.join(externalDirectory ?? "", "videos", "finished-portrait-9-16.mp4"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(externalDirectory ?? "", "covers", "cover-portrait-9-16.svg"))
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(externalDirectory ?? "", "subtitles", "provider-subtitles-portrait-9-16.srt")
      )
    ).toBe(true);
    expect(fs.existsSync(path.join(externalDirectory ?? "", "manifest.json"))).toBe(true);
  });

  it("uses the configured generated video directory when a task has no export directory", () => {
    const generatedVideoDirectory = path.join(tempDir, "global-video-exports");
    const service = new ExportWorkflowService(
      repository,
      appPaths,
      new CopyFinishedVideoRenderer(),
      {
        getPathSettings: () => ({
          sourceDownloadDirectory: "",
          generatedImageDirectory: "",
          generatedVideoDirectory
        })
      }
    );
    const task = repository.createTask({
      title: "Global Export Test",
      sourceScript: "Source script."
    });
    repository.updateFinalScript(task.id, "Final script.");
    const taskDirectory = getTaskDirectory(appPaths, task.id);
    const avatarPath = path.join(taskDirectory, "avatar", "avatar-portrait-9-16.mp4");
    fs.mkdirSync(path.dirname(avatarPath), { recursive: true });
    fs.writeFileSync(avatarPath, Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]));
    repository.addMediaAsset(task.id, "avatar-video", "avatar/avatar-portrait-9-16.mp4");

    const subtitlePath = path.join(
      taskDirectory,
      "subtitles",
      "provider-subtitles-portrait-9-16.srt"
    );
    fs.mkdirSync(path.dirname(subtitlePath), { recursive: true });
    fs.writeFileSync(subtitlePath, "1\n00:00:00,000 --> 00:00:01,000\nFinal script.");
    repository.addMediaAsset(
      task.id,
      "subtitle-file",
      "subtitles/provider-subtitles-portrait-9-16.srt"
    );

    const exported = service.exportTask(task.id);
    const externalDirectory = exported.publishingPackage.exportDirectory;

    expect(externalDirectory?.startsWith(generatedVideoDirectory)).toBe(true);
    expect(
      fs.existsSync(path.join(externalDirectory ?? "", "videos", "finished-portrait-9-16.mp4"))
    ).toBe(true);
    expect(fs.existsSync(path.join(externalDirectory ?? "", "manifest.json"))).toBe(true);
  });

  it("rejects mock placeholder avatar files", () => {
    const service = new ExportWorkflowService(
      repository,
      appPaths,
      new CopyFinishedVideoRenderer()
    );
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
