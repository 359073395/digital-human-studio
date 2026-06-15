import type { ContentLanguage } from "../../shared/domain";
import type { SourceTranscriptionResult } from "../../shared/scriptGeneration";

export class MockAsrProvider {
  transcribe(contentLanguage: ContentLanguage): SourceTranscriptionResult {
    const transcript = createTranscript(contentLanguage);

    return {
      transcript,
      contentLanguage,
      notes: "Mock ASR 已生成源素材转写文本；真实 ASR 接入后会替换为音视频识别结果。"
    };
  }
}

function createTranscript(language: ContentLanguage): string {
  if (language === "en-US") {
    return "Many people keep increasing budget when their videos do not sell, but the real problem is that viewers do not understand why they should buy in the first few seconds.";
  }

  if (language === "id-ID") {
    return "Banyak orang langsung tambah budget saat videonya belum menghasilkan pesanan, padahal masalah utamanya penonton belum punya alasan kuat untuk beli di beberapa detik pertama.";
  }

  return "很多人视频不出单就急着加预算，但真正的问题是观众在前几秒还没有明白为什么现在要买。";
}
