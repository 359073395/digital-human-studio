import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_COVER_STYLE,
  DEFAULT_CREATIVE_WORKFLOW,
  DEFAULT_FRAME_TITLE_STYLE,
  DEFAULT_GENERATION_STEPS,
  DEFAULT_PERSONAL_IP_PROFILE,
  DEFAULT_PUBLISHING_PACKAGE,
  DEFAULT_SUBTITLE_STYLE,
  defaultOutputPresetIds,
  isContentLanguage,
  isOutputPresetId,
  isVideoGenerationMode,
  type AvatarMode,
  type CoverStyle,
  type CreativeWorkflow,
  type ContentLanguage,
  type FrameTitleStyle,
  type GenerationStep,
  type GenerationStepId,
  type GeneratedPresenterImageSelections,
  type MediaAsset,
  type OutputPresetId,
  type OutputVariant,
  type PersonalIpProfile,
  type PublishingPackage,
  type SimilarityRisk,
  type StepStatus,
  type SubtitleStyle,
  type VideoGenerationMode,
  type VideoTask,
  type VideoTaskSummary
} from "../../shared/domain";
import type { CreateTaskInput, UpdateTaskInput } from "../../shared/ipc";
import { ensureTaskMediaDirectories, getTaskDirectory, type AppPaths } from "./appPaths";
import { runInTransaction, type TaskDatabase } from "./database";

interface TaskRow {
  id: string;
  title: string;
  original_video_url: string;
  export_directory: string;
  source_script: string;
  final_script: string;
  similarity_risk: SimilarityRisk;
  script_generation_notes: string;
  content_language: ContentLanguage;
  generation_mode: VideoGenerationMode;
  avatar_mode: AvatarMode;
  preset_avatar_id: string;
  preset_avatar_group_id: string;
  avatar_description_prompt: string;
  motion_prompt: string;
  product_image_asset_id: string | null;
  reference_image_asset_id: string | null;
  generated_presenter_image_asset_id: string | null;
  generated_presenter_image_selections: string;
  custom_font_asset_id: string | null;
  custom_font_family: string;
  selected_output_presets: string;
  subtitle_style: string;
  frame_title_style: string;
  cover_style: string;
  personal_ip_profile: string;
  creative_workflow: string;
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
        generationMode: normalizeGenerationMode(row.generation_mode),
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
    const originalVideoUrl = "";
    const exportDirectory = "";
    const sourceScript = input.sourceScript?.trim() || "";
    const finalScript = "";
    const similarityRisk: SimilarityRisk = "unknown";
    const scriptGenerationNotes = "";
    const contentLanguage: ContentLanguage = "zh-CN";
    const generationMode: VideoGenerationMode = "preset-avatar";
    const avatarMode: AvatarMode = "preset-avatar";
    const presetAvatarId = "";
    const presetAvatarGroupId = "";
    const avatarDescriptionPrompt = "";
    const motionPrompt = "";
    const generatedPresenterImageSelections: GeneratedPresenterImageSelections = {};
    const customFontAssetId = null;
    const customFontFamily = "";
    const selectedOutputPresets = defaultOutputPresetIds();
    const frameTitleStyle = DEFAULT_FRAME_TITLE_STYLE;
    const subtitleStyle = DEFAULT_SUBTITLE_STYLE;
    const coverStyle = DEFAULT_COVER_STYLE;
    const personalIpProfile = DEFAULT_PERSONAL_IP_PROFILE;
    const creativeWorkflow = DEFAULT_CREATIVE_WORKFLOW;
    const publishingPackage = DEFAULT_PUBLISHING_PACKAGE;

    runInTransaction(this.database, () => {
      this.database
        .prepare(
          `INSERT INTO video_tasks (
            id,
            title,
            original_video_url,
            export_directory,
            source_script,
            final_script,
            similarity_risk,
            script_generation_notes,
            content_language,
            generation_mode,
            avatar_mode,
            preset_avatar_id,
            preset_avatar_group_id,
            avatar_description_prompt,
            motion_prompt,
            product_image_asset_id,
            reference_image_asset_id,
            generated_presenter_image_asset_id,
            generated_presenter_image_selections,
            custom_font_asset_id,
            custom_font_family,
            selected_output_presets,
            frame_title_style,
            subtitle_style,
            cover_style,
            personal_ip_profile,
            creative_workflow,
            publishing_package,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          title,
          originalVideoUrl,
          exportDirectory,
          sourceScript,
          finalScript,
          similarityRisk,
          scriptGenerationNotes,
          contentLanguage,
          generationMode,
          avatarMode,
          presetAvatarId,
          presetAvatarGroupId,
          avatarDescriptionPrompt,
          motionPrompt,
          null,
          null,
          null,
          JSON.stringify(generatedPresenterImageSelections),
          customFontAssetId,
          customFontFamily,
          JSON.stringify(selectedOutputPresets),
          JSON.stringify(frameTitleStyle),
          JSON.stringify(subtitleStyle),
          JSON.stringify(coverStyle),
          JSON.stringify(personalIpProfile),
          JSON.stringify(creativeWorkflow),
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

  deleteTask(taskId: string): void {
    const taskDirectory = path.resolve(getTaskDirectory(this.paths, taskId));
    const tasksDirectory = path.resolve(this.paths.tasksDir);
    if (!taskDirectory.startsWith(`${tasksDirectory}${path.sep}`)) {
      throw new Error("任务目录不在应用数据目录内，已取消删除。");
    }

    runInTransaction(this.database, () => {
      this.database.prepare("DELETE FROM video_tasks WHERE id = ?").run(taskId);
    });

    try {
      fs.rmSync(taskDirectory, { recursive: true, force: true });
    } catch (error) {
      console.warn(
        `Task ${taskId} was deleted from the database, but its media directory could not be removed.`,
        error
      );
    }
  }

  updateTask(input: UpdateTaskInput): VideoTask {
    const existing = this.getTask(input.taskId);
    if (!existing) {
      throw new Error(`Task ${input.taskId} was not found.`);
    }

    const now = new Date().toISOString();
    const title = input.title?.trim() || existing.title;
    const originalVideoUrl =
      input.originalVideoUrl === undefined
        ? (existing.originalVideoUrl ?? "")
        : input.originalVideoUrl.trim();
    const exportDirectory =
      input.exportDirectory === undefined
        ? (existing.exportDirectory ?? "")
        : input.exportDirectory.trim();
    const sourceScript =
      input.sourceScript === undefined ? existing.sourceScript : input.sourceScript.trim();
    const finalScript =
      input.finalScript === undefined ? existing.finalScript : input.finalScript.trim();
    const contentLanguage = normalizeContentLanguage(
      input.contentLanguage ?? existing.contentLanguage
    );
    const generationMode = normalizeGenerationMode(input.generationMode ?? existing.generationMode);
    const avatarMode = normalizeAvatarModeForGenerationMode(
      generationMode,
      input.avatarMode ?? existing.avatarMode
    );
    const presetAvatarId =
      input.presetAvatarId === undefined
        ? (existing.presetAvatarId ?? "")
        : input.presetAvatarId.trim();
    const presetAvatarGroupId =
      input.presetAvatarGroupId === undefined
        ? (existing.presetAvatarGroupId ?? "")
        : input.presetAvatarGroupId.trim();
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
    const referenceImageAssetId =
      input.referenceImageAssetId === undefined
        ? existing.referenceImageAssetId
        : input.referenceImageAssetId;
    const generatedPresenterImageAssetId =
      input.generatedPresenterImageAssetId === undefined
        ? existing.generatedPresenterImageAssetId
        : input.generatedPresenterImageAssetId;
    const generatedPresenterImageSelections = normalizeGeneratedPresenterImageSelections(
      input.generatedPresenterImageSelections ?? existing.generatedPresenterImageSelections
    );
    const customFontAssetId =
      input.customFontAssetId === undefined ? existing.customFontAssetId : input.customFontAssetId;
    const customFontFamily =
      input.customFontFamily === undefined
        ? (existing.customFontFamily ?? "")
        : input.customFontFamily.trim().slice(0, 80);
    const selectedOutputPresets = normalizeOutputPresetIds(
      input.selectedOutputPresets ?? existing.selectedOutputPresets
    );
    const frameTitleStyle = normalizeFrameTitleStyle(
      input.frameTitleStyle ?? existing.frameTitleStyle
    );
    const subtitleStyle = normalizeSubtitleStyle(input.subtitleStyle ?? existing.subtitleStyle);
    const coverStyle = normalizeCoverStyle(input.coverStyle ?? existing.coverStyle);
    const personalIpProfile = normalizePersonalIpProfile(
      input.personalIpProfile ?? existing.personalIpProfile
    );
    const creativeWorkflow = normalizeCreativeWorkflow(
      input.creativeWorkflow ?? existing.creativeWorkflow
    );

    runInTransaction(this.database, () => {
      this.database
        .prepare(
          `UPDATE video_tasks
           SET title = ?,
               original_video_url = ?,
               export_directory = ?,
               source_script = ?,
               final_script = ?,
               content_language = ?,
               generation_mode = ?,
               avatar_mode = ?,
               preset_avatar_id = ?,
               preset_avatar_group_id = ?,
               avatar_description_prompt = ?,
               motion_prompt = ?,
               product_image_asset_id = ?,
               reference_image_asset_id = ?,
               generated_presenter_image_asset_id = ?,
               generated_presenter_image_selections = ?,
               custom_font_asset_id = ?,
               custom_font_family = ?,
                selected_output_presets = ?,
                frame_title_style = ?,
               subtitle_style = ?,
               cover_style = ?,
               personal_ip_profile = ?,
               creative_workflow = ?,
               updated_at = ?
           WHERE id = ?`
        )
        .run(
          title,
          originalVideoUrl,
          exportDirectory,
          sourceScript,
          finalScript,
          contentLanguage,
          generationMode,
          avatarMode,
          presetAvatarId,
          presetAvatarGroupId,
          avatarDescriptionPrompt,
          motionPrompt,
          productImageAssetId ?? null,
          referenceImageAssetId ?? null,
          generatedPresenterImageAssetId ?? null,
          JSON.stringify(generatedPresenterImageSelections),
          customFontAssetId ?? null,
          customFontFamily,
          JSON.stringify(selectedOutputPresets),
          JSON.stringify(frameTitleStyle),
          JSON.stringify(subtitleStyle),
          JSON.stringify(coverStyle),
          JSON.stringify(personalIpProfile),
          JSON.stringify(creativeWorkflow),
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

  resetOutputVariants(taskId: string, presetIds: OutputPresetId[]): VideoTask {
    const now = new Date().toISOString();
    runInTransaction(this.database, () => {
      for (const presetId of presetIds) {
        this.database
          .prepare(
            `UPDATE output_variants
             SET status = 'waiting',
                 finished_video_path = NULL,
                 cover_image_path = NULL,
                 updated_at = ?
             WHERE task_id = ? AND preset_id = ?`
          )
          .run(now, taskId, presetId);
      }

      this.database.prepare("UPDATE video_tasks SET updated_at = ? WHERE id = ?").run(now, taskId);
    });

    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found after variant reset.`);
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
      originalVideoUrl: row.original_video_url ?? "",
      exportDirectory: row.export_directory ?? "",
      sourceScript: row.source_script,
      finalScript: row.final_script,
      similarityRisk: row.similarity_risk,
      scriptGenerationNotes: row.script_generation_notes,
      contentLanguage: normalizeContentLanguage(row.content_language),
      generationMode: normalizeGenerationMode(row.generation_mode),
      avatarMode: normalizeAvatarMode(row.avatar_mode),
      presetAvatarId: row.preset_avatar_id ?? "",
      presetAvatarGroupId: row.preset_avatar_group_id ?? "",
      avatarDescriptionPrompt: row.avatar_description_prompt,
      motionPrompt: row.motion_prompt,
      productImageAssetId: row.product_image_asset_id ?? undefined,
      referenceImageAssetId: row.reference_image_asset_id ?? undefined,
      generatedPresenterImageAssetId: row.generated_presenter_image_asset_id ?? undefined,
      generatedPresenterImageSelections: parseGeneratedPresenterImageSelections(
        row.generated_presenter_image_selections
      ),
      customFontAssetId: row.custom_font_asset_id ?? undefined,
      customFontFamily: row.custom_font_family ?? "",
      selectedOutputPresets: parseOutputPresetIds(row.selected_output_presets),
      frameTitleStyle: parseFrameTitleStyle(row.frame_title_style),
      subtitleStyle: parseSubtitleStyle(row.subtitle_style),
      coverStyle: parseCoverStyle(row.cover_style),
      personalIpProfile: parsePersonalIpProfile(row.personal_ip_profile),
      creativeWorkflow: parseCreativeWorkflow(row.creative_workflow),
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

function parseSubtitleStyle(value: string | null | undefined): SubtitleStyle {
  try {
    return normalizeSubtitleStyle(value ? (JSON.parse(value) as Partial<SubtitleStyle>) : {});
  } catch {
    return DEFAULT_SUBTITLE_STYLE;
  }
}

function parseFrameTitleStyle(value: string | null | undefined): FrameTitleStyle {
  try {
    return normalizeFrameTitleStyle(value ? (JSON.parse(value) as Partial<FrameTitleStyle>) : {});
  } catch {
    return DEFAULT_FRAME_TITLE_STYLE;
  }
}

function parseCoverStyle(value: string | null | undefined): CoverStyle {
  try {
    return normalizeCoverStyle(value ? (JSON.parse(value) as Partial<CoverStyle>) : {});
  } catch {
    return DEFAULT_COVER_STYLE;
  }
}

function parsePersonalIpProfile(value: string | null | undefined): PersonalIpProfile {
  try {
    return normalizePersonalIpProfile(
      value ? (JSON.parse(value) as Partial<PersonalIpProfile>) : {}
    );
  } catch {
    return DEFAULT_PERSONAL_IP_PROFILE;
  }
}

function parseCreativeWorkflow(value: string | null | undefined): CreativeWorkflow {
  try {
    return normalizeCreativeWorkflow(value ? (JSON.parse(value) as Partial<CreativeWorkflow>) : {});
  } catch {
    return DEFAULT_CREATIVE_WORKFLOW;
  }
}

function parseGeneratedPresenterImageSelections(
  value: string | null | undefined
): GeneratedPresenterImageSelections {
  try {
    return normalizeGeneratedPresenterImageSelections(
      value ? (JSON.parse(value) as GeneratedPresenterImageSelections) : {}
    );
  } catch {
    return {};
  }
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

function normalizeGenerationMode(value: string): VideoGenerationMode {
  return isVideoGenerationMode(value) ? value : "preset-avatar";
}

function normalizeAvatarModeForGenerationMode(
  generationMode: VideoGenerationMode,
  avatarMode: AvatarMode
): AvatarMode {
  if (generationMode === "image-lipsync") {
    return "image-presenter";
  }

  return normalizeAvatarMode(avatarMode);
}

function normalizeGeneratedPresenterImageSelections(
  value: GeneratedPresenterImageSelections | undefined
): GeneratedPresenterImageSelections {
  const selections: GeneratedPresenterImageSelections = {};
  if (!value || typeof value !== "object") {
    return selections;
  }

  for (const [presetId, assetId] of Object.entries(value)) {
    if (isOutputPresetId(presetId) && typeof assetId === "string" && assetId.trim()) {
      selections[presetId] = assetId.trim();
    }
  }

  return selections;
}

function normalizeSubtitleStyle(value: Partial<SubtitleStyle>): SubtitleStyle {
  return {
    ...DEFAULT_SUBTITLE_STYLE,
    ...value,
    enabled: value.enabled ?? DEFAULT_SUBTITLE_STYLE.enabled,
    position: isSubtitlePosition(value.position) ? value.position : DEFAULT_SUBTITLE_STYLE.position,
    verticalPercent: clampNumber(
      value.verticalPercent,
      5,
      92,
      DEFAULT_SUBTITLE_STYLE.verticalPercent
    ),
    fontFamily:
      typeof value.fontFamily === "string" && value.fontFamily.trim()
        ? value.fontFamily.trim().slice(0, 80)
        : DEFAULT_SUBTITLE_STYLE.fontFamily,
    fontSize: clampNumber(value.fontSize, 20, 72, DEFAULT_SUBTITLE_STYLE.fontSize),
    textColor: normalizeColor(value.textColor, DEFAULT_SUBTITLE_STYLE.textColor),
    backgroundColor: normalizeColor(value.backgroundColor, DEFAULT_SUBTITLE_STYLE.backgroundColor),
    fontWeight: value.fontWeight === "regular" ? "regular" : DEFAULT_SUBTITLE_STYLE.fontWeight
  };
}

function normalizeFrameTitleStyle(value: Partial<FrameTitleStyle>): FrameTitleStyle {
  return {
    ...DEFAULT_FRAME_TITLE_STYLE,
    ...value,
    enabled: value.enabled ?? DEFAULT_FRAME_TITLE_STYLE.enabled,
    text: typeof value.text === "string" ? value.text.slice(0, 80) : DEFAULT_FRAME_TITLE_STYLE.text,
    verticalPercent: clampNumber(
      value.verticalPercent,
      5,
      92,
      DEFAULT_FRAME_TITLE_STYLE.verticalPercent
    ),
    fontFamily:
      typeof value.fontFamily === "string" && value.fontFamily.trim()
        ? value.fontFamily.trim().slice(0, 80)
        : DEFAULT_FRAME_TITLE_STYLE.fontFamily,
    fontSize: clampNumber(value.fontSize, 24, 84, DEFAULT_FRAME_TITLE_STYLE.fontSize),
    textColor: normalizeColor(value.textColor, DEFAULT_FRAME_TITLE_STYLE.textColor),
    backgroundColor: normalizeColor(
      value.backgroundColor,
      DEFAULT_FRAME_TITLE_STYLE.backgroundColor
    ),
    fontWeight: value.fontWeight === "regular" ? "regular" : DEFAULT_FRAME_TITLE_STYLE.fontWeight
  };
}

function normalizeCoverStyle(value: Partial<CoverStyle>): CoverStyle {
  return {
    ...DEFAULT_COVER_STYLE,
    ...value,
    title: typeof value.title === "string" ? value.title.slice(0, 80) : DEFAULT_COVER_STYLE.title,
    subtitle:
      typeof value.subtitle === "string"
        ? value.subtitle.slice(0, 80)
        : DEFAULT_COVER_STYLE.subtitle,
    verticalPercent: clampNumber(value.verticalPercent, 8, 90, DEFAULT_COVER_STYLE.verticalPercent),
    fontFamily:
      typeof value.fontFamily === "string" && value.fontFamily.trim()
        ? value.fontFamily.trim().slice(0, 48)
        : DEFAULT_COVER_STYLE.fontFamily,
    fontSize: clampNumber(value.fontSize, 32, 96, DEFAULT_COVER_STYLE.fontSize),
    textColor: normalizeColor(value.textColor, DEFAULT_COVER_STYLE.textColor),
    backgroundColor: normalizeColor(value.backgroundColor, DEFAULT_COVER_STYLE.backgroundColor),
    accentColor: normalizeColor(value.accentColor, DEFAULT_COVER_STYLE.accentColor),
    fontWeight: value.fontWeight === "regular" ? "regular" : DEFAULT_COVER_STYLE.fontWeight
  };
}

function normalizePersonalIpProfile(value: Partial<PersonalIpProfile>): PersonalIpProfile {
  return {
    name: normalizeShortText(value.name, DEFAULT_PERSONAL_IP_PROFILE.name, 60),
    persona: normalizeLongText(value.persona, DEFAULT_PERSONAL_IP_PROFILE.persona, 800),
    tone: normalizeLongText(value.tone, DEFAULT_PERSONAL_IP_PROFILE.tone, 500),
    catchphrases: normalizeLongText(
      value.catchphrases,
      DEFAULT_PERSONAL_IP_PROFILE.catchphrases,
      500
    ),
    bannedWords: normalizeLongText(value.bannedWords, DEFAULT_PERSONAL_IP_PROFILE.bannedWords, 500)
  };
}

function normalizeCreativeWorkflow(value: Partial<CreativeWorkflow>): CreativeWorkflow {
  return {
    referenceAnalysis: normalizeLongText(
      value.referenceAnalysis,
      DEFAULT_CREATIVE_WORKFLOW.referenceAnalysis,
      4000
    ),
    sellingPoints: normalizeLongText(
      value.sellingPoints,
      DEFAULT_CREATIVE_WORKFLOW.sellingPoints,
      3000
    ),
    storyboard: normalizeLongText(value.storyboard, DEFAULT_CREATIVE_WORKFLOW.storyboard, 5000),
    dailyPipeline: normalizeLongText(
      value.dailyPipeline,
      DEFAULT_CREATIVE_WORKFLOW.dailyPipeline,
      3000
    ),
    aiVideoPrompt: normalizeLongText(
      value.aiVideoPrompt,
      DEFAULT_CREATIVE_WORKFLOW.aiVideoPrompt,
      3000
    ),
    mixedCutPlan: normalizeLongText(
      value.mixedCutPlan,
      DEFAULT_CREATIVE_WORKFLOW.mixedCutPlan,
      4000
    )
  };
}

function isSubtitlePosition(value: unknown): value is SubtitleStyle["position"] {
  return value === "top" || value === "middle" || value === "bottom";
}

function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeShortText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : fallback;
}

function normalizeLongText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : fallback;
}
