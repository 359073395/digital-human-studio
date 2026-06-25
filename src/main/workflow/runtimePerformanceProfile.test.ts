// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { detectRuntimePerformanceProfile } from "./runtimePerformanceProfile";

vi.mock("node:os", () => ({
  default: {
    cpus: () => Array.from({ length: mockedCpuCores }, () => ({ model: "test" })),
    totalmem: () => mockedMemoryGb * 1024 * 1024 * 1024
  },
  cpus: () => Array.from({ length: mockedCpuCores }, () => ({ model: "test" })),
  totalmem: () => mockedMemoryGb * 1024 * 1024 * 1024
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    default: {
      ...actual,
      mkdirSync: vi.fn(),
      statfsSync: () => ({
        bavail: mockedDiskGb * 1024 * 1024,
        bsize: 1024
      })
    },
    mkdirSync: vi.fn(),
    statfsSync: () => ({
      bavail: mockedDiskGb * 1024 * 1024,
      bsize: 1024
    })
  };
});

let mockedCpuCores = 4;
let mockedMemoryGb = 8;
let mockedDiskGb = 50;

describe("detectRuntimePerformanceProfile", () => {
  it("uses low-spec mode for 8GB machines", () => {
    mockedCpuCores = 4;
    mockedMemoryGb = 8;
    mockedDiskGb = 50;

    const profile = detectRuntimePerformanceProfile("D:/app-data");

    expect(profile.label).toBe("低配模式");
    expect(profile.maxParallelVideos).toBe(3);
    expect(profile.ffmpegThreads).toBe(1);
    expect(profile.cleanupIntermediateFiles).toBe(true);
  });

  it("uses standard mode for mid-range machines", () => {
    mockedCpuCores = 8;
    mockedMemoryGb = 16;
    mockedDiskGb = 50;

    const profile = detectRuntimePerformanceProfile("D:/app-data");

    expect(profile.label).toBe("标准模式");
    expect(profile.maxParallelVideos).toBe(4);
  });

  it("uses batch mode for high-memory machines", () => {
    mockedCpuCores = 12;
    mockedMemoryGb = 32;
    mockedDiskGb = 100;

    const profile = detectRuntimePerformanceProfile("D:/app-data");

    expect(profile.label).toBe("批量模式");
    expect(profile.maxParallelVideos).toBe(5);
  });

  it("falls back to low-spec mode when disk space is tight", () => {
    mockedCpuCores = 16;
    mockedMemoryGb = 64;
    mockedDiskGb = 4;

    const profile = detectRuntimePerformanceProfile("D:/app-data");

    expect(profile.label).toBe("低配模式");
    expect(profile.reason).toContain("空间");
  });
});
