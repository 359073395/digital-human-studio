// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppPaths, getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { TaskRepository } from "../storage/taskRepository";
import type { VisualAnalysisProvider } from "../media/visualAnalysisProvider";
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

  it("copies downloaded source media to the configured download directory", async () => {
    const downloadDirectory = path.join(tempDir, "external-downloads");
    const fetchImpl: typeof fetch = async () =>
      new Response(new Uint8Array([9, 8, 7, 6]), {
        headers: { "content-type": "video/mp4" },
        status: 200
      });
    const service = new SourceAssetService(repository, appPaths, fetchImpl, undefined, undefined, {
      getPathSettings: () => ({
        sourceDownloadDirectory: downloadDirectory,
        generatedImageDirectory: "",
        generatedVideoDirectory: ""
      })
    });
    const task = repository.createTask({ title: "External source copy" });
    repository.updateTask({
      taskId: task.id,
      originalVideoUrl: "https://cdn.example.com/reference.mp4"
    });

    const updated = await service.downloadOriginalVideo(task.id);
    const asset = updated.mediaAssets.find((mediaAsset) => mediaAsset.kind === "source-video");

    expect(asset).toBeDefined();
    expect(
      fs.readFileSync(path.join(downloadDirectory, path.basename(asset?.relativePath ?? "")))
    ).toEqual(Buffer.from([9, 8, 7, 6]));
  });

  it("downloads source videos through the configured parser API", async () => {
    const seenRequests: Array<{ url: string; method?: string; xApiKey?: string }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      seenRequests.push({
        url: String(url),
        method: init?.method,
        xApiKey: (init?.headers as Record<string, string>)?.["x-api-key"]
      });

      if (String(url).endsWith("/api/v1/jobs") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ url: "https://v.douyin.com/example/" });
        return new Response(JSON.stringify({ job_id: "job-123" }), {
          headers: { "content-type": "application/json" }
        });
      }

      if (String(url).endsWith("/api/v1/jobs/job-123") && init?.method === "GET") {
        return new Response(
          JSON.stringify({
            job_id: "job-123",
            status: "completed",
            title: "Source video",
            filename: "source-video.mp4"
          }),
          {
            headers: { "content-type": "application/json" }
          }
        );
      }

      if (String(url).endsWith("/api/v1/jobs/job-123/download") && init?.method === "GET") {
        return new Response(new Uint8Array([5, 6, 7, 8]), {
          headers: { "content-type": "video/mp4" }
        });
      }

      return new Response("not found", { status: 404 });
    };
    const service = new SourceAssetService(
      repository,
      appPaths,
      fetchImpl,
      {
        getConfiguration: () => ({
          providerId: "source-parser",
          label: "原视频解析下载",
          kind: "source-parser",
          settings: {
            baseUrl: "https://jiexi.example/",
            enabled: true
          },
          credentialConfigured: true,
          updatedAt: "2026-06-23T00:00:00.000Z"
        })
      },
      {
        readCredential: async () => "parser-key"
      }
    );
    const task = repository.createTask({ title: "Parser source" });
    repository.updateTask({
      taskId: task.id,
      originalVideoUrl: "https://v.douyin.com/example/"
    });

    const updated = await service.downloadOriginalVideo(task.id);
    const asset = updated.mediaAssets.find((mediaAsset) => mediaAsset.kind === "source-video");

    expect(updated.steps.find((step) => step.id === "source")?.status).toBe("complete");
    expect(asset?.relativePath).toMatch(/^source\/original-video-\d+-source-video\.mp4$/);
    expect(
      fs.readFileSync(
        path.join(getTaskDirectory(appPaths, task.id), ...(asset?.relativePath ?? "").split("/"))
      )
    ).toEqual(Buffer.from([5, 6, 7, 8]));
    expect(seenRequests).toEqual([
      {
        url: "https://jiexi.example/api/v1/jobs",
        method: "POST",
        xApiKey: "parser-key"
      },
      {
        url: "https://jiexi.example/api/v1/jobs/job-123",
        method: "GET",
        xApiKey: "parser-key"
      },
      {
        url: "https://jiexi.example/api/v1/jobs/job-123/download",
        method: "GET",
        xApiKey: "parser-key"
      }
    ]);
  });

  it("extracts the first URL from pasted platform share text before parsing", async () => {
    const requestBodies: unknown[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      if (String(url).endsWith("/api/v1/jobs") && init?.method === "POST") {
        requestBodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ job_id: "job-share-text" }), {
          headers: { "content-type": "application/json" }
        });
      }

      if (String(url).endsWith("/api/v1/jobs/job-share-text") && init?.method === "GET") {
        return new Response(
          JSON.stringify({
            job_id: "job-share-text",
            status: "completed",
            title: "Share text video",
            filename: "share-text.mp4"
          }),
          {
            headers: { "content-type": "application/json" }
          }
        );
      }

      if (String(url).endsWith("/api/v1/jobs/job-share-text/download") && init?.method === "GET") {
        return new Response(new Uint8Array([1, 3, 5, 7]), {
          headers: { "content-type": "video/mp4" }
        });
      }

      return new Response("not found", { status: 404 });
    };
    const service = new SourceAssetService(
      repository,
      appPaths,
      fetchImpl,
      {
        getConfiguration: () => ({
          providerId: "source-parser",
          label: "原视频解析下载",
          kind: "source-parser",
          settings: {
            baseUrl: "https://jiexi.example/",
            enabled: true
          },
          credentialConfigured: true,
          updatedAt: "2026-06-23T00:00:00.000Z"
        })
      },
      {
        readCredential: async () => "parser-key"
      }
    );
    const task = repository.createTask({ title: "Share text source" });
    repository.updateTask({
      taskId: task.id,
      originalVideoUrl:
        "5.10 复制打开抖音，看看作者的作品 https://v.douyin.com/OPZgLZseJOA/ 复制此链接"
    });

    const updated = await service.downloadOriginalVideo(task.id);

    expect(requestBodies).toEqual([{ url: "https://v.douyin.com/OPZgLZseJOA/" }]);
    expect(updated.mediaAssets.some((asset) => asset.kind === "source-video")).toBe(true);
  });

  it("explains Douyin cookie failures from the parser service", async () => {
    const fetchImpl: typeof fetch = async (url, init) => {
      if (String(url).endsWith("/api/v1/jobs") && init?.method === "POST") {
        return new Response(JSON.stringify({ job_id: "job-cookie-failure" }), {
          headers: { "content-type": "application/json" }
        });
      }

      if (String(url).endsWith("/api/v1/jobs/job-cookie-failure") && init?.method === "GET") {
        return new Response(
          JSON.stringify({
            job_id: "job-cookie-failure",
            status: "failed",
            error: "ERROR: [Douyin] 123: Fresh cookies (not necessarily logged in) are needed"
          }),
          {
            headers: { "content-type": "application/json" }
          }
        );
      }

      return new Response("not found", { status: 404 });
    };
    const service = new SourceAssetService(
      repository,
      appPaths,
      fetchImpl,
      {
        getConfiguration: () => ({
          providerId: "source-parser",
          label: "原视频解析下载",
          kind: "source-parser",
          settings: {
            baseUrl: "https://jiexi.example/",
            enabled: true
          },
          credentialConfigured: true,
          updatedAt: "2026-06-23T00:00:00.000Z"
        })
      },
      {
        readCredential: async () => "parser-key"
      }
    );
    const task = repository.createTask({ title: "Cookie failure" });
    repository.updateTask({
      taskId: task.id,
      originalVideoUrl: "https://v.douyin.com/OPZgLZseJOA/"
    });

    await expect(service.downloadOriginalVideo(task.id)).rejects.toThrow(
      "抖音要求服务端提供新的 cookies"
    );

    const failed = repository.getTask(task.id);
    expect(failed?.steps.find((step) => step.id === "source")?.errorMessage).toContain(
      "解析站更新 Douyin cookies"
    );
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

  it("syncs mixed-cut materials from a folder and replaces previous folder assets", () => {
    const service = new SourceAssetService(repository, appPaths);
    const task = repository.createTask({ title: "Mixed folder" });
    const firstFolder = path.join(tempDir, "first-folder");
    const secondFolder = path.join(tempDir, "second-folder");
    fs.mkdirSync(path.join(firstFolder, "nested"), { recursive: true });
    fs.mkdirSync(secondFolder, { recursive: true });
    fs.writeFileSync(path.join(firstFolder, "clip-a.mp4"), Buffer.from("video-a"));
    fs.writeFileSync(path.join(firstFolder, "nested", "clip-b.jpg"), Buffer.from("image-b"));
    fs.writeFileSync(path.join(firstFolder, "ignore.txt"), "ignore", "utf8");
    fs.writeFileSync(path.join(secondFolder, "clip-c.webp"), Buffer.from("image-c"));

    const firstSync = service.importMixedCutMaterialDirectory(task.id, firstFolder);
    const secondSync = service.importMixedCutMaterialDirectory(task.id, secondFolder);
    const firstAssets = firstSync.mediaAssets.filter(
      (asset) => asset.kind === "mixed-cut-material"
    );
    const secondAssets = secondSync.mediaAssets.filter(
      (asset) => asset.kind === "mixed-cut-material"
    );

    expect(firstSync.mixedCutMaterialDirectory).toBe(path.resolve(firstFolder));
    expect(firstAssets).toHaveLength(2);
    expect(secondSync.mixedCutMaterialDirectory).toBe(path.resolve(secondFolder));
    expect(secondAssets).toHaveLength(1);
    expect(secondAssets[0]?.relativePath).toContain("clip-c");
    expect(
      fs.existsSync(
        path.join(getTaskDirectory(appPaths, task.id), ...secondAssets[0]!.relativePath.split("/"))
      )
    ).toBe(true);
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

  it("creates a reusable visual analysis brief for script generation", async () => {
    const service = new SourceAssetService(repository, appPaths);
    const task = repository.createTask({ title: "Visual brief" });
    const videoPath = path.join(tempDir, "reference.mp4");
    fs.writeFileSync(videoPath, Buffer.from("video"));
    repository.updateTask({
      taskId: task.id,
      originalVideoUrl: "https://example.com/reference.mp4",
      generationMode: "viral-remix"
    });
    service.importSourceVideo(task.id, videoPath);

    const updated = await service.analyzeSourceVisuals(task.id);
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

  it("saves real visual analysis provider output for script context", async () => {
    const visualProvider: VisualAnalysisProvider = {
      analyze: async ({ sourceAssets }) =>
        `# 画面分析\n\n## 镜头时间线\n- assets: ${sourceAssets.length}\n\n## 可复刻方法\n- keep structure, rewrite expression.`
    };
    const service = new SourceAssetService(
      repository,
      appPaths,
      fetch,
      undefined,
      undefined,
      undefined,
      visualProvider
    );
    const task = repository.createTask({ title: "Real visual provider" });
    const imagePath = path.join(tempDir, "frame.jpg");
    fs.writeFileSync(imagePath, Buffer.from("image"));
    service.importMixedCutMaterials(task.id, [imagePath]);

    const updated = await service.analyzeSourceVisuals(task.id);
    const analysisPath = path.join(
      getTaskDirectory(appPaths, task.id),
      "source",
      "visual-analysis.md"
    );

    expect(updated.mediaAssets.some((asset) => asset.kind === "source-visual-analysis")).toBe(true);
    expect(fs.readFileSync(analysisPath, "utf8")).toContain("## 镜头时间线");
  });
});
