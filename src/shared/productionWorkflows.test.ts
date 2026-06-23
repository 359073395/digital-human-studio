// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { VideoGenerationMode } from "./domain";
import {
  getProductionModeWorkflow,
  productionWorkflowPromptLines,
  storyboardWorkflowPromptLines
} from "./productionWorkflows";

const MODES: VideoGenerationMode[] = [
  "preset-avatar",
  "product-avatar",
  "image-lipsync",
  "personal-ip",
  "viral-remix",
  "mixed-cut"
];

describe("production workflow registry", () => {
  it("defines a built-in workflow for every video mode", () => {
    for (const mode of MODES) {
      const workflow = getProductionModeWorkflow(mode);

      expect(workflow.mode).toBe(mode);
      expect(workflow.builtInMethods.length).toBeGreaterThan(0);
      expect(workflow.defaultInputs.length).toBeGreaterThan(0);
      expect(workflow.stages.length).toBeGreaterThanOrEqual(3);
      expect(workflow.stages.every((stage) => stage.outputs.length > 0)).toBe(true);
    }
  });

  it("exposes learned methods as workflow prompt lines, not only loose copy text", () => {
    const viralLines = productionWorkflowPromptLines("viral-remix").join("\n");
    const productLines = productionWorkflowPromptLines("product-avatar").join("\n");
    const mixedCutLines = productionWorkflowPromptLines("mixed-cut").join("\n");

    expect(viralLines).toContain("Claude Code style video breakdown");
    expect(viralLines).toContain("Image2 unified storyboard");
    expect(productLines).toContain("GPT Image 2 product-presenter image workflow");
    expect(productLines).toContain("静态图不合格时不能进入 HeyGen");
    expect(mixedCutLines).toContain("混剪模式不能只产出数字人口播占位");
  });

  it("provides storyboard-specific stages for viral remix planning", () => {
    const lines = storyboardWorkflowPromptLines("viral-remix").join("\n");

    expect(lines).toContain("复刻策略");
    expect(lines).toContain("分镜提示词与故事板");
    expect(lines).toContain("分镜数量可自动，不固定九宫格");
  });
});
