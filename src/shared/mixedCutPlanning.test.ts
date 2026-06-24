import { describe, expect, it } from "vitest";
import { calculateMixedCutBatchPlan } from "./mixedCutPlanning";

describe("calculateMixedCutBatchPlan", () => {
  it("returns zero when no visual material is available", () => {
    expect(calculateMixedCutBatchPlan({ materialCount: 0, reuseRate: 35 }).targetCount).toBe(0);
  });

  it("limits small material pools even when reuse is high", () => {
    const plan = calculateMixedCutBatchPlan({ materialCount: 3, reuseRate: 80 });

    expect(plan.materialsPerVideo).toBe(3);
    expect(plan.combinationCount).toBe(1);
    expect(plan.targetCount).toBe(1);
  });

  it("increases batch count as material count and reuse rate allow more combinations", () => {
    const conservativePlan = calculateMixedCutBatchPlan({ materialCount: 10, reuseRate: 20 });
    const aggressivePlan = calculateMixedCutBatchPlan({ materialCount: 10, reuseRate: 80 });

    expect(conservativePlan.targetCount).toBeGreaterThan(1);
    expect(aggressivePlan.targetCount).toBeGreaterThan(conservativePlan.targetCount);
    expect(aggressivePlan.targetCount).toBeLessThanOrEqual(30);
  });
});
