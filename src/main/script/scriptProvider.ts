import type { ScriptGenerationResult } from "../../shared/scriptGeneration";
import type { VideoTask } from "../../shared/domain";

export interface ScriptProvider {
  generate: (task: VideoTask) => Promise<ScriptGenerationResult>;
}

export class ScriptProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptProviderUnavailableError";
  }
}
