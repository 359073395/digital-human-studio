import type { PersonalIpProfile, VideoGenerationMode } from "../../shared/domain";
import { productionMethodLibraryLines } from "./productionMethodLibrary";

export interface MethodAnalysisInput {
  sourceScript: string;
  originalVideoUrl?: string;
  generationMode?: VideoGenerationMode;
  personalIpProfile?: PersonalIpProfile;
}

export function methodAnalysisInstructionLines(input: MethodAnalysisInput): string[] {
  return [
    "Required internal method workflow:",
    "1. First create a private analysis result. Do not write the final script directly from the raw reference.",
    `2. Analysis track: ${analysisTrack(input)}.`,
    "3. Convert the analysis into a content strategy: target viewer, first-frame job, 0-3s hook, 0-6s core value, proof/trust, retention rhythm, CTA or interaction goal.",
    "4. Write the final script from that strategy only.",
    "5. In the JSON notes field, include a concise analysis summary and the main originality changes.",
    ...modeMethodLines(input),
    ...productionMethodLibraryLines(input)
  ];
}

function analysisTrack(input: MethodAnalysisInput): string {
  if (input.originalVideoUrl?.trim()) {
    return "reference video breakdown: first frame, 0-3s hook, beat structure, visual grammar, proof, retention, CTA, and copying risks";
  }

  if (input.sourceScript.trim()) {
    return "source-copy analysis: copy type, target viewer, pain point, hook function, information order, emotion curve, proof, and reusable structure";
  }

  if (input.generationMode === "product-avatar") {
    return "product and selling-point analysis: user pain, scene, product proof, price/offer, trust barrier, CTR/CVR/GPM intent";
  }

  if (input.generationMode === "personal-ip") {
    return "personal IP topic analysis: decide whether the content is store visit, knowledge, opinion, daily life, industry insight, experience sharing, or commerce";
  }

  return "topic brief analysis: infer the viewer problem, hook function, retention path, proof need, and output goal";
}

function modeMethodLines(input: MethodAnalysisInput): string[] {
  switch (input.generationMode) {
    case "product-avatar":
      return [
        "",
        "Mode method: product/commerce video.",
        "Treat selection-to-commerce, product-card thinking, storyboard planning, and optional image/video generation as internal capabilities.",
        "Do not assume a human presenter is required. The output may later use product images, B-roll, AI-generated visuals, voiceover, or a digital human.",
        "Prioritize: precise viewer, strong first 3 seconds, product scene, one core selling point, proof/trust, offer or risk reversal, and clear click intent.",
        "Use product-card logic when relevant: main visual, title keyword, price/offer, reviews/social proof, refund or after-sales trust."
      ];

    case "image-lipsync":
      return [
        "",
        "Mode method: image lip-sync video.",
        "Analyze whether the script can be spoken naturally by a single presenter image.",
        "Keep sentences short and mouth-friendly. Avoid visual instructions that require complex scene changes.",
        "If product context exists, make product mention clear but do not turn every image lip-sync video into a hard-sell ad."
      ];

    case "personal-ip":
      return [
        "",
        "Mode method: personal IP video.",
        "First infer the content subtype: store visit, knowledge output, opinion, daily life, industry analysis, experience sharing, or commerce.",
        "Only use commerce CTA when the input clearly asks for selling. Otherwise use follow, comment, save, visit, or learning-oriented interaction goals.",
        ...personalIpLines(input.personalIpProfile)
      ];

    case "viral-remix":
      return [
        "",
        "Mode method: viral structure remix.",
        "Use reference breakdown, not direct rewriting. Keep only abstract mechanics: hook job, beat order, pacing, proof type, emotional turn, visual role, and CTA placement.",
        "Replace concrete wording, examples, creator persona, catchphrases, jokes, claims, shot signatures, and distinctive visual expression."
      ];

    case "mixed-cut":
      return [
        "",
        "Mode method: mixed-cut video.",
        "Do not assume a real person or digital human is required.",
        "Internally plan script plus material arrangement: voiceover, subtitles, product images, B-roll, screen recording, generated visuals, sound cues, and optional digital-human segments.",
        "Write a script that can be edited with fast visual proof points and clear subtitle emphasis."
      ];

    case "preset-avatar":
    default:
      return [
        "",
        "Mode method: preset avatar talking-head video.",
        "Use a digital-human presenter as the render path, but still apply short-video analysis: first 3 seconds, 6-second value reveal, retention rhythm, proof, and CTA.",
        "Keep it natural for spoken delivery and suitable for HeyGen voice/avatar generation."
      ];
  }
}

function personalIpLines(profile: PersonalIpProfile | undefined): string[] {
  if (!profile) {
    return [];
  }

  return [
    profile.name ? `Creator/IP name: ${profile.name}.` : "",
    profile.persona ? `Creator persona: ${profile.persona}.` : "",
    profile.tone ? `Tone: ${profile.tone}.` : "",
    profile.catchphrases ? `Allowed recurring phrases: ${profile.catchphrases}.` : "",
    profile.bannedWords ? `Avoid these words or phrases: ${profile.bannedWords}.` : ""
  ].filter(Boolean);
}
