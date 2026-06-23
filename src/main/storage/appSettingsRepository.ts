import {
  DEFAULT_APP_PATH_SETTINGS,
  type AppPathSettingKind,
  type AppPathSettings
} from "../../shared/appSettings";
import type { TaskDatabase } from "./database";

const PATH_SETTINGS_KEY = "path-settings";

export class AppSettingsRepository {
  constructor(private readonly database: TaskDatabase) {}

  getPathSettings(): AppPathSettings {
    const row = this.database
      .prepare("SELECT value_json FROM app_preferences WHERE key = ?")
      .get(PATH_SETTINGS_KEY) as { value_json?: string } | undefined;
    if (!row?.value_json) {
      return { ...DEFAULT_APP_PATH_SETTINGS };
    }

    try {
      return sanitizePathSettings(JSON.parse(row.value_json));
    } catch {
      return { ...DEFAULT_APP_PATH_SETTINGS };
    }
  }

  updatePathSettings(input: Partial<AppPathSettings>): AppPathSettings {
    const next = sanitizePathSettings({
      ...this.getPathSettings(),
      ...input
    });
    this.savePathSettings(next);
    return next;
  }

  updatePathSetting(kind: AppPathSettingKind, directory: string): AppPathSettings {
    return this.updatePathSettings({ [kind]: directory });
  }

  clearPathSetting(kind: AppPathSettingKind): AppPathSettings {
    return this.updatePathSettings({ [kind]: "" });
  }

  private savePathSettings(settings: AppPathSettings): void {
    this.database
      .prepare(
        `
        INSERT INTO app_preferences (key, value_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at
      `
      )
      .run(PATH_SETTINGS_KEY, JSON.stringify(settings), new Date().toISOString());
  }
}

function sanitizePathSettings(value: unknown): AppPathSettings {
  const record = isRecord(value) ? value : {};
  return {
    sourceDownloadDirectory: sanitizePathValue(record.sourceDownloadDirectory),
    generatedImageDirectory: sanitizePathValue(record.generatedImageDirectory),
    generatedVideoDirectory: sanitizePathValue(record.generatedVideoDirectory)
  };
}

function sanitizePathValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
