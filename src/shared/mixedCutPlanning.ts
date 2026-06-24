export const MIXED_CUT_MAX_BATCH_COUNT = 30;

export interface MixedCutBatchPlan {
  targetCount: number;
  materialCount: number;
  materialsPerVideo: number;
  combinationCount: number;
  reuseLimitedCount: number;
  reuseRate: number;
}

export function calculateMixedCutBatchPlan(input: {
  materialCount: number;
  reuseRate: number;
  maxTargetCount?: number;
}): MixedCutBatchPlan {
  const materialCount = Math.max(0, Math.floor(input.materialCount));
  const reuseRate = clampNumber(input.reuseRate, 0, 100);
  const maxTargetCount = Math.max(1, Math.floor(input.maxTargetCount ?? MIXED_CUT_MAX_BATCH_COUNT));

  if (materialCount === 0) {
    return {
      targetCount: 0,
      materialCount,
      materialsPerVideo: 0,
      combinationCount: 0,
      reuseLimitedCount: 0,
      reuseRate
    };
  }

  const materialsPerVideo = recommendedMaterialsPerVideo(materialCount);
  const reuseFactor = Math.max(0.15, 1 - reuseRate / 100);
  const reuseLimitedCount = Math.max(
    1,
    Math.floor(materialCount / Math.max(1, materialsPerVideo * reuseFactor))
  );
  const combinationCount = boundedCombination(materialCount, materialsPerVideo, 10_000);
  const targetCount = Math.min(maxTargetCount, combinationCount, reuseLimitedCount);

  return {
    targetCount: Math.max(1, targetCount),
    materialCount,
    materialsPerVideo,
    combinationCount,
    reuseLimitedCount,
    reuseRate
  };
}

function recommendedMaterialsPerVideo(materialCount: number): number {
  if (materialCount <= 1) {
    return 1;
  }

  if (materialCount <= 3) {
    return materialCount;
  }

  if (materialCount <= 8) {
    return 3;
  }

  return 4;
}

function boundedCombination(n: number, k: number, cap: number): number {
  const normalizedK = Math.min(k, n - k);
  if (normalizedK <= 0) {
    return 1;
  }

  let value = 1;
  for (let index = 1; index <= normalizedK; index += 1) {
    value = (value * (n - normalizedK + index)) / index;
    if (value >= cap) {
      return cap;
    }
  }

  return Math.max(1, Math.floor(value));
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
