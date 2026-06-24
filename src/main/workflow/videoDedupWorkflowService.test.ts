// @vitest-environment node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OriginalityScoreReport } from "../../shared/domain";
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
  it("imports a source video, renders a processed video, and writes an originality report", () => {
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
      dedupTargetScore: 80,
      dedupStrategy: "content-rewrite",
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
    const reportAsset = completed.mediaAssets.find(
      (asset) => asset.kind === "dedup-report" && asset.relativePath.endsWith(".json")
    );

    expect(completed.steps.find((step) => step.id === "export")?.status).toBe("complete");
    expect(processedAsset).toBeTruthy();
    expect(reportAsset).toBeTruthy();
    expect(fs.existsSync(path.join(taskDirectory, processedAsset?.relativePath ?? ""))).toBe(true);

    const report = JSON.parse(
      fs.readFileSync(path.join(taskDirectory, reportAsset?.relativePath ?? ""), "utf8")
    ) as OriginalityScoreReport;
    expect(report.score).toBeGreaterThanOrEqual(80);
    expect(report.passed).toBe(true);
    expect(report.summary).toContain("内部原创度评分");
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
      "-vf",
      "format=yuv420p",
      "-c:v",
      "libx264",
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
