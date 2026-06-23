import fs from "node:fs";
import path from "node:path";
import type { MediaAsset, VideoTask } from "../../shared/domain";
import { getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { selectBuiltInKnowledge } from "./builtinShortVideoKnowledge";

export type KnowledgeContextPurpose = "script" | "storyboard" | "presenter-image" | "motion";

export interface KnowledgeSourceCounts {
  builtIn: number;
  uploadedKnowledge: number;
  viralReferences: number;
  taskAssets: number;
}

export interface KnowledgeContext {
  promptText: string;
  previewText: string;
  sourceCounts: KnowledgeSourceCounts;
  hasCurrentTaskInput: boolean;
}

const TEXT_ASSET_EXTENSIONS = new Set([".txt", ".md", ".json", ".csv"]);
const UPLOADED_KNOWLEDGE_KINDS = new Set<MediaAsset["kind"]>([
  "knowledge-document",
  "viral-copy-reference"
]);
const TASK_CONTEXT_ASSET_KINDS = new Set<MediaAsset["kind"]>([
  "source-video",
  "source-audio",
  "source-transcript",
  "source-visual-analysis",
  "story-script-options",
  "visual-storyboard",
  "product-image",
  "reference-image",
  "mixed-cut-material",
  "mixed-cut-video",
  "generated-presenter-image",
  "avatar-video",
  "subtitle-file"
]);

export function buildKnowledgeContext(
  paths: AppPaths,
  task: VideoTask,
  purpose: KnowledgeContextPurpose
): KnowledgeContext {
  const builtInEntries = selectBuiltInKnowledge(task.generationMode);
  const uploadedKnowledgeAssets = task.mediaAssets.filter(
    (asset) => asset.kind === "knowledge-document"
  );
  const viralReferenceAssets = task.mediaAssets.filter(
    (asset) => asset.kind === "viral-copy-reference"
  );
  const taskContextAssets = task.mediaAssets.filter((asset) =>
    TASK_CONTEXT_ASSET_KINDS.has(asset.kind)
  );
  const taskFacts = collectTaskFacts(paths, task);
  const uploadedKnowledge = renderUploadedAssets(paths, task, uploadedKnowledgeAssets, 4200);
  const viralReferences = renderUploadedAssets(paths, task, viralReferenceAssets, 4200);
  const taskAssetIndex = renderTaskAssetIndex(taskContextAssets);
  const hasCurrentTaskInput =
    taskFacts.some((item) => item.content.trim()) ||
    uploadedKnowledgeAssets.length > 0 ||
    viralReferenceAssets.length > 0 ||
    taskContextAssets.length > 0;

  const sourceCounts: KnowledgeSourceCounts = {
    builtIn: builtInEntries.length,
    uploadedKnowledge: uploadedKnowledgeAssets.length,
    viralReferences: viralReferenceAssets.length,
    taskAssets: taskContextAssets.length + taskFacts.filter((item) => item.content.trim()).length
  };

  const promptText = [
    "Unified knowledge context for AI generation.",
    `Purpose: ${purpose}.`,
    `Video mode: ${task.generationMode}.`,
    `Content language: ${task.contentLanguage}.`,
    "",
    "Priority rules:",
    "- Product facts, prices, banned words, uploaded product material, and user-edited final script override older knowledge.",
    "- Viral cases are used only for structure, hook function, pacing, proof type, emotional curve, and CTA mechanics.",
    "- Do not copy exact wording, creator catchphrases, distinctive scene signatures, or unsupported claims from viral references.",
    "- When facts are missing, generate a low-risk draft and clearly note what the user should verify.",
    "",
    "Layer 1 - Built-in summarized knowledge:",
    renderBuiltInEntries(builtInEntries),
    "",
    "Layer 2 - User uploaded long-term knowledge and viral cases:",
    uploadedKnowledge || "No uploaded knowledge documents in this task.",
    viralReferences ? `\nUploaded viral-copy/video cases:\n${viralReferences}` : "",
    "",
    "Layer 3 - Current task material and analysis:",
    renderTaskFacts(taskFacts),
    taskAssetIndex ? `\nCurrent task asset index:\n${taskAssetIndex}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const previewText = [
    "# Knowledge Context Preview",
    "",
    `Task: ${task.title}`,
    `Purpose: ${purpose}`,
    `Mode: ${task.generationMode}`,
    `Counts: built-in ${sourceCounts.builtIn}, uploaded knowledge ${sourceCounts.uploadedKnowledge}, viral cases ${sourceCounts.viralReferences}, current task sources ${sourceCounts.taskAssets}`,
    "",
    promptText
  ].join("\n");

  return {
    promptText,
    previewText,
    sourceCounts,
    hasCurrentTaskInput
  };
}

export function writeKnowledgeContextPreview(
  paths: AppPaths,
  taskId: string,
  context: KnowledgeContext
): void {
  const absolutePath = path.join(
    getTaskDirectory(paths, taskId),
    "source",
    "knowledge-context-preview.txt"
  );
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, context.previewText, "utf8");
}

function renderBuiltInEntries(entries: ReturnType<typeof selectBuiltInKnowledge>): string {
  return entries
    .map((entry, index) =>
      [
        `${index + 1}. ${entry.title} (${entry.id})`,
        ...entry.lines.map((line) => `   - ${line}`)
      ].join("\n")
    )
    .join("\n\n");
}

function collectTaskFacts(
  paths: AppPaths,
  task: VideoTask
): Array<{ label: string; content: string }> {
  const visualAnalysis = readLatestAssetText(paths, task, "source-visual-analysis", 6000);
  const sourceTranscript = readLatestAssetText(paths, task, "source-transcript", 6000);
  const storyScriptOptions = readLatestAssetText(paths, task, "story-script-options", 7000);
  const visualStoryboard = readLatestAssetText(paths, task, "visual-storyboard", 7000);
  const personalIp = [
    task.personalIpProfile.name ? `Name: ${task.personalIpProfile.name}` : "",
    task.personalIpProfile.persona ? `Persona: ${task.personalIpProfile.persona}` : "",
    task.personalIpProfile.tone ? `Tone: ${task.personalIpProfile.tone}` : "",
    task.personalIpProfile.catchphrases
      ? `Catchphrases to avoid copying blindly: ${task.personalIpProfile.catchphrases}`
      : "",
    task.personalIpProfile.bannedWords ? `Banned words: ${task.personalIpProfile.bannedWords}` : ""
  ]
    .filter(Boolean)
    .join("\n");
  const creativeWorkflow = [
    task.creativeWorkflow.referenceAnalysis
      ? `Reference analysis:\n${task.creativeWorkflow.referenceAnalysis}`
      : "",
    task.creativeWorkflow.sellingPoints
      ? `Selling points:\n${task.creativeWorkflow.sellingPoints}`
      : "",
    task.creativeWorkflow.storyboard ? `Storyboard:\n${task.creativeWorkflow.storyboard}` : "",
    task.creativeWorkflow.dailyPipeline
      ? `Daily/IP pipeline:\n${task.creativeWorkflow.dailyPipeline}`
      : "",
    task.creativeWorkflow.aiVideoPrompt
      ? `AI video prompt:\n${task.creativeWorkflow.aiVideoPrompt}`
      : "",
    task.creativeWorkflow.mixedCutPlan
      ? `Mixed-cut plan:\n${task.creativeWorkflow.mixedCutPlan}`
      : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { label: "Original video URL", content: task.originalVideoUrl?.trim() ?? "" },
    { label: "Source copy or task brief", content: task.sourceScript.trim() },
    { label: "Confirmed editable script", content: task.finalScript.trim() },
    { label: "Source transcript", content: sourceTranscript },
    { label: "Visual/person description prompt", content: task.avatarDescriptionPrompt.trim() },
    { label: "Motion prompt", content: task.motionPrompt.trim() },
    { label: "Personal IP profile", content: personalIp },
    { label: "Visual analysis", content: visualAnalysis },
    { label: "Generated story script options", content: storyScriptOptions },
    { label: "Generated visual storyboard", content: visualStoryboard },
    { label: "Creative workflow fields", content: creativeWorkflow }
  ];
}

function renderTaskFacts(items: Array<{ label: string; content: string }>): string {
  const rendered = items
    .filter((item) => item.content.trim())
    .map((item, index) => `${index + 1}. ${item.label}:\n${item.content.trim()}`)
    .join("\n\n");

  return rendered || "No current task text, analysis, or editable script has been provided yet.";
}

function renderUploadedAssets(
  paths: AppPaths,
  task: VideoTask,
  assets: MediaAsset[],
  maxLength: number
): string {
  return assets
    .slice(-10)
    .map((asset, index) => {
      const text = readTextAsset(paths, task, asset, maxLength);
      const label = asset.kind === "viral-copy-reference" ? "Viral case" : "Knowledge document";
      if (!text) {
        return `${index + 1}. ${label}: ${asset.relativePath} (uploaded and indexed; non-text or unreadable content will be treated as a material reference)`;
      }
      return `${index + 1}. ${label}: ${asset.relativePath}\n${text}`;
    })
    .join("\n\n");
}

function renderTaskAssetIndex(assets: MediaAsset[]): string {
  return assets
    .slice(-30)
    .map((asset, index) => `${index + 1}. ${asset.kind}: ${asset.relativePath}`)
    .join("\n");
}

function readLatestAssetText(
  paths: AppPaths,
  task: VideoTask,
  kind: MediaAsset["kind"],
  maxLength: number
): string {
  const asset = [...task.mediaAssets].reverse().find((candidate) => candidate.kind === kind);
  if (!asset) {
    return "";
  }

  return readTextAsset(paths, task, asset, maxLength);
}

function readTextAsset(
  paths: AppPaths,
  task: VideoTask,
  asset: MediaAsset,
  maxLength: number
): string {
  if (!TEXT_ASSET_EXTENSIONS.has(path.extname(asset.relativePath).toLowerCase())) {
    return "";
  }

  const absolutePath = path.join(
    getTaskDirectory(paths, task.id),
    ...asset.relativePath.split("/")
  );
  try {
    return fs.readFileSync(absolutePath, "utf8").slice(0, maxLength);
  } catch {
    return "";
  }
}

export function isKnowledgeContextAsset(asset: MediaAsset): boolean {
  return UPLOADED_KNOWLEDGE_KINDS.has(asset.kind) || TASK_CONTEXT_ASSET_KINDS.has(asset.kind);
}
