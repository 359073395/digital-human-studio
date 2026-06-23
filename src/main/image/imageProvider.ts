import type { OutputPreset, VideoTask } from "../../shared/domain";

export interface ProductPresenterImageInput {
  task: VideoTask;
  preset: OutputPreset;
  productImagePath: string;
  knowledgeContextPrompt?: string;
}

export interface ProductPresenterImageResult {
  imageBytes: Buffer;
  extension: "png" | "jpg" | "webp";
  promptPreview: string;
}

export interface VisualStoryboardImageInput {
  prompt: string;
}

export interface VisualStoryboardImageResult {
  imageBytes: Buffer;
  extension: "png" | "jpg" | "webp";
  promptPreview: string;
}

export interface ImageProvider {
  generateProductPresenterImage: (
    input: ProductPresenterImageInput
  ) => Promise<ProductPresenterImageResult>;
  generateVisualStoryboardImage: (
    input: VisualStoryboardImageInput
  ) => Promise<VisualStoryboardImageResult>;
}

export class ImageProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageProviderUnavailableError";
  }
}
