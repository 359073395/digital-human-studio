import crypto from "node:crypto";
import {
  DEFAULT_GENERATION_STEPS,
  DEFAULT_PUBLISHING_PACKAGE,
  defaultOutputPresetIds,
  isContentLanguage,
  isOutputPresetId,
  type AvatarMode,
  type ContentLanguage,
  type GenerationStep,
  type GenerationStepId,
  type MediaAsset,
  type OutputPresetId,
  type OutputVariant,
  type PublishingPackage,
  type SimilarityRisk,
  type StepStatus,
  type VideoTask,
  type VideoTaskSummary
} from "../../shared/domain";
import type { CreateTaskInput, UpdateTaskInput } from "../../shared/ipc";
import { ensureTaskMediaDirectories, type AppPaths } from "./appPaths";
import { runInTransaction, type TaskDatabase } from "./database";

interface TaskRow {
  id: string;
  title: string;
  source_script: string;
  final_script: string;
  similarity_risk: SimilarityRisk;
  script_generation_notes: string;
  content_language: ContentLanguage;
  avatar_mode: AvatarMode;
  avatar_description_prompt: string;
  motion_prompt: string;
  product_image_asset_id: string | null;
  generated_presenter_image_asset_id: string | null;
  selected_output_presets: string;
  publishing_package: string;
  created_at: string;
  updated_at: string;
}

interface StepRow {
  task_id: string;
  step_id: GenerationStepId;
  label: string;
  status: StepStatus;
  error_message: string | null;
  updated_at: string;
}

interface VariantRow {
  id: string;
  task_id: string;
  preset_id: OutputPresetId;
  status: OutputVariant["status"];
  finished_video_path: string | null;
  cover_image_path: string | null;
  created_at: string;
  updated_at: string;
}

interface MediaAssetRow {
  id: string;
  task_id: string;
  kind: MediaAsset["kind"];
  relative_path: string;
  created_at: string;
}

export class TaskRepository {
  constructor(
    private readonly database: TaskDatabase,
    private readonly paths: AppPaths
  ) {}

  listTasks(): VideoTaskSummary[] {
    const rows = this.database
      .prepare("SELECT * FROM video_tasks ORDER BY updated_at DESC")
      .all() as unknown as TaskRow[];

    return rows.map((row) => {
      const steps = this.listSteps(row.id);
      const activeStep =
        steps.find((step) => step.status === "running") ??
        steps.find((step) => step.status !== "complete");

      return {
        id: row.id,
        title: row.title,
        contentLanguage: row.content_language,
        selectedOutputPresets: parseOutputPresetIds(row.selected_output_presets),
        activeStepLabel: activeStep?.label ?? "已完成",
        status: activeStep?.status ?? "complete",
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });
  }

  getTask(taskId: string): VideoTask | null {
    const row = this.database.prepare("SELECT * FROM video_tasks WHERE id = ?").get(taskId) as
      | TaskRow
      | undefined;

    if (!row) {
      return null;
    }

    return this.hydrateTask(row);
  }

  createTask(input: CreateTaskInput = {}): VideoTask {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = input.title?.trim() || "未命名视频任务";
    const sourceScript = input.sourceScript?.trim() || "";
    const finalScript = "";
    const similarityRisk: SimilarityRisk = "unknown";
    const scriptGenerationNotes = "";
    const contentLanguage: ContentLanguage = "zh-CN";
    const avatarMode: AvatarMode = "preset-avatar";
    const avatarDescriptionPrompt = "";
    const motionPrompt = "";
    const selectedOutputPresets = defaultOutputPresetIds();
    const publishingPackage = DEFAULT_PUBLISHING_PACKAGE;

    runInTransaction(this.database, () => {
      this.database
        .prepare(
          `INSERT INTO video_tasks (
            id,
            title,
            source_script,
            final_script,
            similarity_risk,
            script_generation_notes,
            content_language,
            avatar_mode,
            avatar_description_prompt,
            motion_prompt,
            product_image_asset_id,
            generated_presenter_image_asset_id,
            selected_output_presets,
            publishing_package,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          title,
          sourceScript,
          finalScript,
          similarityRisk,
          scriptGenerationNotes,
          contentLanguage,
          avatarMode,
          avatarDescriptionPrompt,
          motionPrompt,
          null,
          null,
          JSON.stringify(selectedOutputPresets),
          JSON.stringify(publishingPackage),
          now,
          now
        );

      for (const step of DEFAULT_GENERATION_STEPS) {
        this.database
          .prepare(
            `INSERT INTO generation_steps (
              task_id,
              step_id,
              label,
              status,
              error_message,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(id, step.id, step.label, step.status, null, now);
      }

      for (const presetId of selectedOutputPresets) {
        this.database
          .prepare(
            `INSERT INTO output_variants (
              id,
              task_id,
              preset_id,
              status,
              finished_video_path,
              cover_image_path,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(crypto.randomUUID(), id, presetId, "waiting", null, null, now, now);
      }
    });
    ensureTaskMediaDirectories(this.paths, id);

    const task = this.getTask(id);
    if (!task) {
      throw new Error(`Created task ${id} could not be loaded.`);
    }
    return task;
  }

  updateTask(input: UpdateTaskInput): VideoTask {
    const existing = this.getTask(input.taskId);
    if (!existing) {
      throw new Error(`Task ${input.taskId} was not found.`);
    }

    const now = new Date().toISOString();
    const title = input.title?.trim() || existing.title;
    const sourceScript =
      input.sourceScript === undefined ? existing.sourceScript : input.sourceScript.trim();
    const contentLanguage = normalizeContentLanguage(
      input.contentLanguage ?? existing.contentLanguage
    );
    const avatarMode = normalizeAvatarMode(input.avatarMode ?? existing.avatarMode);
    const avatarDescriptionPrompt =
      input.avatarDescriptionPrompt === undefined
        ? existing.avatarDescriptionPrompt
        : input.avatarDescriptionPrompt.trim();
    const motionPrompt =
      input.motionPrompt === undefined ? existing.motionPrompt : input.motionPrompt.trim();
    const productImageAssetId =
      input.productImageAssetId === undefined
        ? existing.productImageAssetId
        : input.productImageAssetId;
    const generatedPresenterImageAssetId =
      input.generatedPresenterImageAssetId === undefined
        ? existing.generatedPresenterImageAssetId
        : input.generatedPresenterImageAssetId;
    const selectedOutputPresets = normalizeOutputPresetIds(
      input.selectedOutputPresets ?? existing.selectedOutputPresets
    );

    runInTransaction(this.database, () => {
      this.database
        .prepare(
          `UPDATE video_tasks
           SET title = ?,
               source_script = ?,
               content_language = ?,
               avatar_mode = ?,
               avatar_description_prompt = ?,
               motion_prompt = ?,
               product_image_asset_id = ?,
               generated_presenter_image_asset_id = ?,
               selected_output_presets = ?,
               updated_at = ?
           WHERE id = ?`
        )
        .run(
          title,
          sourceScript,
          contentLanguage,
          avatarMode,
          avatarDescriptionPrompt,
          motionPrompt,
          productImageAssetId ?? null,
          generatedPresenterImageAssetId ?? null,
          JSON.stringify(selectedOutputPresets),
          now,
          input.taskId
        );

      this.syncOutputVariants(input.taskId, selectedOutputPresets, now);
    });

    const task = this.getTask(input.taskId);
    if (!task) {
      throw new Error(`Task ${input.taskId} was not found after update.`);
    }
    return task;
  }

  updateFinalScript(taskId: string, finalScript: string): VideoTask {
    const now = new Date().toISOString();
    const result = this.database
      .prepare("UPDATE video_tasks SET final_script = ?, updated_at = ? WHERE id = ?")
      .run(finalScript, now, taskId);

    if (result.changes === 0) {
      throw new Error(`Task ${taskId} was not found.`);
    }

    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found after final script update.`);
    }
    return task;
  }

  updateScriptGeneration(
    taskId: string,
    input: {
      finalScript: string;
      similarityRisk: SimilarityRisk;
      scriptGenerationNotes: string;
    }
  ): VideoTask {
    const now = new Date().toISOString();
    const result = this.database
      .prepare(
        `UPDATE video_tasks
         SET final_script = ?,
             similarity_risk = ?,
             script_generation_notes = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .run(input.finalScript, input.similarityRisk, input.scriptGenerationNotes, now, taskId);

    if (result.changes === 0) {
      throw new Error(`Task ${taskId} was not found.`);
    }

    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found after script generation update.`);
    }
    return task;
  }

  updatePublishingPackage(taskId: string, publishingPackage: PublishingPackage): VideoTask {
    const now = new Date().toISOString();
    const result = this.database
      .prepare("UPDATE video_tasks SET publishing_package = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(publishingPackage), now, taskId);

    if (result.changes === 0) {
      throw new Error(`Task ${taskId} was not found.`);
    }

    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found after publishing package update.`);
    }
    return task;
  }

  updateOutputVariant(
    taskId: string,
    presetId: OutputPresetId,
    patch: {
      status?: OutputVariant["status"];
      finishedVideoPath?: string;
      coverImagePath?: string;
    }
  ): VideoTask {
    const now = new Date().toISOString();
    const existing = this.database
      .prepare("SELECT id FROM output_variants WHERE task_id = ? AND preset_id = ?")
      .get(taskId, presetId) as { id: string } | undefined;

    runInTransaction(this.database, () => {
      if (!existing) {
        this.database
          .prepare(
            `INSERT INTO output_variants (
              id,
              task_id,
              preset_id,
              status,
              finished_video_path,
              cover_image_path,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            crypto.randomUUID(),
            taskId,
            presetId,
            patch.status ?? "waiting",
            patch.finishedVideoPath ?? null,
            patch.coverImagePath ?? null,
            now,
            now
          );
      } else {
        this.database
          .prepare(
            `UPDATE output_variants
             SET status = COALESCE(?, status),
                 finished_video_path = COALESCE(?, finished_video_path),
                 cover_image_path = COALESCE(?, cover_image_path),
                 updated_at = ?
             WHERE task_id = ? AND preset_id = ?`
          )
          .run(
            patch.status ?? null,
            patch.finishedVideoPath ?? null,
            patch.coverImagePath ?? null,
            now,
            taskId,
            presetId
          );
      }

      this.database.prepare("UPDATE video_tasks SET updated_at = ? WHERE id = ?").run(now, taskId);
    });

    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found after variant update.`);
    }
    return task;
  }

  addMediaAsset(taskId: string, kind: MediaAsset["kind"], relativePath: string): VideoTask {
    const existing = this.database
      .prepare("SELECT id FROM media_assets WHERE task_id = ? AND kind = ? AND relative_path = ?")
      .get(taskId, kind, relativePath) as { id: string } | undefined;

    if (!existing) {
      const now = new Date().toISOString();
      runInTransaction(this.database, () => {
        this.database
          .prepare(
            `INSERT INTO media_assets (
              id,
              task_id,
              kind,
              relative_path,
              created_at
            ) VALUES (?, ?, ?, ?, ?)`
          )
          .run(crypto.randomUUID(), taskId, kind, relativePath, now);

        this.database
          .prepare("UPDATE video_tasks SET updated_at = ? WHERE id = ?")
          .run(now, taskId);
      });
    }

    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found after media asset insert.`);
    }
    return task;
  }

  updateStepStatus(
    taskId: string,
    stepId: GenerationStepId,
    status: StepStatus,
    errorMessage?: string
  ): VideoTask {
    const now = new Date().toISOString();
    runInTransaction(this.database, () => {
      const result = this.database
        .prepare(
          `UPDATE generation_steps
           SET status = ?, error_message = ?, updated_at = ?
           WHERE task_id = ? AND step_id = ?`
        )
        .run(status, errorMessage ?? null, now, taskId, stepId);

      if (result.changes === 0) {
        throw new Error(`Generation step ${stepId} was not found for task ${taskId}.`);
      }

      this.database.prepare("UPDATE video_tasks SET updated_at = ? WHERE id = ?").run(now, taskId);
    });

    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found after step update.`);
    }
    return task;
  }

  ensureSeedTask(): VideoTask {
    const existing = this.listTasks()[0];
    if (existing) {
      const task = this.getTask(existing.id);
      if (task) {
        ensureTaskMediaDirectories(this.paths, task.id);
        return task;
      }
    }

    const task = this.createTask({
      title: "护肤品口播样片",
      sourceScript: "如果你的内容一直有播放，却始终带不动成交，问题可能不在流量。"
    });

    this.updateStepStatus(task.id, "source", "complete");
    this.updateStepStatus(task.id, "script", "complete");
    return this.updateStepStatus(task.id, "avatar", "running");
  }

  private hydrateTask(row: TaskRow): VideoTask {
    return {
      id: row.id,
      title: row.title,
      sourceScript: row.source_script,
      finalScript: row.final_script,
      similarityRisk: row.similarity_risk,
      scriptGenerationNotes: row.script_generation_notes,
      contentLanguage: normalizeContentLanguage(row.content_language),
      avatarMode: normalizeAvatarMode(row.avatar_mode),
      avatarDescriptionPrompt: row.avatar_description_prompt,
      motionPrompt: row.motion_prompt,
      productImageAssetId: row.product_image_asset_id ?? undefined,
      generatedPresenterImageAssetId: row.generated_presenter_image_asset_id ?? undefined,
      selectedOutputPresets: parseOutputPresetIds(row.selected_output_presets),
      publishingPackage: parsePublishingPackage(row.publishing_package),
      steps: this.listSteps(row.id),
      outputVariants: this.listOutputVariants(row.id),
      mediaAssets: this.listMediaAssets(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private listSteps(taskId: string): GenerationStep[] {
    const rows = this.database
      .prepare("SELECT * FROM generation_steps WHERE task_id = ? ORDER BY rowid ASC")
      .all(taskId) as unknown as StepRow[];

    return rows.map((row) => ({
      id: row.step_id,
      label: row.label,
      status: row.status,
      errorMessage: row.error_message ?? undefined,
      updatedAt: row.updated_at
    }));
  }

  private listOutputVariants(taskId: string): OutputVariant[] {
    const rows = this.database
      .prepare("SELECT * FROM output_variants WHERE task_id = ? ORDER BY created_at ASC")
      .all(taskId) as unknown as VariantRow[];

    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      presetId: row.preset_id,
      status: row.status,
      finishedVideoPath: row.finished_video_path ?? undefined,
      coverImagePath: row.cover_image_path ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  private listMediaAssets(taskId: string): MediaAsset[] {
    const rows = this.database
      .prepare("SELECT * FROM media_assets WHERE task_id = ? ORDER BY created_at ASC")
      .all(taskId) as unknown as MediaAssetRow[];

    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      kind: row.kind,
      relativePath: row.relative_path,
      createdAt: row.created_at
    }));
  }

  private syncOutputVariants(
    taskId: string,
    selectedOutputPresets: OutputPresetId[],
    now: string
  ): void {
    const placeholders = selectedOutputPresets.map(() => "?").join(",");

    if (selectedOutputPresets.length > 0) {
      this.database
        .prepare(
          `DELETE FROM output_variants
           WHERE task_id = ?
             AND preset_id NOT IN (${placeholders})`
        )
        .run(taskId, ...selectedOutputPresets);
    }

    for (const presetId of selectedOutputPresets) {
      const existing = this.database
        .prepare("SELECT id FROM output_variants WHERE task_id = ? AND preset_id = ?")
        .get(taskId, presetId) as { id: string } | undefined;

      if (!existing) {
        this.database
          .prepare(
            `INSERT INTO output_variants (
              id,
              task_id,
              preset_id,
              status,
              finished_video_path,
              cover_image_path,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(crypto.randomUUID(), taskId, presetId, "waiting", null, null, now, now);
      }
    }
  }
}

function parseOutputPresetIds(value: string): OutputPresetId[] {
  return JSON.parse(value) as OutputPresetId[];
}

function parsePublishingPackage(value: string): PublishingPackage {
  return JSON.parse(value) as PublishingPackage;
}

function normalizeOutputPresetIds(value: OutputPresetId[]): OutputPresetId[] {
  const unique = Array.from(new Set(value.filter(isOutputPresetId)));
  return unique.length > 0 ? unique : defaultOutputPresetIds();
}

function normalizeContentLanguage(value: string): ContentLanguage {
  return isContentLanguage(value) ? value : "zh-CN";
}

function normalizeAvatarMode(value: string): AvatarMode {
  return value === "image-presenter" ? "image-presenter" : "preset-avatar";
}
