import type { ContentLanguage, PersonalIpProfile, VideoGenerationMode } from "../../shared/domain";

export interface ScriptPromptInput {
  sourceScript: string;
  contentLanguage: ContentLanguage;
  generationMode?: VideoGenerationMode;
  personalIpProfile?: PersonalIpProfile;
}

export function buildScriptGenerationPrompt(input: ScriptPromptInput): string {
  const languageName = contentLanguageName(input.contentLanguage);
  const modeLines = generationModeInstructionLines(input);

  return [
    "You are writing an original short-form talking-head sales script.",
    "Reuse only the reference structure: hook function, information order, emotional curve, pacing density, segment count, and CTA placement.",
    "Do not preserve distinctive wording, sentence rhythm, examples, metaphors, proof material, or creator catchphrases.",
    "Rewrite the first five seconds while keeping the same hook function.",
    "Do not write for plagiarism detection evasion. Write original expression for a real creator.",
    `Output language: ${languageName}.`,
    ...modeLines,
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

function generationModeInstructionLines(input: ScriptPromptInput): string[] {
  if (input.generationMode === "viral-remix") {
    return [
      "Mode: viral structure remix.",
      "Keep abstract mechanics only: hook job, pacing, reveal order, proof type, emotional turn, and CTA position.",
      "Change the concrete wording, examples, scene framing, jokes, creator persona, and any distinctive phrases."
    ];
  }

  if (input.generationMode === "personal-ip") {
    const profile = input.personalIpProfile;
    return [
      "Mode: personal IP talking-head video.",
      profile?.name ? `Creator/IP name: ${profile.name}.` : "",
      profile?.persona ? `Creator persona: ${profile.persona}.` : "",
      profile?.tone ? `Tone: ${profile.tone}.` : "",
      profile?.catchphrases ? `Allowed recurring phrases: ${profile.catchphrases}.` : "",
      profile?.bannedWords ? `Avoid these words or phrases: ${profile.bannedWords}.` : ""
    ].filter(Boolean);
  }

  if (input.generationMode === "product-avatar") {
    return [
      "Mode: product commerce digital-human video. Make the product use case visually concrete."
    ];
  }

  if (input.generationMode === "image-lipsync") {
    return ["Mode: image lip-sync video. Write natural spoken copy for a single presenter image."];
  }

  return ["Mode: preset avatar talking-head video."];
}
