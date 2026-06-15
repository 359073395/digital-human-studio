import type { OutputPreset, VideoTask } from "../../shared/domain";

export interface SubtitleFallbackInput {
  task: VideoTask;
  preset: OutputPreset;
  avatarVideoPath: string;
}

export interface SubtitleFallbackResult {
  srt: string;
}

export interface SubtitleFallbackProvider {
  createSubtitleFile: (input: SubtitleFallbackInput) => Promise<SubtitleFallbackResult>;
}

export class SubtitleFallbackProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubtitleFallbackProviderUnavailableError";
  }
}
