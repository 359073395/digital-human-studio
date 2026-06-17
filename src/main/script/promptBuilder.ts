import type {
  ContentLanguage,
  CreativeWorkflow,
  PersonalIpProfile,
  VideoGenerationMode
} from "../../shared/domain";

export interface ScriptPromptInput {
  sourceScript: string;
  contentLanguage: ContentLanguage;
  generationMode?: VideoGenerationMode;
  personalIpProfile?: PersonalIpProfile;
  creativeWorkflow?: CreativeWorkflow;
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
    ...creativeWorkflowInstructionLines(input.creativeWorkflow),
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

function creativeWorkflowInstructionLines(workflow: CreativeWorkflow | undefined): string[] {
  if (!workflow) {
    return [];
  }

  const lines = [
    workflow.referenceAnalysis
      ? `Reference analysis to reuse as mechanics:\n${workflow.referenceAnalysis}`
      : "",
    workflow.sellingPoints
      ? `Product selling points and selection notes:\n${workflow.sellingPoints}`
      : "",
    workflow.storyboard
      ? `Storyboard or shot plan to align the script with:\n${workflow.storyboard}`
      : "",
    workflow.dailyPipeline ? `Personal IP daily production plan:\n${workflow.dailyPipeline}` : "",
    workflow.aiVideoPrompt
      ? `AI video or image prompt constraints:\n${workflow.aiVideoPrompt}`
      : "",
    workflow.mixedCutPlan ? `Mixed-cut and B-roll plan:\n${workflow.mixedCutPlan}` : ""
  ].filter(Boolean);

  return lines.length > 0
    ? [
        "",
        "Creative workflow notes. Use them as planning constraints, not as copy to duplicate.",
        ...lines
      ]
    : [];
}
