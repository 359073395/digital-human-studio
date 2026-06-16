import type { ScriptGenerationResult } from "../../shared/scriptGeneration";
import type { VideoTask } from "../../shared/domain";
import { buildScriptGenerationPrompt } from "./promptBuilder";
import type { ScriptProvider } from "./scriptProvider";

export class MockScriptProvider implements ScriptProvider {
  async generate(task: VideoTask): Promise<ScriptGenerationResult> {
    const sourceScript = task.sourceScript || defaultSourceScript(task.contentLanguage);
    const finalScript = createFinalScript(task, sourceScript);

    return {
      finalScript,
      similarityRisk: assessSimilarityRisk(sourceScript, finalScript),
      notes: "Mock LLM 已按结构复用、表达改写、前 5 秒改写的规则生成脚本。",
      promptPreview: buildScriptGenerationPrompt({
        sourceScript,
        contentLanguage: task.contentLanguage,
        generationMode: task.generationMode,
        personalIpProfile: task.personalIpProfile
      })
    };
  }
}

export function defaultSourceScript(language: VideoTask["contentLanguage"]): string {
  if (language === "en-US") {
    return "If your video gets views but no sales, the hook may be missing a clear buying reason.";
  }

  if (language === "id-ID") {
    return "Kalau videomu banyak ditonton tapi belum ada pesanan, masalahnya mungkin bukan trafik, tapi alasan beli di 5 detik pertama.";
  }

  return "如果你的视频有播放却没有成交，问题可能不是流量，而是前 5 秒没有给出购买理由。";
}

function createFinalScript(task: VideoTask, sourceScript: string): string {
  if (task.contentLanguage === "en-US") {
    return [
      "Stop blaming the algorithm first.",
      "When a video gets views but does not bring orders, the first thing to fix is the buying reason in the opening seconds.",
      `Use this angle: ${sourceScript}`,
      "Show the pain point, give one concrete proof, then tell viewers exactly what to do next."
    ].join("\n");
  }

  if (task.contentLanguage === "id-ID") {
    return [
      "Jangan langsung salahkan trafik dulu.",
      "Kalau video sudah ditonton tapi pesanan belum masuk, bagian pertama yang harus diperbaiki adalah alasan orang harus beli sekarang.",
      `Sudut bicaranya bisa seperti ini: ${sourceScript}`,
      "Mulai dari masalah yang terasa dekat, tunjukkan satu bukti yang jelas, lalu tutup dengan ajakan yang simpel."
    ].join("\n");
  }

  return [
    "先别急着怪流量。",
    "一个视频有播放却没有订单，最该改的往往是开头几秒的购买理由。",
    `这条可以这样讲：${sourceScript}`,
    "先点出痛点，再给一个具体证明，最后把行动指令说清楚。"
  ].join("\n");
}

function assessSimilarityRisk(
  sourceScript: string,
  finalScript: string
): ScriptGenerationResult["similarityRisk"] {
  const sourceTokens = tokenize(sourceScript);
  const finalTokens = tokenize(finalScript);
  if (sourceTokens.length === 0 || finalTokens.length === 0) {
    return "unknown";
  }

  const shared = sourceTokens.filter((token) => finalTokens.includes(token));
  const overlap = shared.length / Math.max(sourceTokens.length, 1);

  if (overlap > 0.5) {
    return "high";
  }
  if (overlap > 0.25) {
    return "medium";
  }
  return "low";
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}
