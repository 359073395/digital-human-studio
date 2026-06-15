import type { ContentLanguage, OutputPreset } from "../../shared/domain";

export interface ProductPresenterPromptInput {
  avatarDescriptionPrompt: string;
  motionPrompt: string;
  contentLanguage: ContentLanguage;
  preset: OutputPreset;
}

export function buildProductPresenterImagePrompt(input: ProductPresenterPromptInput): string {
  return [
    "Create a realistic product presenter image for a short-form commerce video.",
    `Output format: ${input.preset.aspectRatio} composition, safe for ${input.preset.label}.`,
    `Content language context: ${input.contentLanguage}.`,
    "",
    "Presenter description:",
    input.avatarDescriptionPrompt.trim(),
    "",
    "Product handling and pose:",
    input.motionPrompt.trim() ||
      "The presenter naturally holds the product toward the camera with a friendly selling posture.",
    "",
    "Use the uploaded product image as the exact product reference.",
    "Keep the product recognizable. Do not alter logos, packaging text, or product shape unless needed for perspective.",
    "Use a clean commercial scene with enough empty space for subtitles.",
    "The image should be suitable as the source for lip-sync video generation."
  ].join("\n");
}

export function imageSizeForPreset(preset: OutputPreset): "1024x1536" | "1536x1024" {
  return preset.aspectRatio === "9:16" ? "1024x1536" : "1536x1024";
}
