import fs from "node:fs";
import os from "node:os";
import {
  DEFAULT_RUNTIME_PERFORMANCE_PROFILE,
  type RuntimePerformanceProfile
} from "../../shared/performanceProfile";

export function detectRuntimePerformanceProfile(appDataDir?: string): RuntimePerformanceProfile {
  const cpuCores = Math.max(1, os.cpus().length);
  const totalMemoryGb = roundOneDecimal(os.totalmem() / 1024 / 1024 / 1024);
  const availableDiskGb = appDataDir ? readAvailableDiskGb(appDataDir) : undefined;
  const diskIsTight = availableDiskGb !== undefined && availableDiskGb < 10;

  if (!diskIsTight && totalMemoryGb >= 24 && cpuCores >= 10) {
    return {
      mode: "batch",
      label: "批量模式",
      cpuCores,
      totalMemoryGb,
      availableDiskGb,
      maxParallelVideos: 5,
      ffmpegThreads: 1,
      ffmpegPreset: "veryfast",
      crfOffset: 0,
      cleanupIntermediateFiles: true,
      reason: "内存和 CPU 余量较高，适合批量生成。"
    };
  }

  if (!diskIsTight && totalMemoryGb >= 12 && cpuCores >= 6) {
    return {
      mode: "standard",
      label: "标准模式",
      cpuCores,
      totalMemoryGb,
      availableDiskGb,
      maxParallelVideos: 4,
      ffmpegThreads: 1,
      ffmpegPreset: "veryfast",
      crfOffset: 1,
      cleanupIntermediateFiles: true,
      reason: "当前电脑适合稳定批量处理，软件会自动限制单个转码进程占用。"
    };
  }

  return {
    ...DEFAULT_RUNTIME_PERFORMANCE_PROFILE,
    cpuCores,
    totalMemoryGb,
    availableDiskGb,
    reason: diskIsTight
      ? "当前数据盘可用空间偏低，自动进入低配模式并清理中间文件。"
      : "当前电脑按低配模式运行，最多按 3 条短视频的轻量队列处理。"
  };
}

function readAvailableDiskGb(directory: string): number | undefined {
  try {
    fs.mkdirSync(directory, { recursive: true });
    const stat = fs.statfsSync(directory);
    return roundOneDecimal((stat.bavail * stat.bsize) / 1024 / 1024 / 1024);
  } catch {
    return undefined;
  }
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
