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
});
