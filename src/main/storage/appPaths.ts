import fs from "node:fs";
import path from "node:path";

export const TASK_MEDIA_DIRECTORIES = [
  "source",
  "avatar",
  "storyboard",
  "subtitles",
  "post",
  "exports"
] as const;

export type TaskMediaDirectory = (typeof TASK_MEDIA_DIRECTORIES)[number];

export interface AppPaths {
  appDataDir: string;
  databasePath: string;
  tasksDir: string;
}

export function createAppPaths(appDataDir: string): AppPaths {
  return {
    appDataDir,
    databasePath: path.join(appDataDir, "digital-human-studio.sqlite"),
    tasksDir: path.join(appDataDir, "tasks")
  };
}

export function ensureAppPaths(paths: AppPaths): void {
  fs.mkdirSync(paths.appDataDir, { recursive: true });
  fs.mkdirSync(paths.tasksDir, { recursive: true });
}

export function getTaskDirectory(paths: AppPaths, taskId: string): string {
  return path.join(paths.tasksDir, taskId);
}

export function getTaskMediaDirectory(
  paths: AppPaths,
  taskId: string,
  directory: TaskMediaDirectory
): string {
  return path.join(getTaskDirectory(paths, taskId), directory);
}

export function ensureTaskMediaDirectories(paths: AppPaths, taskId: string): void {
  for (const directory of TASK_MEDIA_DIRECTORIES) {
    fs.mkdirSync(getTaskMediaDirectory(paths, taskId, directory), { recursive: true });
  }
}
