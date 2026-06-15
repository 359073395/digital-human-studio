import type { OutputPreset, OutputPresetId, VideoTask } from "../../shared/domain";

export interface AvatarRenderInput {
  task: VideoTask;
  preset: OutputPreset;
}

export interface AvatarRenderResult {
  presetId: OutputPresetId;
  providerVideoId: string;
  videoUrl: string;
  captionUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
}

export interface AvatarProvider {
  renderAvatar: (input: AvatarRenderInput) => Promise<AvatarRenderResult>;
}

export class AvatarProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvatarProviderUnavailableError";
  }
}
