// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppPaths, getTaskDirectory } from "../storage/appPaths";
import type { AppPaths } from "../storage/appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { TaskRepository } from "../storage/taskRepository";
import type { AvatarProvider, AvatarRenderInput, AvatarRenderResult } from "./avatarProvider";
import { AvatarWorkflowService } from "./avatarWorkflowService";

class SuccessfulAvatarProvider implements AvatarProvider {
  readonly renders: AvatarRenderInput[] = [];

  async renderAvatar(input: AvatarRenderInput): Promise<AvatarRenderResult> {
    this.renders.push(input);
    return {
      presetId: input.preset.id,
      providerVideoId: `provider-${input.preset.id}`,
      videoUrl: `https://cdn.example.test/${input.preset.id}.mp4`,
      captionUrl: `https://cdn.example.test/${input.preset.id}.srt`
    };
  }
}

class FailingAvatarProvider implements AvatarProvider {
  async renderAvatar(): Promise<AvatarRenderResult> {
    throw new Error("HeyGen quota exhausted.");
  }
}

let tempDir: string;
let appPaths: AppPaths;
let database: TaskDatabase;
let repository: TaskRepository;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-avatar-"));
  appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  repository = new TaskRepository(database, appPaths);
});

afterEach(() => {
  vi.unstubAllGlobals();
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("AvatarWorkflowService", () => {
  it("renders selected presets and stores avatar videos plus provider subtitles", async () => {
    const provider = new SuccessfulAvatarProvider();
    const service = new AvatarWorkflowService(repository, appPaths, provider);
    const task = repository.createTask({
      title: "Avatar workflow",
      sourceScript: "Source script."
    });
    repository.updateTask({
      taskId: task.id,
      selectedOutputPresets: ["portrait-9-16", "landscape-16-9"]
    });
    repository.updateFinalScript(task.id, "Final script for real avatar.");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        return new Response(String(url).endsWith(".srt") ? "1\ncaption" : "video-bytes");
      })
    );

    const updated = await service.renderHeyGenAvatar(task.id);
    const taskDirectory = getTaskDirectory(appPaths, task.id);

    expect(provider.renders.map((render) => render.preset.id)).toEqual([
      "portrait-9-16",
      "landscape-16-9"
    ]);
    expect(updated.steps.find((step) => step.id === "avatar")?.status).toBe("complete");
    expect(updated.outputVariants.every((variant) => variant.status === "waiting")).toBe(true);
    expect(updated.mediaAssets.filter((asset) => asset.kind === "avatar-video")).toHaveLength(2);
    expect(updated.mediaAssets.filter((asset) => asset.kind === "subtitle-file")).toHaveLength(2);
    expect(fs.existsSync(path.join(taskDirectory, "avatar", "avatar-portrait-9-16.mp4"))).toBe(
      true
    );
    expect(
      fs.existsSync(path.join(taskDirectory, "subtitles", "provider-subtitles-landscape-16-9.srt"))
    ).toBe(true);
  });

  it("marks avatar step retry-ready and selected variants failed on provider errors", async () => {
    const service = new AvatarWorkflowService(repository, appPaths, new FailingAvatarProvider());
    const task = repository.createTask({
      title: "Avatar failure",
      sourceScript: "Source script."
    });

    const updated = await service.renderHeyGenAvatar(task.id);
    const avatarStep = updated.steps.find((step) => step.id === "avatar");

    expect(avatarStep?.status).toBe("retry-ready");
    expect(avatarStep?.errorMessage).toBe("HeyGen quota exhausted.");
    expect(updated.outputVariants.every((variant) => variant.status === "failed")).toBe(true);
  });
});
