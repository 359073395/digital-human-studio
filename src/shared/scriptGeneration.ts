import type { ContentLanguage, SimilarityRisk } from "./domain";

export interface ScriptGenerationInput {
  taskId: string;
}

export interface SourceTranscriptionInput {
  taskId: string;
}

export interface ScriptGenerationResult {
  finalScript: string;
  similarityRisk: SimilarityRisk;
  notes: string;
  promptPreview: string;
}

export interface SourceTranscriptionResult {
  transcript: string;
  contentLanguage: ContentLanguage;
  notes: string;
}
