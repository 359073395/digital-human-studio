import { describe, expect, it } from "vitest";
import { calculateGroupedMixedCutBatchPlan, calculateMixedCutBatchPlan } from "./mixedCutPlanning";

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

describe("calculateGroupedMixedCutBatchPlan", () => {
  it("counts numeric shot groups and limits output by unique combinations", () => {
    const plan = calculateGroupedMixedCutBatchPlan({
      groups: [
        { groupId: "1", shotCount: 2, reuseRate: 80 },
        { groupId: "2", shotCount: 3, reuseRate: 80 },
        { groupId: "10", shotCount: 2, reuseRate: 80 }
      ],
      maxTargetCount: 30
    });

    expect(plan.groupCount).toBe(3);
    expect(plan.totalShotCount).toBe(7);
    expect(plan.combinationCount).toBe(12);
    expect(plan.targetCount).toBe(12);
    expect(plan.groups.map((group) => group.groupId)).toEqual(["1", "2", "10"]);
  });

  it("uses each group's reuse rate as an output cap", () => {
    const plan = calculateGroupedMixedCutBatchPlan({
      groups: [
        { groupId: "1", shotCount: 5, reuseRate: 0 },
        { groupId: "2", shotCount: 5, reuseRate: 80 }
      ],
      maxTargetCount: 30
    });

    expect(plan.groups[0]?.maxUsesPerShot).toBe(1);
    expect(plan.reuseLimitedCount).toBe(5);
    expect(plan.targetCount).toBe(5);
  });
});
