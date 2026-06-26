export const MIXED_CUT_MAX_BATCH_COUNT = 100;

export interface MixedCutBatchPlan {
  targetCount: number;
  materialCount: number;
  materialsPerVideo: number;
  combinationCount: number;
  reuseLimitedCount: number;
  reuseRate: number;
}

export interface MixedCutGroupMaterialInput {
  groupId: string;
  shotCount: number;
  reuseRate: number;
}

export interface MixedCutGroupPlanSummary {
  groupId: string;
  shotCount: number;
  reuseRate: number;
  maxUsesPerShot: number;
  capacity: number;
}

export interface GroupedMixedCutBatchPlan {
  targetCount: number;
  groupCount: number;
  totalShotCount: number;
  materialCount: number;
  materialsPerVideo: number;
  combinationCount: number;
  reuseLimitedCount: number;
  reuseRate: number;
  groups: MixedCutGroupPlanSummary[];
  warnings: string[];
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

export function calculateGroupedMixedCutBatchPlan(input: {
  groups: MixedCutGroupMaterialInput[];
  maxTargetCount?: number;
}): GroupedMixedCutBatchPlan {
  const maxTargetCount = Math.max(1, Math.floor(input.maxTargetCount ?? MIXED_CUT_MAX_BATCH_COUNT));
  const groups = normalizeGroupInputs(input.groups).map((group) => {
    const maxUsesPerShot =
      group.reuseRate <= 0 ? 1 : Math.max(2, Math.ceil((maxTargetCount * group.reuseRate) / 100));
    return {
      ...group,
      maxUsesPerShot,
      capacity: group.shotCount * maxUsesPerShot
    };
  });
  const totalShotCount = groups.reduce((total, group) => total + group.shotCount, 0);
  const warnings: string[] = [];

  if (groups.length === 0 || totalShotCount === 0) {
    return {
      targetCount: 0,
      groupCount: groups.length,
      totalShotCount,
      materialCount: totalShotCount,
      materialsPerVideo: groups.length,
      combinationCount: 0,
      reuseLimitedCount: 0,
      reuseRate: averageReuseRate(groups),
      groups,
      warnings: ["mixed-cut material must be grouped in numeric folders before rendering."]
    };
  }

  const emptyGroup = groups.find((group) => group.shotCount <= 0);
  if (emptyGroup) {
    warnings.push(`group ${emptyGroup.groupId} has no usable visual clips.`);
  }

  const combinationCount = boundedProduct(
    groups.map((group) => Math.max(0, group.shotCount)),
    10_000
  );
  const reuseLimitedCount = groups.reduce(
    (minimum, group) => Math.min(minimum, group.capacity),
    Number.POSITIVE_INFINITY
  );
  const targetCount = Math.min(
    maxTargetCount,
    combinationCount,
    Number.isFinite(reuseLimitedCount) ? reuseLimitedCount : 0
  );

  if (targetCount < maxTargetCount) {
    warnings.push("target count is limited by grouped materials, uniqueness, or reuse settings.");
  }

  return {
    targetCount: Math.max(0, Math.floor(targetCount)),
    groupCount: groups.length,
    totalShotCount,
    materialCount: totalShotCount,
    materialsPerVideo: groups.length,
    combinationCount,
    reuseLimitedCount: Math.max(0, Math.floor(reuseLimitedCount || 0)),
    reuseRate: averageReuseRate(groups),
    groups,
    warnings
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

function boundedProduct(values: number[], cap: number): number {
  if (values.length === 0 || values.some((value) => value <= 0)) {
    return 0;
  }

  let product = 1;
  for (const value of values) {
    product *= value;
    if (product >= cap) {
      return cap;
    }
  }

  return Math.max(1, Math.floor(product));
}

function normalizeGroupInputs(groups: MixedCutGroupMaterialInput[]): MixedCutGroupPlanSummary[] {
  const byGroup = new Map<string, MixedCutGroupMaterialInput>();
  for (const group of groups) {
    const groupId = String(group.groupId ?? "").trim();
    if (!/^\d+$/.test(groupId)) {
      continue;
    }

    const existing = byGroup.get(groupId);
    byGroup.set(groupId, {
      groupId,
      shotCount: Math.max(0, Math.floor((existing?.shotCount ?? 0) + group.shotCount)),
      reuseRate: clampNumber(group.reuseRate, 0, 100)
    });
  }

  return [...byGroup.values()]
    .sort((left, right) => Number(left.groupId) - Number(right.groupId))
    .map((group) => ({
      ...group,
      maxUsesPerShot: 1,
      capacity: group.shotCount
    }));
}

function averageReuseRate(groups: Array<{ reuseRate: number }>): number {
  if (groups.length === 0) {
    return 0;
  }

  return Math.round(groups.reduce((sum, group) => sum + group.reuseRate, 0) / groups.length);
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
