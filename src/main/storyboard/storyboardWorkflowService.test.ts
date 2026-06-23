// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  StoryScriptPackage,
  VisualStoryboardPackage,
  VisualStoryboardPanelCount
} from "../../shared/domain";
import type {
  ImageProvider,
  ProductPresenterImageResult,
  VisualStoryboardImageInput,
  VisualStoryboardImageResult
} from "../image/imageProvider";
import { createAppPaths, getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { TaskRepository } from "../storage/taskRepository";
import type {
  StoryboardProvider,
  StoryScriptGenerationInput,
  StoryScriptGenerationResult,
  VisualStoryboardGenerationInput,
  VisualStoryboardGenerationResult
} from "./storyboardProvider";
import { StoryboardWorkflowService } from "./storyboardWorkflowService";

class SuccessfulStoryboardProvider implements StoryboardProvider {
  readonly scriptInputs: StoryScriptGenerationInput[] = [];
  readonly storyboardInputs: VisualStoryboardGenerationInput[] = [];

  async generateStoryScriptOptions(
    input: StoryScriptGenerationInput
  ): Promise<StoryScriptGenerationResult> {
    this.scriptInputs.push(input);
    return {
      promptPreview: "story script prompt preview",
      scriptPackage: createStoryScriptPackage()
    };
  }

  async generateVisualStoryboard(
    input: VisualStoryboardGenerationInput
  ): Promise<VisualStoryboardGenerationResult> {
    this.storyboardInputs.push(input);
    return {
      promptPreview: "storyboard prompt preview",
      storyboard: createStoryboard(input.panelCount)
    };
  }
}

class SuccessfulImageProvider implements ImageProvider {
  readonly storyboardInputs: VisualStoryboardImageInput[] = [];

  async generateProductPresenterImage(): Promise<ProductPresenterImageResult> {
    throw new Error("unused");
  }

  async generateVisualStoryboardImage(
    input: VisualStoryboardImageInput
  ): Promise<VisualStoryboardImageResult> {
    this.storyboardInputs.push(input);
    return {
      imageBytes: Buffer.from("visual-storyboard-image"),
      extension: "png",
      promptPreview: input.prompt
    };
  }
}

let tempDir: string;
let appPaths: AppPaths;
let database: TaskDatabase;
let repository: TaskRepository;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-storyboard-"));
  appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  repository = new TaskRepository(database, appPaths);
});

afterEach(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("StoryboardWorkflowService", () => {
  it("generates drama-commerce script options and stores the recommended script", async () => {
    const storyboardProvider = new SuccessfulStoryboardProvider();
    const imageProvider = new SuccessfulImageProvider();
    const service = new StoryboardWorkflowService(
      repository,
      appPaths,
      storyboardProvider,
      imageProvider
    );
    const task = repository.createTask({
      title: "Story scripts",
      sourceScript: "A reference commerce story."
    });
    repository.updateTask({
      taskId: task.id,
      generationMode: "viral-remix",
      originalVideoUrl: "https://example.com/video"
    });

    const updated = await service.generateStoryScriptOptions(task.id);
    const taskDirectory = getTaskDirectory(appPaths, task.id);

    expect(storyboardProvider.scriptInputs[0]?.sourceBrief).toContain("A reference commerce story");
    expect(updated.finalScript).toBe("Recommended editable story script.");
    expect(updated.creativeWorkflow.sellingPoints).toContain("pain points");
    expect(
      updated.mediaAssets
        .filter((asset) => asset.kind === "story-script-options")
        .map((asset) => asset.relativePath)
    ).toEqual(
      expect.arrayContaining([
        "storyboard/story-script-options.json",
        "storyboard/story-script-options.md"
      ])
    );
    expect(fs.existsSync(path.join(taskDirectory, "storyboard", "story-script-options.json"))).toBe(
      true
    );
  });

  it("generates storyboard prompts and a visual board image as task assets", async () => {
    const storyboardProvider = new SuccessfulStoryboardProvider();
    const imageProvider = new SuccessfulImageProvider();
    const service = new StoryboardWorkflowService(
      repository,
      appPaths,
      storyboardProvider,
      imageProvider
    );
    const task = repository.createTask({
      title: "Viral storyboard",
      sourceScript: "A reference script with hook and proof."
    });
    repository.updateTask({
      taskId: task.id,
      generationMode: "viral-remix",
      originalVideoUrl: "https://example.com/video",
      finalScript: "Confirmed editable script."
    });

    const updated = await service.generateVisualStoryboard(task.id, 8);
    const taskDirectory = getTaskDirectory(appPaths, task.id);

    expect(storyboardProvider.storyboardInputs[0]?.panelCount).toBe(8);
    expect(storyboardProvider.storyboardInputs[0]?.sourceBrief).toContain(
      "Confirmed editable script"
    );
    expect(imageProvider.storyboardInputs[0]?.prompt).toContain("one visual storyboard");
    expect(updated.steps.find((step) => step.id === "script")?.status).toBe("complete");
    expect(
      updated.mediaAssets
        .filter((asset) => asset.kind === "visual-storyboard")
        .map((asset) => asset.relativePath)
    ).toEqual(
      expect.arrayContaining([
        "storyboard/visual-storyboard.json",
        "storyboard/visual-storyboard.md",
        "storyboard/visual-storyboard.png"
      ])
    );
    expect(fs.existsSync(path.join(taskDirectory, "storyboard", "visual-storyboard.json"))).toBe(
      true
    );
    expect(
      fs.readFileSync(path.join(taskDirectory, "storyboard", "visual-storyboard.md"), "utf8")
    ).toContain("## 分镜提示词");
  });
});

function createStoryScriptPackage(): StoryScriptPackage {
  return {
    title: "剧情脚本方案",
    productAnalysis: "Product, audience, pain points and proof opportunities.",
    referenceMechanics: "Reference uses hook, conflict, proof and CTA.",
    conversionStrategy: "Open with conflict, prove value, end with action.",
    recommendedOptionId: "A",
    originalityNotes: "Uses mechanics only and replaces expression.",
    options: [
      {
        id: "A",
        title: "痛点剧情版",
        angle: "Pain to product proof.",
        targetAudience: "People with the target pain.",
        hook: "First five seconds hook.",
        beatSheet: ["0-3s hook", "3-8s pain", "8-18s proof", "18-28s CTA"],
        script: "Recommended editable story script.",
        reason: "Best fit for storyboard generation.",
        riskNotes: "Verify price and claims."
      }
    ]
  };
}

function createStoryboard(panelCount: VisualStoryboardPanelCount): VisualStoryboardPackage {
  const count = panelCount === "auto" ? 8 : panelCount;
  return {
    title: "视觉故事板",
    sourceSummary: "参考视频用钩子和证明吸引用户。",
    remakeStrategy: "保留节奏和证明方式，替换表达。",
    productAnalysis: "Product, audience, pain points and proof.",
    referenceMechanics: "Hook, conflict, proof and CTA.",
    selectedScript: "Recommended editable story script.",
    panelCount: count,
    layout: count === 8 ? "2x4 visual storyboard" : "flex storyboard",
    visualBible: {
      protagonist: "同一个创作者",
      product: "同一个商品",
      wardrobe: "白色衬衫",
      location: "明亮室内",
      lighting: "柔和商业光",
      colorPalette: "白色和绿色",
      cameraStyle: "短视频近景",
      subtitleSafeSpace: "底部留白",
      consistencyLocks: ["same face", "same product"]
    },
    shots: [
      {
        shotNumber: 1,
        durationSeconds: 3,
        shotType: "first frame",
        visualAction: "主角展示商品。",
        subjectAction: "看向镜头。",
        productAction: "商品靠近镜头。",
        voiceoverOrText: "开头钩子。",
        cameraMovement: "push in",
        imagePrompt: "Panel 1 prompt",
        videoMotionPrompt: "small push in",
        negativePrompt: "avoid distortion",
        continuityNotes: "same product"
      }
    ],
    boardImagePrompt: "Create one visual storyboard with consistent panels.",
    wholeVideoPrompt: "Generate a consistent short video."
  };
}
