// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildScriptGenerationPrompt, contentLanguageName } from "./promptBuilder";

describe("script prompt builder", () => {
  it("builds an originality-focused prompt for Indonesian scripts", () => {
    const prompt = buildScriptGenerationPrompt({
      contentLanguage: "id-ID",
      sourceScript: "Referensi hook."
    });

    expect(contentLanguageName("id-ID")).toBe("Bahasa Indonesia");
    expect(prompt).toContain("Output language: Bahasa Indonesia.");
    expect(prompt).toContain("Do not write for plagiarism detection evasion.");
    expect(prompt).toContain("Rewrite the first five seconds");
  });

  it("includes editable creative workflow notes as planning constraints", () => {
    const prompt = buildScriptGenerationPrompt({
      contentLanguage: "zh-CN",
      generationMode: "viral-remix",
      sourceScript: "参考视频文案。",
      creativeWorkflow: {
        referenceAnalysis: "拆解钩子、节奏和 CTA。",
        sellingPoints: "目标人群和证明材料。",
        storyboard: "0-5 秒新钩子，5-20 秒证明。",
        dailyPipeline: "",
        aiVideoPrompt: "人物拿产品，嘴部无遮挡。",
        mixedCutPlan: "B-roll 使用自有素材。"
      }
    });

    expect(prompt).toContain(
      "Creative workflow notes. Use them as planning constraints, not as copy to duplicate."
    );
    expect(prompt).toContain("Reference analysis to reuse as mechanics");
    expect(prompt).toContain("拆解钩子、节奏和 CTA。");
    expect(prompt).toContain("人物拿产品，嘴部无遮挡。");
    expect(prompt).toContain("B-roll 使用自有素材。");
  });
});
