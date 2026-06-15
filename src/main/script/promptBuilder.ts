import type { ContentLanguage } from "../../shared/domain";

export interface ScriptPromptInput {
  sourceScript: string;
  contentLanguage: ContentLanguage;
}

export function buildScriptGenerationPrompt(input: ScriptPromptInput): string {
  const languageName = contentLanguageName(input.contentLanguage);

  return [
    "You are writing an original short-form talking-head sales script.",
    "Reuse only the reference structure: hook function, information order, emotional curve, pacing density, segment count, and CTA placement.",
    "Do not preserve distinctive wording, sentence rhythm, examples, metaphors, proof material, or creator catchphrases.",
    "Rewrite the first five seconds while keeping the same hook function.",
    "Do not write for plagiarism detection evasion. Write original expression for a real creator.",
    `Output language: ${languageName}.`,
    "",
    "Reference source script:",
    input.sourceScript.trim()
  ].join("\n");
}

export function contentLanguageName(language: ContentLanguage): string {
  const names: Record<ContentLanguage, string> = {
    "zh-CN": "Simplified Chinese",
    "en-US": "English",
    "id-ID": "Bahasa Indonesia"
  };

  return names[language];
}
