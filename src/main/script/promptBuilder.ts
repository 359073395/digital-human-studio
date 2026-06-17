import type { ContentLanguage, PersonalIpProfile, VideoGenerationMode } from "../../shared/domain";
import { methodAnalysisInstructionLines } from "./methodAnalysis";

export interface ScriptPromptInput {
  sourceScript: string;
  originalVideoUrl?: string;
  contentLanguage: ContentLanguage;
  generationMode?: VideoGenerationMode;
  personalIpProfile?: PersonalIpProfile;
}

export function buildScriptGenerationPrompt(input: ScriptPromptInput): string {
  const languageName = contentLanguageName(input.contentLanguage);

  return [
    "You are a short-form video strategy and script engine.",
    "You must analyze first, then write. Never jump directly from raw reference text to a rewritten script.",
    "Reuse only useful mechanics: hook function, information order, emotional curve, pacing density, proof type, visual role, and CTA placement.",
    "Do not preserve distinctive wording, sentence rhythm, examples, metaphors, proof material, or creator catchphrases.",
    "Rewrite the first five seconds while keeping the same hook function.",
    "Do not write for plagiarism detection evasion. Write original expression for a real creator.",
    `Output language: ${languageName}.`,
    ...methodAnalysisInstructionLines(input),
    "",
    input.originalVideoUrl?.trim() ? `Reference video URL: ${input.originalVideoUrl.trim()}` : "",
    "Source copy or task brief:",
    input.sourceScript.trim()
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function contentLanguageName(language: ContentLanguage): string {
  const names: Record<ContentLanguage, string> = {
    "zh-CN": "Simplified Chinese",
    "en-US": "English",
    "id-ID": "Bahasa Indonesia"
  };

  return names[language];
}
