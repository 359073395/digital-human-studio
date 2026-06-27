// @vitest-environment node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppPaths, getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { TaskRepository } from "../storage/taskRepository";
import { VideoDedupWorkflowService } from "./videoDedupWorkflowService";

let tempDir: string;
let appPaths: AppPaths;
let database: TaskDatabase;
let repository: TaskRepository;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-video-dedup-"));
  appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  repository = new TaskRepository(database, appPaths);
});

afterEach(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("VideoDedupWorkflowService", () => {
  it("imports a source video and renders a processed video without exposing score reports", () => {
    const sourcePath = path.join(tempDir, "source.mp4");
    createSampleVideo(sourcePath);

    const task = repository.createTask({
      title: "Dedup task",
      sourceScript: "Original source script."
    });
    repository.updateTask({
      taskId: task.id,
      generationMode: "video-dedup",
      finalScript: "New title, new subtitle spine, and a changed call to action.",
      dedupTargetScore: 95,
      dedupStrategy: "fidelity-strong",
      selectedOutputPresets: ["portrait-9-16"]
    });

    const service = new VideoDedupWorkflowService(repository, appPaths);
    const imported = service.importSourceVideo(task.id, sourcePath);

    expect(imported.dedupSourceVideoAssetId).toBeTruthy();
    expect(imported.mediaAssets.some((asset) => asset.kind === "dedup-source-video")).toBe(true);

    const completed = service.runVideoDedup(task.id);
    const taskDirectory = getTaskDirectory(appPaths, task.id);
    const processedAsset = completed.mediaAssets.find(
      (asset) => asset.kind === "dedup-processed-video"
    );

    expect(completed.steps.find((step) => step.id === "export")?.status).toBe("complete");
    expect(processedAsset).toBeTruthy();
    const processedPath = path.join(taskDirectory, processedAsset?.relativePath ?? "");
    expect(fs.existsSync(processedPath)).toBe(true);
    expect(hasAudioStream(processedPath)).toBe(true);
    expect(completed.mediaAssets.some((asset) => asset.kind === "dedup-report")).toBe(false);
    expect(
      fs.existsSync(path.join(taskDirectory, "exports", "dedup-package", "manifest.json"))
    ).toBe(true);
  });

  it("renders the deeper pixel-remix strategy for high-risk material", () => {
    const sourcePath = path.join(tempDir, "source-pixel.mp4");
    createSampleVideo(sourcePath);
    const task = repository.createTask({
      title: "Pixel remix dedup",
      sourceScript: "Original source script."
    });
    repository.updateTask({
      taskId: task.id,
      generationMode: "video-dedup",
      finalScript: "Keep the same visible story while changing the encoded video structure.",
      dedupTargetScore: 88,
      dedupStrategy: "pixel-remix",
      selectedOutputPresets: ["portrait-9-16"]
    });

    const service = new VideoDedupWorkflowService(repository, appPaths);
    service.importSourceVideo(task.id, sourcePath);
    const completed = service.runVideoDedup(task.id);
    const processedAsset = completed.mediaAssets.find(
      (asset) => asset.kind === "dedup-processed-video"
    );

    expect(completed.steps.find((step) => step.id === "export")?.status).toBe("complete");
    expect(processedAsset?.relativePath).toContain("dedup-processed");
    expect(completed.publishingPackage.description).toContain("深度像素重塑");
    expect(completed.mediaAssets.some((asset) => asset.kind === "dedup-report")).toBe(false);
  });
});

function createSampleVideo(outputPath: string): void {
  if (!ffmpegStaticPath) {
    throw new Error("ffmpeg-static is not available in tests.");
  }

  const result = spawnSync(
    ffmpegStaticPath,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x93a8a0:s=320x568:d=1.2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:duration=1.2",
      "-vf",
      "format=yuv420p",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath
    ],
    { encoding: "utf8", timeout: 30_000 }
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to create sample video.");
  }
}

function hasAudioStream(filePath: string): boolean {
  if (!ffmpegStaticPath) {
    throw new Error("ffmpeg-static is not available in tests.");
  }

  const result = spawnSync(ffmpegStaticPath, ["-hide_banner", "-i", filePath], {
    encoding: "utf8",
    timeout: 30_000
  });
  const output = `${result.stderr || ""}\n${result.stdout || ""}`;
  return /Stream\s+#\d+:\d+.*Audio:/i.test(output);
}
