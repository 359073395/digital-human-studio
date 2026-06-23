// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppPaths, getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { TaskRepository } from "../storage/taskRepository";
import { buildKnowledgeContext, writeKnowledgeContextPreview } from "./knowledgeContextBuilder";

let tempDir: string;
let appPaths: AppPaths;
let database: TaskDatabase;
let repository: TaskRepository;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-knowledge-context-"));
  appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  repository = new TaskRepository(database, appPaths);
});

afterEach(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("knowledgeContextBuilder", () => {
  it("combines built-in knowledge, uploaded documents, viral cases, and task analysis", () => {
    const task = repository.createTask({
      title: "Knowledge context",
      sourceScript: "Reference script keeps hook, proof and CTA."
    });
    const updated = repository.updateTask({
      taskId: task.id,
      generationMode: "viral-remix",
      originalVideoUrl: "https://example.com/viral-video",
      finalScript: "Confirmed original script with current price.",
      creativeWorkflow: {
        ...task.creativeWorkflow,
        referenceAnalysis: "Visual breakdown: demo-first hook and proof shot."
      }
    });
    const taskDirectory = getTaskDirectory(appPaths, task.id);
    fs.mkdirSync(path.join(taskDirectory, "source", "knowledge"), { recursive: true });
    fs.mkdirSync(path.join(taskDirectory, "source", "viral-copy"), { recursive: true });
    fs.mkdirSync(path.join(taskDirectory, "source"), { recursive: true });
    fs.writeFileSync(
      path.join(taskDirectory, "source", "knowledge", "playbook.md"),
      "# Playbook\nUse product facts and banned words first.",
      "utf8"
    );
    fs.writeFileSync(
      path.join(taskDirectory, "source", "viral-copy", "case.txt"),
      "Hook -> proof -> CTA. Keep structure, change wording.",
      "utf8"
    );
    fs.writeFileSync(
      path.join(taskDirectory, "source", "visual-analysis.txt"),
      "Frame analysis: product appears in the first second.",
      "utf8"
    );
    repository.addMediaAsset(task.id, "knowledge-document", "source/knowledge/playbook.md");
    repository.addMediaAsset(task.id, "viral-copy-reference", "source/viral-copy/case.txt");
    repository.addMediaAsset(task.id, "source-visual-analysis", "source/visual-analysis.txt");

    const latestTask = repository.getTask(task.id) ?? updated;
    const context = buildKnowledgeContext(appPaths, latestTask, "script");
    writeKnowledgeContextPreview(appPaths, task.id, context);

    expect(context.promptText).toContain("Layer 1 - Built-in summarized knowledge");
    expect(context.promptText).toContain("Layer 2 - User uploaded long-term knowledge");
    expect(context.promptText).toContain("Use product facts and banned words first.");
    expect(context.promptText).toContain("Hook -> proof -> CTA");
    expect(context.promptText).toContain("Frame analysis: product appears");
    expect(context.promptText).toContain("故事板");
    expect(context.sourceCounts.uploadedKnowledge).toBe(1);
    expect(context.sourceCounts.viralReferences).toBe(1);
    expect(context.hasCurrentTaskInput).toBe(true);
    expect(
      fs.readFileSync(path.join(taskDirectory, "source", "knowledge-context-preview.txt"), "utf8")
    ).toContain("Knowledge Context Preview");
  });

  it("selects personal IP knowledge without forcing commerce", () => {
    const task = repository.createTask({
      title: "Personal IP",
      sourceScript: "A creator shares a store visit and practical lesson."
    });
    const updated = repository.updateTask({
      taskId: task.id,
      generationMode: "personal-ip",
      personalIpProfile: {
        ...task.personalIpProfile,
        persona: "Local store reviewer and knowledge sharer"
      }
    });

    const context = buildKnowledgeContext(appPaths, updated, "script");

    expect(context.promptText).toContain("个人 IP 不强制带货");
    expect(context.promptText).toContain("探店、知识输出、观点");
    expect(context.promptText).toContain("Local store reviewer");
  });
});
