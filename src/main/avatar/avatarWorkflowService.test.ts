// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppPaths, getTaskDirectory } from "../storage/appPaths";
import type { AppPaths } from "../storage/appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { TaskRepository } from "../storage/taskRepository";
import type {
  SubtitleFallbackInput,
  SubtitleFallbackProvider,
  SubtitleFallbackResult
} from "../subtitles/subtitleFallbackProvider";
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
      captionUrl: `https://cdn.example.test/${input.preset.id}.srt`,
      thumbnailUrl: `https://cdn.example.test/${input.preset.id}.jpg`
    };
  }
}

class CaptionlessAvatarProvider implements AvatarProvider {
  readonly renders: AvatarRenderInput[] = [];

  async renderAvatar(input: AvatarRenderInput): Promise<AvatarRenderResult> {
    this.renders.push(input);
    return {
      presetId: input.preset.id,
      providerVideoId: `provider-${input.preset.id}`,
      videoUrl: `https://cdn.example.test/${input.preset.id}.mp4`
    };
  }
}

class FailingAvatarProvider implements AvatarProvider {
  async renderAvatar(): Promise<AvatarRenderResult> {
    throw new Error("HeyGen quota exhausted.");
  }
}

class SuccessfulSubtitleFallbackProvider implements SubtitleFallbackProvider {
  readonly inputs: SubtitleFallbackInput[] = [];

  async createSubtitleFile(input: SubtitleFallbackInput): Promise<SubtitleFallbackResult> {
    this.inputs.push(input);
    return {
      srt: `1\n00:00:00,000 --> 00:00:02,000\nASR subtitle for ${input.preset.id}`
    };
  }
}

class FailingSubtitleFallbackProvider implements SubtitleFallbackProvider {
  async createSubtitleFile(): Promise<SubtitleFallbackResult> {
    throw new Error("ASR quota exhausted.");
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
    expect(updated.steps.find((step) => step.id === "subtitles")?.status).toBe("complete");
    expect(updated.outputVariants.every((variant) => variant.status === "waiting")).toBe(true);
    expect(updated.outputVariants.every((variant) => variant.coverImagePath)).toBe(true);
    expect(updated.mediaAssets.filter((asset) => asset.kind === "avatar-video")).toHaveLength(2);
    expect(updated.mediaAssets.filter((asset) => asset.kind === "subtitle-file")).toHaveLength(2);
    expect(updated.mediaAssets.filter((asset) => asset.kind === "cover-image")).toHaveLength(2);
    expect(fs.existsSync(path.join(taskDirectory, "avatar", "avatar-portrait-9-16.mp4"))).toBe(
      true
    );
    expect(
      fs.existsSync(path.join(taskDirectory, "post", "video-frame-cover-portrait-9-16.jpg"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(taskDirectory, "subtitles", "provider-subtitles-landscape-16-9.srt"))
    ).toBe(true);
  });

  it("runs ASR fallback when HeyGen does not return provider subtitles", async () => {
    const avatarProvider = new CaptionlessAvatarProvider();
    const subtitleProvider = new SuccessfulSubtitleFallbackProvider();
    const service = new AvatarWorkflowService(
      repository,
      appPaths,
      avatarProvider,
      subtitleProvider
    );
    const task = repository.createTask({
      title: "Captionless avatar",
      sourceScript: "Source script."
    });
    repository.updateFinalScript(task.id, "Final script for fallback subtitles.");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("video-bytes"))
    );

    const updated = await service.renderHeyGenAvatar(task.id);
    const taskDirectory = getTaskDirectory(appPaths, task.id);

    expect(subtitleProvider.inputs.map((input) => input.preset.id)).toEqual(["portrait-9-16"]);
    expect(updated.steps.find((step) => step.id === "avatar")?.status).toBe("complete");
    expect(updated.steps.find((step) => step.id === "subtitles")?.status).toBe("complete");
    expect(updated.mediaAssets.filter((asset) => asset.kind === "subtitle-file")).toHaveLength(1);
    expect(
      fs.readFileSync(path.join(taskDirectory, "subtitles", "asr-subtitles-portrait-9-16.srt"), {
        encoding: "utf8"
      })
    ).toContain("ASR subtitle for portrait-9-16");
  });

  it("runs ASR fallback when provider subtitle download fails", async () => {
    const avatarProvider = new SuccessfulAvatarProvider();
    const subtitleProvider = new SuccessfulSubtitleFallbackProvider();
    const service = new AvatarWorkflowService(
      repository,
      appPaths,
      avatarProvider,
      subtitleProvider
    );
    const task = repository.createTask({
      title: "Broken provider subtitle",
      sourceScript: "Source script."
    });
    repository.updateFinalScript(task.id, "Final script for fallback subtitles.");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).endsWith(".srt")) {
          return new Response("missing", { status: 404 });
        }
        return new Response("video-bytes");
      })
    );

    const updated = await service.renderHeyGenAvatar(task.id);

    expect(subtitleProvider.inputs.map((input) => input.preset.id)).toEqual(["portrait-9-16"]);
    expect(updated.steps.find((step) => step.id === "avatar")?.status).toBe("complete");
    expect(updated.steps.find((step) => step.id === "subtitles")?.status).toBe("complete");
    expect(updated.mediaAssets.some((asset) => asset.relativePath.includes("asr-subtitles"))).toBe(
      true
    );
  });

  it("keeps avatar output complete when ASR fallback fails", async () => {
    const service = new AvatarWorkflowService(
      repository,
      appPaths,
      new CaptionlessAvatarProvider(),
      new FailingSubtitleFallbackProvider()
    );
    const task = repository.createTask({
      title: "ASR failure",
      sourceScript: "Source script."
    });
    repository.updateFinalScript(task.id, "Final script for fallback subtitles.");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("video-bytes"))
    );

    const updated = await service.renderHeyGenAvatar(task.id);

    expect(updated.steps.find((step) => step.id === "avatar")?.status).toBe("complete");
    expect(updated.steps.find((step) => step.id === "subtitles")?.status).toBe("retry-ready");
    expect(updated.steps.find((step) => step.id === "subtitles")?.errorMessage).toBe(
      "ASR quota exhausted."
    );
    expect(updated.outputVariants.every((variant) => variant.status === "waiting")).toBe(true);
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

  it("passes generated presenter images to the avatar provider in image presenter mode", async () => {
    const provider = new SuccessfulAvatarProvider();
    const service = new AvatarWorkflowService(repository, appPaths, provider);
    const task = repository.createTask({
      title: "Image presenter",
      sourceScript: "Source script."
    });
    const generatedRelativePath = "avatar/generated-presenter-portrait-9-16.png";
    const generatedAbsolutePath = path.join(
      getTaskDirectory(appPaths, task.id),
      ...generatedRelativePath.split("/")
    );
    fs.mkdirSync(path.dirname(generatedAbsolutePath), { recursive: true });
    fs.writeFileSync(generatedAbsolutePath, Buffer.from("presenter-image"));
    const withAsset = repository.addMediaAsset(
      task.id,
      "generated-presenter-image",
      generatedRelativePath
    );
    const generatedAsset = withAsset.mediaAssets.find(
      (asset) => asset.relativePath === generatedRelativePath
    );
    repository.updateTask({
      taskId: task.id,
      avatarMode: "image-presenter",
      generatedPresenterImageAssetId: generatedAsset?.id
    });
    repository.updateFinalScript(task.id, "Final script for image presenter.");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("video-bytes"))
    );

    await service.renderHeyGenAvatar(task.id);

    expect(provider.renders[0]?.imagePath).toBe(generatedAbsolutePath);
  });
});
