// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppPaths } from "./appPaths";
import { AppSettingsRepository } from "./appSettingsRepository";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "./database";

let tempDir: string;
let database: TaskDatabase;
let repository: AppSettingsRepository;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-app-settings-"));
  const appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  repository = new AppSettingsRepository(database);
});

afterEach(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("AppSettingsRepository", () => {
  it("returns empty path settings by default", () => {
    expect(repository.getPathSettings()).toEqual({
      sourceDownloadDirectory: "",
      generatedImageDirectory: "",
      generatedVideoDirectory: ""
    });
  });

  it("persists local path settings and can clear one path", () => {
    repository.updatePathSetting("sourceDownloadDirectory", "D:\\Downloads");
    repository.updatePathSetting("generatedImageDirectory", "D:\\Images");
    repository.updatePathSetting("generatedVideoDirectory", "D:\\Videos");

    expect(repository.getPathSettings()).toEqual({
      sourceDownloadDirectory: "D:\\Downloads",
      generatedImageDirectory: "D:\\Images",
      generatedVideoDirectory: "D:\\Videos"
    });

    repository.clearPathSetting("generatedImageDirectory");

    expect(repository.getPathSettings()).toEqual({
      sourceDownloadDirectory: "D:\\Downloads",
      generatedImageDirectory: "",
      generatedVideoDirectory: "D:\\Videos"
    });
  });
});
