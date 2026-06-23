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

  it("requires private method analysis before script writing", () => {
    const prompt = buildScriptGenerationPrompt({
      contentLanguage: "zh-CN",
      generationMode: "viral-remix",
      originalVideoUrl: "https://example.com/reference-video",
      sourceScript: "参考视频文案。"
    });

    expect(prompt).toContain("You must analyze first");
    expect(prompt).toContain("Required internal method workflow");
    expect(prompt).toContain("reference video breakdown");
    expect(prompt).toContain("Use reference breakdown, not direct rewriting");
    expect(prompt).toContain("Reference video URL: https://example.com/reference-video");
    expect(prompt).toContain("Built-in production method library");
    expect(prompt).toContain("Claude Code style video breakdown");
    expect(prompt).toContain("Image2 storyboard method");
  });

  it("adds mode-specific internal rules for product, personal IP, and mixed-cut videos", () => {
    const productPrompt = buildScriptGenerationPrompt({
      contentLanguage: "en-US",
      generationMode: "product-avatar",
      sourceScript: ""
    });
    const personalIpPrompt = buildScriptGenerationPrompt({
      contentLanguage: "en-US",
      generationMode: "personal-ip",
      sourceScript: ""
    });
    const mixedCutPrompt = buildScriptGenerationPrompt({
      contentLanguage: "en-US",
      generationMode: "mixed-cut",
      sourceScript: ""
    });

    expect(productPrompt).toContain("product-card logic");
    expect(productPrompt).toContain("Do not assume a human presenter is required");
    expect(productPrompt).toContain("Product-to-commerce method");
    expect(productPrompt).toContain("Product presenter image method");
    expect(personalIpPrompt).toContain("store visit, knowledge output, opinion");
    expect(personalIpPrompt).toContain("Personal IP method");
    expect(mixedCutPrompt).toContain("Do not assume a real person or digital human is required");
    expect(mixedCutPrompt).toContain("Mixed-cut method");
  });
});
