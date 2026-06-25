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
      mixedCutTargetCount: 2,
      selectedOutputPresets: ["portrait-9-16", "landscape-16-9"]
    });

    const sourceDirectory = path.join(
      getTaskDirectory(appPaths, task.id),
      "source",
      "mixed-materials"
    );
    const groupedMaterials = [
      ["1", "sample-1.png"],
      ["1", "sample-2.png"],
      ["2", "sample-3.png"],
      ["3", "sample-4.png"]
    ];
    for (const [groupId, fileName] of groupedMaterials) {
      const materialPath = path.join(sourceDirectory, groupId, fileName);
      fs.mkdirSync(path.dirname(materialPath), { recursive: true });
      fs.writeFileSync(materialPath, Buffer.from(SINGLE_PIXEL_PNG_BASE64, "base64"));
      repository.addMediaAsset(
        task.id,
        "mixed-cut-material",
        `source/mixed-materials/${groupId}/${fileName}`
      );
    }

    const completed = new MixedCutWorkflowService(repository, appPaths).prepareMixedCut(task.id);
    const taskDirectory = getTaskDirectory(appPaths, task.id);

    expect(completed.steps.find((step) => step.id === "subtitles")?.status).toBe("complete");
    expect(completed.steps.find((step) => step.id === "post-production")?.status).toBe("complete");
    expect(completed.steps.find((step) => step.id === "export")?.status).toBe("complete");
    for (const presetId of ["portrait-9-16", "landscape-16-9"]) {
      const baseVideoPath = path.join(taskDirectory, "post", `mixed-cut-batch-1-${presetId}.mp4`);
      const subtitlePath = path.join(
        taskDirectory,
        "subtitles",
        `mixed-cut-batch-1-${presetId}.srt`
      );
      const editDecisionPath = path.join(
        taskDirectory,
        "post",
        `edit-decisions-mixed-cut-1-${presetId}.json`
      );
      const secondBatchVideoPath = path.join(
        taskDirectory,
        "post",
        `mixed-cut-batch-2-${presetId}.mp4`
      );
      expect(fs.existsSync(baseVideoPath)).toBe(true);
      expect(fs.statSync(baseVideoPath).size).toBeGreaterThan(1000);
      expect(fs.existsSync(secondBatchVideoPath)).toBe(true);
      expect(fs.existsSync(subtitlePath)).toBe(true);
      expect(fs.readFileSync(subtitlePath, "utf8")).toContain("-->");
      expect(fs.existsSync(editDecisionPath)).toBe(true);
      expect(fs.readFileSync(editDecisionPath, "utf8")).toContain('"segments"');
    }
  }, 20_000);

  it("extends subtitle timing for long AI scripts instead of truncating at 12 seconds", () => {
    const task = repository.createTask({
      title: "Long mixed cut",
      sourceScript: "Source script."
    });
    const longScript = Array.from(
      { length: 8 },
      (_value, index) => `第${index + 1}个卖点需要完整讲清楚`
    ).join("。");
    repository.updateTask({
      taskId: task.id,
      generationMode: "mixed-cut",
      finalScript: longScript,
      mixedCutTargetCount: 1,
      selectedOutputPresets: ["portrait-9-16"]
    });

    const materialPath = path.join(
      getTaskDirectory(appPaths, task.id),
      "source",
      "mixed-materials",
      "1",
      "long.png"
    );
    fs.mkdirSync(path.dirname(materialPath), { recursive: true });
    fs.writeFileSync(materialPath, Buffer.from(SINGLE_PIXEL_PNG_BASE64, "base64"));
    repository.addMediaAsset(task.id, "mixed-cut-material", "source/mixed-materials/1/long.png");

    new MixedCutWorkflowService(repository, appPaths).prepareMixedCut(task.id);
    const subtitlePath = path.join(
      getTaskDirectory(appPaths, task.id),
      "subtitles",
      "mixed-cut-batch-1-portrait-9-16.srt"
    );
    const subtitle = fs.readFileSync(subtitlePath, "utf8");

    expect(subtitle).toContain("-->");
    expect(subtitle).not.toContain("00:00:12,000");
  }, 25_000);

  it("uses uploaded mixed-cut audio duration as the target video duration", () => {
    const task = repository.createTask({
      title: "Audio timed mixed cut",
      sourceScript: ""
    });
    repository.updateTask({
      taskId: task.id,
      generationMode: "mixed-cut",
      finalScript: "",
      mixedCutTargetCount: 1,
      selectedOutputPresets: ["portrait-9-16"]
    });

    const taskDirectory = getTaskDirectory(appPaths, task.id);
    const audioPath = path.join(taskDirectory, "source", "mixed-audio", "voice.wav");
    fs.mkdirSync(path.dirname(audioPath), { recursive: true });
    createSilentWav(audioPath, 3);
    repository.addMediaAsset(task.id, "mixed-cut-audio", "source/mixed-audio/voice.wav");

    const sourceDirectory = path.join(taskDirectory, "source", "mixed-materials");
    for (const [groupId, fileName] of [
      ["1", "audio-a.png"],
      ["2", "audio-b.png"]
    ]) {
      const materialPath = path.join(sourceDirectory, groupId, fileName);
      fs.mkdirSync(path.dirname(materialPath), { recursive: true });
      fs.writeFileSync(materialPath, Buffer.from(SINGLE_PIXEL_PNG_BASE64, "base64"));
      repository.addMediaAsset(
        task.id,
        "mixed-cut-material",
        `source/mixed-materials/${groupId}/${fileName}`
      );
    }

    new MixedCutWorkflowService(repository, appPaths).prepareMixedCut(task.id);
    const editDecisionPath = path.join(
      taskDirectory,
      "post",
      "edit-decisions-mixed-cut-1-portrait-9-16.json"
    );
    const record = JSON.parse(fs.readFileSync(editDecisionPath, "utf8")) as {
      audioSourcePath?: string;
      targetDurationSeconds: number;
      targetDurationSource: string;
    };

    expect(record.audioSourcePath).toBe("source/mixed-audio/voice.wav");
    expect(record.targetDurationSource).toBe("audio");
    expect(record.targetDurationSeconds).toBeGreaterThanOrEqual(2.9);
    expect(record.targetDurationSeconds).toBeLessThanOrEqual(3.1);
    expect(
      fs.statSync(path.join(taskDirectory, "post", "mixed-cut-batch-1-portrait-9-16.mp4")).size
    ).toBeGreaterThan(1000);
  }, 20_000);

  it("calculates batch count from material count and reuse rate instead of manual input", () => {
    const task = repository.createTask({
      title: "Auto planned mixed cut",
      sourceScript: "Source script."
    });
    repository.updateTask({
      taskId: task.id,
      generationMode: "mixed-cut",
      finalScript: "Short script for auto batch planning.",
      mixedCutTargetCount: 30,
      mixedCutReuseRate: 0,
      selectedOutputPresets: ["portrait-9-16"]
    });

    const sourceDirectory = path.join(
      getTaskDirectory(appPaths, task.id),
      "source",
      "mixed-materials"
    );
    for (let index = 1; index <= 3; index += 1) {
      const materialPath = path.join(sourceDirectory, String(index), `limited-${index}.png`);
      fs.mkdirSync(path.dirname(materialPath), { recursive: true });
      fs.writeFileSync(materialPath, Buffer.from(SINGLE_PIXEL_PNG_BASE64, "base64"));
      repository.addMediaAsset(
        task.id,
        "mixed-cut-material",
        `source/mixed-materials/${index}/limited-${index}.png`
      );
    }

    new MixedCutWorkflowService(repository, appPaths).prepareMixedCut(task.id);
    const taskDirectory = getTaskDirectory(appPaths, task.id);

    expect(
      fs.existsSync(path.join(taskDirectory, "post", "mixed-cut-batch-1-portrait-9-16.mp4"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(taskDirectory, "post", "mixed-cut-batch-2-portrait-9-16.mp4"))
    ).toBe(false);
    const manifest = fs.readFileSync(
      path.join(taskDirectory, "exports", "mixed-cut-batch", "manifest.json"),
      "utf8"
    );
    expect(manifest).toContain('"mixedCutTargetCount": 1');
  }, 20_000);
});

function createSilentWav(outputPath: string, durationSeconds: number): void {
  const sampleRate = 8_000;
  const channelCount = 1;
  const bitsPerSample = 16;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const dataSize = sampleCount * channelCount * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channelCount * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  fs.writeFileSync(outputPath, buffer);
}

const SINGLE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
