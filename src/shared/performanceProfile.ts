export type RuntimePerformanceMode = "low-spec" | "standard" | "batch";

export interface RuntimePerformanceProfile {
  mode: RuntimePerformanceMode;
  label: "低配模式" | "标准模式" | "批量模式";
  cpuCores: number;
  totalMemoryGb: number;
  availableDiskGb?: number;
  maxParallelVideos: number;
  ffmpegThreads: number;
  ffmpegPreset: "ultrafast" | "veryfast";
  crfOffset: number;
  cleanupIntermediateFiles: boolean;
  reason: string;
}

export const DEFAULT_RUNTIME_PERFORMANCE_PROFILE: RuntimePerformanceProfile = {
  mode: "low-spec",
  label: "低配模式",
  cpuCores: 4,
  totalMemoryGb: 8,
  maxParallelVideos: 3,
  ffmpegThreads: 1,
  ffmpegPreset: "ultrafast",
  crfOffset: 2,
  cleanupIntermediateFiles: true,
  reason: "默认按 8GB 内存电脑运行，优先稳定和低占用。"
};
