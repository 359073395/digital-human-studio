import { describe, expect, it } from "vitest";
import { countCompleteSteps, isRetryable, type WorkbenchStep } from "./workbench";

describe("workbench helpers", () => {
  it("counts completed steps", () => {
    const steps: WorkbenchStep[] = [
      { id: "script", label: "原创脚本", status: "complete" },
      { id: "avatar", label: "数字人", status: "running" },
      { id: "export", label: "导出", status: "waiting" }
    ];

    expect(countCompleteSteps(steps)).toBe(1);
  });

  it("marks failed and retry-ready steps as retryable", () => {
    expect(isRetryable("failed")).toBe(true);
    expect(isRetryable("retry-ready")).toBe(true);
    expect(isRetryable("running")).toBe(false);
  });
});
