// @vitest-environment node

import { describe, expect, it } from "vitest";
import { methodAnalysisInstructionLines } from "./methodAnalysis";

describe("method analysis instructions", () => {
  it("uses reference video breakdown when an original video URL exists", () => {
    const prompt = methodAnalysisInstructionLines({
      sourceScript: "Reference copy.",
      originalVideoUrl: "https://example.com/video",
      generationMode: "viral-remix"
    }).join("\n");

    expect(prompt).toContain("Required internal method workflow");
    expect(prompt).toContain("reference video breakdown");
    expect(prompt).toContain("Use reference breakdown, not direct rewriting");
    expect(prompt).toContain("Replace concrete wording");
  });

  it("keeps commerce and mixed-cut modes from assuming a presenter is required", () => {
    const productPrompt = methodAnalysisInstructionLines({
      sourceScript: "",
      generationMode: "product-avatar"
    }).join("\n");
    const mixedCutPrompt = methodAnalysisInstructionLines({
      sourceScript: "",
      generationMode: "mixed-cut"
    }).join("\n");

    expect(productPrompt).toContain("Do not assume a human presenter is required");
    expect(productPrompt).toContain("selection-to-commerce");
    expect(mixedCutPrompt).toContain("Do not assume a real person or digital human is required");
    expect(mixedCutPrompt).toContain("material arrangement");
  });

  it("treats personal IP videos as subtype analysis instead of commerce by default", () => {
    const prompt = methodAnalysisInstructionLines({
      sourceScript: "",
      generationMode: "personal-ip",
      personalIpProfile: {
        name: "Creator",
        persona: "Practical local guide.",
        tone: "Direct and warm.",
        catchphrases: "Try this first.",
        bannedWords: "guaranteed"
      }
    }).join("\n");

    expect(prompt).toContain("store visit, knowledge output, opinion");
    expect(prompt).toContain("Only use commerce CTA when the input clearly asks for selling");
    expect(prompt).toContain("Creator/IP name: Creator.");
    expect(prompt).toContain("Avoid these words or phrases: guaranteed.");
  });
});
