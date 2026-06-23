import type { VisualStoryboardGenerationInput } from "./storyboardProvider";
import { contentLanguageName } from "../script/promptBuilder";
import { storyboardProductionMethodLines } from "../script/productionMethodLibrary";

export function buildStoryScriptOptionsPrompt(input: {
  task: VisualStoryboardGenerationInput["task"];
  sourceBrief: string;
}): string {
  return [
    "You are a short-form commerce script strategist.",
    "Your task is to analyze source material first, then create multiple editable drama-commerce script options.",
    "This is a planning stage before visual storyboard generation.",
    "Reuse only abstract mechanics from references: hook function, conflict, proof type, pacing, emotional turn, conversion logic, and CTA placement.",
    "Do not copy distinctive wording, creator persona, catchphrases, jokes, music signature, exact shot sequence, or protected expression.",
    "Avoid unsupported claims, fake testimonials, medical guarantees, financial guarantees, or misleading urgency.",
    `Output language for scripts and user-facing text: ${contentLanguageName(input.task.contentLanguage)}.`,
    ...storyboardProductionMethodLines({ generationMode: input.task.generationMode }),
    "",
    input.task.originalVideoUrl?.trim()
      ? `Reference video URL: ${input.task.originalVideoUrl.trim()}`
      : "Reference video URL: not provided",
    `Task title: ${input.task.title}`,
    `Video mode: ${input.task.generationMode}`,
    "",
    "Source material brief:",
    input.sourceBrief.trim(),
    "",
    "Return 3 to 5 options. Each option must be different in angle, first five seconds, proof path, and conversion CTA.",
    "The recommended option should be the safest and most practical one to turn into a visual storyboard.",
    "",
    "Return only valid JSON in this exact shape:",
    JSON.stringify(
      {
        title: "short package title",
        productAnalysis:
          "audience, pain points, use cases, product facts, objections, proof opportunities",
        referenceMechanics:
          "abstract mechanics learned from the reference without copying expression",
        conversionStrategy: "how the script turns attention into trust and action",
        options: [
          {
            id: "A",
            title: "option title",
            angle: "story angle",
            targetAudience: "who this is for",
            hook: "first 3-5 seconds hook in original wording",
            beatSheet: [
              "0-3s first-frame hook",
              "3-8s conflict or pain",
              "8-18s proof/demo/story",
              "18-28s result or objection handling",
              "28-35s CTA"
            ],
            script: "complete editable voiceover or dialogue script",
            reason: "why this option should convert",
            riskNotes: "claim/compliance/originality risks to watch"
          }
        ],
        recommendedOptionId: "A",
        originalityNotes: "what changed from the reference and why it is original"
      },
      null,
      2
    )
  ].join("\n");
}

export function buildVisualStoryboardPrompt(input: VisualStoryboardGenerationInput): string {
  const panelRule =
    input.panelCount === "auto"
      ? "Let the model choose 6 to 12 panels based on content density. Do not default to 9 unless it is truly the best shape."
      : `Use exactly ${input.panelCount} panels.`;

  return [
    "You are a short-form video storyboard director for viral remix workflows.",
    "Your task is to create a visual storyboard package that can guide image-to-video generation.",
    "Use the confirmed editable script as the source of truth when it is present. Do not rewrite product facts, prices, claims, or CTA from that script.",
    "Reuse only reference mechanics: hook function, beat order, proof type, pacing density, visual role, emotional turn, and CTA placement.",
    "Do not copy distinctive wording, creator persona, catchphrases, jokes, music signature, exact shot signature, or protected expression.",
    "The output must be practical for Seedance, Jimeng, Kling, Wan, Cosmos, or other image-to-video models.",
    `Output language for user-facing text: ${contentLanguageName(input.task.contentLanguage)}.`,
    panelRule,
    "",
    "Important visual rule:",
    "Create a single visual storyboard image prompt, not separate unrelated images.",
    "The storyboard must keep protagonist face, clothing, product shape, scene, color palette, lighting, lens style, and subtitle-safe area consistent across panels.",
    "Each panel should be clearly numbered and easy for a video-generation model to understand.",
    ...storyboardProductionMethodLines({ generationMode: input.task.generationMode }),
    "",
    input.task.originalVideoUrl?.trim()
      ? `Reference video URL: ${input.task.originalVideoUrl.trim()}`
      : "Reference video URL: not provided",
    `Task title: ${input.task.title}`,
    `Video mode: ${input.task.generationMode}`,
    "",
    "Source material brief:",
    input.sourceBrief.trim(),
    "",
    "Return only valid JSON in this exact shape:",
    JSON.stringify(
      {
        title: "short working title",
        sourceSummary: "what the reference/source is doing",
        remakeStrategy: "what mechanics to keep and what expression to replace",
        productAnalysis:
          "product, audience, pain points, use cases, objections, proof opportunities",
        referenceMechanics: "abstract reference mechanics reused safely",
        selectedScript: "confirmed editable script used to create this storyboard",
        panelCount: 8,
        layout: "2x4 visual storyboard",
        visualBible: {
          protagonist: "consistent protagonist description",
          product: "consistent product description",
          wardrobe: "consistent wardrobe",
          location: "consistent location",
          lighting: "consistent lighting",
          colorPalette: "consistent color palette",
          cameraStyle: "consistent camera style",
          subtitleSafeSpace: "where captions can sit safely",
          consistencyLocks: ["face stays consistent", "product shape stays consistent"]
        },
        shots: [
          {
            shotNumber: 1,
            durationSeconds: 3,
            shotType: "first frame / close-up / product macro / POV / proof shot",
            visualAction: "what is visible",
            subjectAction: "what the person or subject does",
            productAction: "how product or key object appears",
            voiceoverOrText: "spoken line or on-screen text",
            cameraMovement: "push in / pan / handheld / static",
            imagePrompt: "image prompt for this shot",
            videoMotionPrompt: "motion prompt for image-to-video",
            negativePrompt: "things to avoid",
            continuityNotes: "how it connects to adjacent shots"
          }
        ],
        boardImagePrompt: "single prompt for one multi-panel visual storyboard image",
        wholeVideoPrompt: "one prompt for future full-video generation"
      },
      null,
      2
    )
  ].join("\n");
}

export function buildCompactVisualStoryboardPrompt(input: VisualStoryboardGenerationInput): string {
  const panelRule =
    input.panelCount === "auto"
      ? "Choose 6 to 9 panels based on content density."
      : `Use exactly ${input.panelCount} panels.`;
  const confirmedScript =
    input.task.finalScript.trim() || input.task.sourceScript.trim() || "No confirmed script.";

  return [
    "Create an original visual storyboard package for a short-form video.",
    "This is a compact retry prompt after the full context timed out.",
    "Keep the abstract reference mechanics, but replace expression, wording, character signatures, exact shot signatures, and creator-specific style.",
    "Prioritize: consistent protagonist, product/object, wardrobe, scene, lighting, color palette, camera style, and subtitle-safe area.",
    `Output language for user-facing text: ${contentLanguageName(input.task.contentLanguage)}.`,
    panelRule,
    "",
    input.task.originalVideoUrl?.trim()
      ? `Reference video URL: ${input.task.originalVideoUrl.trim()}`
      : "Reference video URL: not provided",
    `Task title: ${input.task.title}`,
    `Video mode: ${input.task.generationMode}`,
    "",
    "Confirmed editable script:",
    compactText(confirmedScript, 1800),
    "",
    "Compact source brief:",
    compactText(input.sourceBrief, 3600),
    "",
    "Return only valid JSON in this shape:",
    JSON.stringify({
      title: "short working title",
      sourceSummary: "what the source is doing",
      remakeStrategy: "mechanics to keep and expression to replace",
      productAnalysis: "product/audience/pain/use case/objection/proof",
      referenceMechanics: "abstract mechanics reused safely",
      selectedScript: "confirmed editable script",
      panelCount: 8,
      layout: "2x4 visual storyboard",
      visualBible: {
        protagonist: "consistent protagonist description",
        product: "consistent product or key object",
        wardrobe: "consistent wardrobe",
        location: "consistent location",
        lighting: "consistent lighting",
        colorPalette: "consistent palette",
        cameraStyle: "consistent camera style",
        subtitleSafeSpace: "caption-safe area",
        consistencyLocks: ["same face", "same product", "same scene"]
      },
      shots: [
        {
          shotNumber: 1,
          durationSeconds: 3,
          shotType: "first frame / proof / demo / CTA",
          visualAction: "what is visible",
          subjectAction: "what the subject does",
          productAction: "how product or key object appears",
          voiceoverOrText: "spoken line or on-screen text",
          cameraMovement: "push in / pan / static",
          imagePrompt: "image prompt for this panel",
          videoMotionPrompt: "motion prompt for image-to-video",
          negativePrompt: "things to avoid",
          continuityNotes: "connection to adjacent shots"
        }
      ],
      boardImagePrompt: "single prompt for one multi-panel visual storyboard image",
      wholeVideoPrompt: "one prompt for future full-video generation"
    })
  ].join("\n");
}

function compactText(value: string, maxLength: number): string {
  return value
    .replace(/\r?\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, maxLength);
}
