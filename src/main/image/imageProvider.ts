import type { OutputPreset, VideoTask } from "../../shared/domain";

export interface ProductPresenterImageInput {
  task: VideoTask;
  preset: OutputPreset;
  productImagePath: string;
}

export interface ProductPresenterImageResult {
  imageBytes: Buffer;
  extension: "png" | "jpg" | "webp";
  promptPreview: string;
}

export interface ImageProvider {
  generateProductPresenterImage: (
    input: ProductPresenterImageInput
  ) => Promise<ProductPresenterImageResult>;
}

export class ImageProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageProviderUnavailableError";
  }
}
