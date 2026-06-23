// @vitest-environment node

import { describe, expect, it } from "vitest";
import { DEFAULT_CREATIVE_WORKFLOW, DEFAULT_PERSONAL_IP_PROFILE } from "../../shared/domain";
import {
  buildStoryScriptOptionsPrompt,
  buildVisualStoryboardPrompt
} from "./visualStoryboardPromptBuilder";

const baseTask = {
  id: "task-1",
  title: "Viral remix",
  originalVideoUrl: "https://example.com/video",
  exportDirectory: "",
  sourceScript: "Reference script with hook and proof.",
  finalScript: "Confirmed editable script.",
  similarityRisk: "unknown" as const,
  scriptGenerationNotes: "",
  contentLanguage: "zh-CN" as const,
  generationMode: "viral-remix" as const,
  avatarMode: "preset-avatar" as const,
  presetAvatarId: "",
  avatarDescriptionPrompt: "",
  motionPrompt: "",
  customFontFamily: "",
  selectedOutputPresets: ["portrait-9-16" as const],
  frameTitleStyle: {
    enabled: true,
    text: "",
    verticalPercent: 18,
    fontFamily: "Microsoft YaHei",
    fontSize: 42,
    textColor: "#ffffff",
    backgroundColor: "#111827",
    fontWeight: "bold" as const
  },
  subtitleStyle: {
    enabled: true,
    position: "bottom" as const,
    verticalPercent: 82,
    fontFamily: "Microsoft YaHei",
    fontSize: 34,
    textColor: "#ffffff",
    backgroundColor: "#111827",
    fontWeight: "bold" as const
  },
  coverStyle: {
    title: "",
    subtitle: "",
    verticalPercent: 54,
    fontFamily: "Microsoft YaHei",
    fontSize: 56,
    textColor: "#ffffff",
    backgroundColor: "#152238",
    accentColor: "#3b82f6",
    fontWeight: "bold" as const
  },
  personalIpProfile: DEFAULT_PERSONAL_IP_PROFILE,
  creativeWorkflow: DEFAULT_CREATIVE_WORKFLOW,
  steps: [],
  outputVariants: [],
  mediaAssets: [],
  publishingPackage: {
    title: "",
    description: "",
    tags: [],
    notes: ""
  },
  createdAt: "2026-06-23T00:00:00.000Z",
  updatedAt: "2026-06-23T00:00:00.000Z"
};

describe("visual storyboard prompt builder", () => {
  it("embeds learned video breakdown and image2 storyboard methods", () => {
    const scriptPrompt = buildStoryScriptOptionsPrompt({
      task: baseTask,
      sourceBrief: "Source material brief."
    });
    const storyboardPrompt = buildVisualStoryboardPrompt({
      task: baseTask,
      sourceBrief: "Source material brief.",
      panelCount: 8
    });

    expect(scriptPrompt).toContain("Built-in storyboard and image-to-video method library");
    expect(scriptPrompt).toContain("Viral reference breakdown method");
    expect(storyboardPrompt).toContain("Image2 storyboard method");
    expect(storyboardPrompt).toContain("Seedance/Jimeng/Kling");
    expect(storyboardPrompt).toContain("continuity");
  });
});
