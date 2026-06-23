// @vitest-environment node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OUTPUT_PRESETS } from "../../shared/domain";
import { createAppPaths, getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { TaskRepository } from "../storage/taskRepository";
import { FfmpegFinishedVideoRenderer } from "./finishedVideoRenderer";

let tempDir: string;
let appPaths: AppPaths;
let database: TaskDatabase;
let repository: TaskRepository;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-renderer-"));
  appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  repository = new TaskRepository(database, appPaths);
});

afterEach(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("FfmpegFinishedVideoRenderer", () => {
  it("renders a final MP4 with subtitle and frame title overlay instructions", () => {
    const ffmpegPath = requireFfmpegPath();
    const task = repository.createTask({
      title: "Overlay render",
      sourceScript: "Source script."
    });
    const updatedTask = repository.updateTask({
      taskId: task.id,
      finalScript: "Final script.",
      frameTitleStyle: {
        ...task.frameTitleStyle,
        enabled: true,
        text: "Frame Title",
        verticalPercent: 20
      },
      subtitleStyle: {
        ...task.subtitleStyle,
        enabled: true,
        verticalPercent: 80
      }
    });
    const taskDirectory = getTaskDirectory(appPaths, task.id);
    const sourceVideoPath = path.join(taskDirectory, "avatar", "source.mp4");
    const subtitlePath = path.join(taskDirectory, "subtitles", "subtitles.srt");
    const outputPath = path.join(taskDirectory, "exports", "portrait-9-16", "finished.mp4");

    fs.mkdirSync(path.dirname(sourceVideoPath), { recursive: true });
    fs.mkdirSync(path.dirname(subtitlePath), { recursive: true });
    createTinySourceVideo(ffmpegPath, sourceVideoPath);
    fs.writeFileSync(subtitlePath, "1\n00:00:00,000 --> 00:00:01,000\nCaption text.", "utf8");

    new FfmpegFinishedVideoRenderer().render({
      task: updatedTask,
      preset: requirePreset("portrait-9-16"),
      taskDirectory,
      sourceVideoPath,
      subtitlePath,
      outputPath
    });

    const overlayPath = path.join(taskDirectory, "post", "overlay-portrait-9-16.ass");

    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(1000);
    expect(fs.readFileSync(outputPath).subarray(4, 8).toString("utf8")).toBe("ftyp");
    expect(fs.readFileSync(overlayPath, "utf8")).toContain("Frame Title");
    expect(fs.readFileSync(overlayPath, "utf8")).toContain("Caption text.");
    expect(fs.readFileSync(overlayPath, "utf8")).toContain("\\pos(");
  });
});

function createTinySourceVideo(ffmpegPath: string, outputPath: string): void {
  const result = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=320x180:d=1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      outputPath
    ],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }
  );

  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || "Unable to create test video.");
  }
}

function requirePreset(presetId: "portrait-9-16" | "landscape-16-9") {
  const preset = OUTPUT_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) {
    throw new Error(`Unknown preset: ${presetId}`);
  }
  return preset;
}

function requireFfmpegPath(): string {
  if (!ffmpegStaticPath) {
    throw new Error("ffmpeg-static did not provide a binary path.");
  }
  return ffmpegStaticPath;
}
