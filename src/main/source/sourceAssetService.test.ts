// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppPaths, getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { TaskRepository } from "../storage/taskRepository";
import { SourceAssetService } from "./sourceAssetService";

let tempDir: string;
let appPaths: AppPaths;
let database: TaskDatabase;
let repository: TaskRepository;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-source-assets-"));
  appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  repository = new TaskRepository(database, appPaths);
});

afterEach(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("SourceAssetService", () => {
  it("downloads direct media URLs into source assets", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(new Uint8Array([0, 1, 2, 3]), {
        headers: { "content-type": "video/mp4" },
        status: 200
      });
    const service = new SourceAssetService(repository, appPaths, fetchImpl);
    const task = repository.createTask({ title: "Direct source" });
    repository.updateTask({
      taskId: task.id,
      originalVideoUrl: "https://cdn.example.com/reference"
    });

    const updated = await service.downloadOriginalVideo(task.id);
    const asset = updated.mediaAssets.find((mediaAsset) => mediaAsset.kind === "source-video");

    expect(updated.steps.find((step) => step.id === "source")?.status).toBe("complete");
    expect(asset?.relativePath).toMatch(/^source\/original-video-\d+\.mp4$/);
    expect(
      fs.readFileSync(
        path.join(getTaskDirectory(appPaths, task.id), ...(asset?.relativePath ?? "").split("/"))
      )
    ).toEqual(Buffer.from([0, 1, 2, 3]));
  });

  it("rejects non-media platform pages instead of pretending the download worked", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("<html>login required</html>", {
        headers: { "content-type": "text/html" },
        status: 200
      });
    const service = new SourceAssetService(repository, appPaths, fetchImpl);
    const task = repository.createTask({ title: "Platform link" });
    repository.updateTask({
      taskId: task.id,
      originalVideoUrl: "https://v.douyin.com/example/"
    });

    await expect(service.downloadOriginalVideo(task.id)).rejects.toThrow("手动下载原视频");

    const failed = repository.getTask(task.id);
    expect(failed?.mediaAssets).toHaveLength(0);
    expect(failed?.steps.find((step) => step.id === "source")?.status).toBe("retry-ready");
    expect(failed?.steps.find((step) => step.id === "source")?.errorMessage).toContain(
      "上传原视频"
    );
  });

  it("imports multiple mixed-cut materials without overwriting same-millisecond names", () => {
    const service = new SourceAssetService(repository, appPaths);
    const task = repository.createTask({ title: "Mixed cut" });
    const videoPath = path.join(tempDir, "material.mp4");
    const imagePath = path.join(tempDir, "material.jpg");
    fs.writeFileSync(videoPath, Buffer.from("video"));
    fs.writeFileSync(imagePath, Buffer.from("image"));

    const updated = service.importMixedCutMaterials(task.id, [videoPath, imagePath]);
    const assets = updated.mediaAssets.filter((asset) => asset.kind === "mixed-cut-material");

    expect(updated.steps.find((step) => step.id === "source")?.status).toBe("complete");
    expect(assets).toHaveLength(2);
    expect(new Set(assets.map((asset) => asset.relativePath)).size).toBe(2);
    for (const asset of assets) {
      expect(
        fs.existsSync(
          path.join(getTaskDirectory(appPaths, task.id), ...asset.relativePath.split("/"))
        )
      ).toBe(true);
    }
  });

  it("imports knowledge documents and viral copy references as task assets", () => {
    const service = new SourceAssetService(repository, appPaths);
    const task = repository.createTask({ title: "Knowledge task" });
    const knowledgePath = path.join(tempDir, "playbook.md");
    const viralPath = path.join(tempDir, "viral-case.txt");
    fs.writeFileSync(knowledgePath, "# Playbook\nUse first-frame analysis.", "utf8");
    fs.writeFileSync(viralPath, "Hook -> proof -> CTA", "utf8");

    const withKnowledge = service.importKnowledgeDocuments(task.id, [knowledgePath]);
    const updated = service.importViralCopyReferences(task.id, [viralPath]);

    expect(withKnowledge.mediaAssets.some((asset) => asset.kind === "knowledge-document")).toBe(
      true
    );
    expect(updated.mediaAssets.some((asset) => asset.kind === "viral-copy-reference")).toBe(true);
    for (const asset of updated.mediaAssets.filter((candidate) =>
      ["knowledge-document", "viral-copy-reference"].includes(candidate.kind)
    )) {
      expect(
        fs.existsSync(
          path.join(getTaskDirectory(appPaths, task.id), ...asset.relativePath.split("/"))
        )
      ).toBe(true);
    }
  });

  it("creates a reusable visual analysis brief for script generation", () => {
    const service = new SourceAssetService(repository, appPaths);
    const task = repository.createTask({ title: "Visual brief" });
    repository.updateTask({
      taskId: task.id,
      originalVideoUrl: "https://example.com/reference.mp4",
      generationMode: "viral-remix"
    });

    const updated = service.analyzeSourceVisuals(task.id);
    const asset = updated.mediaAssets.find(
      (mediaAsset) => mediaAsset.kind === "source-visual-analysis"
    );

    expect(updated.steps.find((step) => step.id === "source")?.status).toBe("complete");
    expect(asset?.relativePath).toBe("source/visual-analysis.md");
    expect(
      fs.readFileSync(
        path.join(getTaskDirectory(appPaths, task.id), "source", "visual-analysis.md"),
        {
          encoding: "utf8"
        }
      )
    ).toContain("## 复刻边界");
  });
});
