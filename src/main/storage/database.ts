import { DatabaseSync } from "node:sqlite";

export type TaskDatabase = InstanceType<typeof DatabaseSync>;

const MIGRATIONS = [
  {
    id: 1,
    name: "create-task-storage",
    sql: `
      CREATE TABLE IF NOT EXISTS video_tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source_script TEXT NOT NULL,
        final_script TEXT NOT NULL,
        content_language TEXT NOT NULL,
        selected_output_presets TEXT NOT NULL,
        publishing_package TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS generation_steps (
        task_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        label TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (task_id, step_id),
        FOREIGN KEY (task_id) REFERENCES video_tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS output_variants (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        preset_id TEXT NOT NULL,
        status TEXT NOT NULL,
        finished_video_path TEXT,
        cover_image_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES video_tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS media_assets (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES video_tasks(id) ON DELETE CASCADE
      );
    `
  },
  {
    id: 2,
    name: "create-service-configurations",
    sql: `
      CREATE TABLE IF NOT EXISTS service_configurations (
        provider_id TEXT PRIMARY KEY,
        settings_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `
  },
  {
    id: 3,
    name: "add-script-generation-metadata",
    sql: `
      ALTER TABLE video_tasks ADD COLUMN similarity_risk TEXT NOT NULL DEFAULT 'unknown';
      ALTER TABLE video_tasks ADD COLUMN script_generation_notes TEXT NOT NULL DEFAULT '';
    `
  },
  {
    id: 4,
    name: "add-avatar-prompt-and-image-presenter-fields",
    sql: `
      ALTER TABLE video_tasks ADD COLUMN avatar_mode TEXT NOT NULL DEFAULT 'preset-avatar';
      ALTER TABLE video_tasks ADD COLUMN avatar_description_prompt TEXT NOT NULL DEFAULT '';
      ALTER TABLE video_tasks ADD COLUMN motion_prompt TEXT NOT NULL DEFAULT '';
      ALTER TABLE video_tasks ADD COLUMN product_image_asset_id TEXT;
      ALTER TABLE video_tasks ADD COLUMN generated_presenter_image_asset_id TEXT;
    `
  }
] as const;

export function openTaskDatabase(databasePath: string): TaskDatabase {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA journal_mode = WAL;");
  return database;
}

export function runMigrations(database: TaskDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = database.prepare("SELECT id FROM schema_migrations").all() as Array<{
    id: number;
  }>;
  const appliedIds = new Set(appliedRows.map((row) => row.id));

  for (const migration of MIGRATIONS) {
    if (appliedIds.has(migration.id)) {
      continue;
    }

    runInTransaction(database, () => {
      database.exec(migration.sql);
      database
        .prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)")
        .run(migration.id, migration.name, new Date().toISOString());
    });
  }
}

export function runInTransaction<T>(database: TaskDatabase, callback: () => T): T {
  database.exec("BEGIN IMMEDIATE;");

  try {
    const result = callback();
    database.exec("COMMIT;");
    return result;
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}
