import type {
  StoryScriptPackage,
  VisualStoryboardPackage,
  VisualStoryboardPanelCount,
  VideoTask
} from "../../shared/domain";

export interface VisualStoryboardGenerationInput {
  task: VideoTask;
  sourceBrief: string;
  panelCount: VisualStoryboardPanelCount;
}

export interface VisualStoryboardGenerationResult {
  storyboard: VisualStoryboardPackage;
  promptPreview: string;
}

export interface StoryScriptGenerationInput {
  task: VideoTask;
  sourceBrief: string;
}

export interface StoryScriptGenerationResult {
  scriptPackage: StoryScriptPackage;
  promptPreview: string;
}

export interface StoryboardProvider {
  generateStoryScriptOptions: (
    input: StoryScriptGenerationInput
  ) => Promise<StoryScriptGenerationResult>;
  generateVisualStoryboard: (
    input: VisualStoryboardGenerationInput
  ) => Promise<VisualStoryboardGenerationResult>;
}

export class StoryboardProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryboardProviderUnavailableError";
  }
}
