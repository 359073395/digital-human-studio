// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ScriptGenerationResult } from "../../shared/scriptGeneration";
import { createAppPaths, getTaskDirectory } from "../storage/appPaths";
import type { AppPaths } from "../storage/appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { TaskRepository } from "../storage/taskRepository";
import { ScriptProviderUnavailableError, type ScriptProvider } from "./scriptProvider";
import { ScriptWorkflowService } from "./scriptWorkflowService";

class UnavailableScriptProvider implements ScriptProvider {
  async generate(): Promise<ScriptGenerationResult> {
    throw new ScriptProviderUnavailableError("LLM is not configured.");
  }
}

class FailingScriptProvider implements ScriptProvider {
  async generate(): Promise<ScriptGenerationResult> {
    throw new Error("Provider exploded.");
  }
}

let tempDir: string;
let appPaths: AppPaths;
let database: TaskDatabase;
let repository: TaskRepository;
let service: ScriptWorkflowService;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-script-"));
  appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  repository = new TaskRepository(database, appPaths);
  service = new ScriptWorkflowService(repository, appPaths);
});

afterEach(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("ScriptWorkflowService", () => {
  it("generates an Indonesian script with risk metadata", async () => {
    const task = repository.createTask({ title: "Indonesian script" });
    repository.updateTask({
      taskId: task.id,
      contentLanguage: "id-ID",
      sourceScript: "Kalau video banyak ditonton tapi belum ada pesanan, perbaiki hook."
    });

    const updated = await service.generateScript(task.id);
    const taskDirectory = getTaskDirectory(createAppPaths(tempDir), task.id);

    expect(updated.contentLanguage).toBe("id-ID");
    expect(updated.finalScript).toContain("Jangan langsung salahkan trafik");
    expect(updated.similarityRisk).not.toBe("unknown");
    expect(updated.steps.find((step) => step.id === "script")?.status).toBe("complete");
    expect(fs.existsSync(path.join(taskDirectory, "source", "script-generation-prompt.txt"))).toBe(
      true
    );
  });

  it("falls back to mock generation when the primary provider is unavailable", async () => {
    service = new ScriptWorkflowService(repository, appPaths, new UnavailableScriptProvider());
    const task = repository.createTask({ title: "Fallback script" });
    repository.updateTask({
      taskId: task.id,
      contentLanguage: "en-US",
      sourceScript: "Videos with views still need one clear buying reason."
    });

    const updated = await service.generateScript(task.id);

    expect(updated.finalScript).toContain("Stop blaming the algorithm first");
    expect(updated.steps.find((step) => step.id === "script")?.status).toBe("complete");
  });

  it("marks script generation retry-ready when a configured provider fails", async () => {
    service = new ScriptWorkflowService(repository, appPaths, new FailingScriptProvider());
    const task = repository.createTask({ title: "Provider failure" });

    const updated = await service.generateScript(task.id);
    const scriptStep = updated.steps.find((step) => step.id === "script");

    expect(scriptStep?.status).toBe("retry-ready");
    expect(scriptStep?.errorMessage).toBe("Provider exploded.");
  });

  it("mock-transcribes source material into the selected language", () => {
    const task = repository.createTask({ title: "Transcription" });
    repository.updateTask({
      taskId: task.id,
      contentLanguage: "id-ID"
    });

    const result = service.transcribeSource(task.id);
    const updated = repository.getTask(task.id);

    expect(result.contentLanguage).toBe("id-ID");
    expect(result.transcript).toContain("Banyak orang");
    expect(updated?.sourceScript).toBe(result.transcript);
    expect(updated?.mediaAssets.some((asset) => asset.kind === "source-transcript")).toBe(true);
    expect(updated?.steps.find((step) => step.id === "source")?.status).toBe("complete");
  });
});
