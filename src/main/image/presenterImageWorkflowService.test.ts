// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppPaths, getTaskDirectory } from "../storage/appPaths";
import type { AppPaths } from "../storage/appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { TaskRepository } from "../storage/taskRepository";
import type {
  ImageProvider,
  ProductPresenterImageInput,
  ProductPresenterImageResult
} from "./imageProvider";
import { PresenterImageWorkflowService } from "./presenterImageWorkflowService";

class SuccessfulImageProvider implements ImageProvider {
  readonly inputs: ProductPresenterImageInput[] = [];

  async generateProductPresenterImage(
    input: ProductPresenterImageInput
  ): Promise<ProductPresenterImageResult> {
    this.inputs.push(input);
    return {
      imageBytes: Buffer.from(`generated-${input.preset.id}`),
      extension: "png",
      promptPreview: `prompt-${input.preset.id}`
    };
  }
}

class FailingImageProvider implements ImageProvider {
  async generateProductPresenterImage(): Promise<ProductPresenterImageResult> {
    throw new Error("OpenAI image quota exhausted.");
  }
}

let tempDir: string;
let appPaths: AppPaths;
let database: TaskDatabase;
let repository: TaskRepository;
let productImagePath: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-presenter-image-"));
  appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  repository = new TaskRepository(database, appPaths);
  productImagePath = path.join(tempDir, "source-product.png");
  fs.writeFileSync(productImagePath, Buffer.from("product-image"));
});

afterEach(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("PresenterImageWorkflowService", () => {
  it("imports product images into task media", () => {
    const service = new PresenterImageWorkflowService(
      repository,
      appPaths,
      new SuccessfulImageProvider()
    );
    const task = repository.createTask({ title: "Product upload" });

    const updated = service.importProductImage(task.id, productImagePath);
    const taskDirectory = getTaskDirectory(appPaths, task.id);

    expect(updated.avatarMode).toBe("image-presenter");
    expect(updated.productImageAssetId).toBeTruthy();
    expect(updated.mediaAssets.some((asset) => asset.kind === "product-image")).toBe(true);
    expect(fs.existsSync(path.join(taskDirectory, "source", "product-image.png"))).toBe(true);
  });

  it("generates presenter images for selected output presets", async () => {
    const provider = new SuccessfulImageProvider();
    const service = new PresenterImageWorkflowService(repository, appPaths, provider);
    const task = repository.createTask({ title: "Presenter image" });
    const withProduct = service.importProductImage(task.id, productImagePath);
    repository.updateTask({
      taskId: withProduct.id,
      avatarDescriptionPrompt: "年轻印尼女主播，手拿商品。",
      motionPrompt: "轻微点头。",
      selectedOutputPresets: ["portrait-9-16", "landscape-16-9"]
    });

    const updated = await service.generatePresenterImages(task.id);
    const taskDirectory = getTaskDirectory(appPaths, task.id);

    expect(provider.inputs.map((input) => input.preset.id)).toEqual([
      "portrait-9-16",
      "landscape-16-9"
    ]);
    expect(updated.steps.find((step) => step.id === "avatar")?.status).toBe("waiting");
    expect(updated.generatedPresenterImageAssetId).toBeTruthy();
    expect(
      updated.mediaAssets.filter((asset) => asset.kind === "generated-presenter-image")
    ).toHaveLength(2);
    expect(
      fs.existsSync(path.join(taskDirectory, "avatar", "generated-presenter-portrait-9-16.png"))
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(taskDirectory, "avatar", "generated-presenter-landscape-16-9-prompt.txt")
      )
    ).toBe(true);
  });

  it("marks avatar step retry-ready when presenter image generation fails", async () => {
    const service = new PresenterImageWorkflowService(
      repository,
      appPaths,
      new FailingImageProvider()
    );
    const task = repository.createTask({ title: "Presenter failure" });
    const withProduct = service.importProductImage(task.id, productImagePath);
    repository.updateTask({
      taskId: withProduct.id,
      avatarDescriptionPrompt: "年轻印尼女主播。"
    });

    const updated = await service.generatePresenterImages(task.id);
    const avatarStep = updated.steps.find((step) => step.id === "avatar");

    expect(avatarStep?.status).toBe("retry-ready");
    expect(avatarStep?.errorMessage).toBe("OpenAI image quota exhausted.");
  });
});
