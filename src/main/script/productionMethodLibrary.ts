import type { VideoGenerationMode } from "../../shared/domain";
import {
  productionWorkflowPromptLines,
  storyboardWorkflowPromptLines
} from "../../shared/productionWorkflows";

export interface ProductionMethodLibraryInput {
  generationMode?: VideoGenerationMode;
}

export function productionMethodLibraryLines(input: ProductionMethodLibraryInput): string[] {
  return [
    "",
    "Built-in production method library:",
    "Use these methods as internal operating procedures, not as decorative prompt text.",
    ...sharedMethodLines(),
    ...modeSpecificMethodLines(input.generationMode),
    "",
    "Built-in production workflow registry:",
    ...productionWorkflowPromptLines(input.generationMode)
  ];
}

export function storyboardProductionMethodLines(input: ProductionMethodLibraryInput): string[] {
  return [
    "",
    "Built-in storyboard and image-to-video method library:",
    "Use these methods as the hidden planning standard before creating storyboard outputs.",
    ...viralReferenceBreakdownLines(),
    ...image2StoryboardLines(),
    ...modeSpecificStoryboardLines(input.generationMode),
    "",
    "Storyboard workflow stages from the built-in registry:",
    ...storyboardWorkflowPromptLines(input.generationMode)
  ];
}

function sharedMethodLines(): string[] {
  return [
    "- Claude Code style video breakdown: identify first frame job, 0-3s hook, 3-8s conflict or value reveal, proof/demo path, rhythm, on-screen text role, CTA, and originality risk.",
    "- AI talking-head pipeline: source extraction -> reference analysis -> editable script -> avatar or image selection -> lip-sync video -> subtitles/title/cover -> export package.",
    "- Viral-copy learning loop: use prior cases and knowledge-base rules to infer reusable mechanics; never depend on a single reference line.",
    "- TikTok interest-commerce rule: content must first create stopping power and curiosity, then build trust, then guide action. Do not write like a product detail page.",
    "- Quality gate: every generated script must be editable, claim-aware, platform-native, and suitable for final subtitle/cover extraction."
  ];
}

function modeSpecificMethodLines(mode: VideoGenerationMode | undefined): string[] {
  switch (mode) {
    case "product-avatar":
      return [
        ...commerceProductMethodLines(),
        "- Product presenter image method: infer presenter age/style/scene from product category, target user, usage moment, pain point, and proof type; generate a clear product-holding or product-wearing prompt.",
        "- The generated image is a review checkpoint. If it is not convincing, adjust the visual prompt and regenerate before HeyGen lip-sync."
      ];

    case "viral-remix":
      return [
        ...viralReferenceBreakdownLines(),
        ...image2StoryboardLines(),
        "- Viral remix method: output analysis, strategy, editable script, storyboard prompts, and whole-video prompt. Keep the market-validated structure, replace expression and proof materials."
      ];

    case "mixed-cut":
      return [
        ...viralReferenceBreakdownLines(),
        "- Mixed-cut method: analyze uploaded materials by usable visual proof, scene category, pacing role, caption role, and edit order.",
        "- The script should be a voiceover/subtitle spine that can support B-roll, screen recording, product shots, AI-generated visuals, or short digital-human inserts.",
        "- Mixed-cut only creates batch remixes. Use video-dedup mode afterward for fidelity-preserving optical post-processing."
      ];

    case "video-dedup":
      return [
        "- Video dedup method: treat dedup as a separate post-processing workflow, not as mixed-cut generation.",
        "- Keep the user-facing flow simple: import video, choose light/standard/strong processing, choose output ratio, and export.",
        "- Internally prefer fidelity-preserving optical processing: optical offset, time-based dynamic crop, subtle rotate, lens correction, perspective perturbation, frame resampling, GOP changes, and light audio perturbation.",
        "- For high-risk fragments, optional V2V reconstruction can be added through the video provider later.",
        "- Warn when the requested processing is only MD5, mirror, crop, speed, color, BGM, or subtitle replacement."
      ];

    case "personal-ip":
      return [
        "- Personal IP method: classify the video as store visit, knowledge output, opinion, daily workflow, industry insight, experience sharing, community interaction, or commerce.",
        "- Keep the creator's persona and viewpoint stable. Do not force a product-sales CTA unless the task clearly asks for selling.",
        "- Convert expertise into a viewer-useful takeaway: mistake, framework, comparison, checklist, field observation, or personal lesson."
      ];

    case "image-lipsync":
      return [
        "- Image lip-sync method: a single image must carry the whole video, so the script needs short spoken lines, clear facial/mouth visibility, and minimal visual scene dependency.",
        "- If product context exists, mention the product through conversational proof instead of turning the whole video into a hard sell."
      ];

    case "preset-avatar":
    default:
      return [
        "- Preset avatar talking-head method: keep the flow natural for one presenter, but still use first-frame/hook/proof/CTA short-video mechanics.",
        "- The avatar is the speaker; do not write camera directions that require complex physical actions unless a motion prompt will be used."
      ];
  }
}

function modeSpecificStoryboardLines(mode: VideoGenerationMode | undefined): string[] {
  switch (mode) {
    case "product-avatar":
      return [
        ...commerceProductMethodLines(),
        "- Storyboard should show product entry timing, hand/product visibility, proof shot, offer/CTA shot, and subtitle-safe zones."
      ];

    case "mixed-cut":
      return [
        "- Mixed-cut storyboard should map each material to a job: hook visual, proof visual, context visual, objection visual, result visual, CTA visual.",
        "- Do not require a human presenter unless source material or task intent needs one."
      ];

    case "video-dedup":
      return [
        "- Video dedup planning should identify whether the whole video only needs optical post-processing or whether some high-risk fragments need replacement.",
        "- Keep useful meaning and overall viewing feel, but change optical sampling, subtitle hierarchy, cover direction, encoding structure, and optional high-risk fragments."
      ];

    case "personal-ip":
      return [
        "- Personal IP storyboard should preserve creator perspective: talking head, POV, location detail, demonstration, notes/screen overlay, or field footage depending on subtype."
      ];

    case "viral-remix":
    default:
      return [
        "- Viral remix storyboard should keep abstract sequence logic while changing literal shots, characters, props, wording, and visual signatures."
      ];
  }
}

function viralReferenceBreakdownLines(): string[] {
  return [
    "- Viral reference breakdown method: do not just rewrite. Break down first-frame stimulus, hook function, conflict/value reveal, information order, emotion curve, proof type, visual rhythm, caption placement, CTA timing, and copy risk.",
    "- If the reference has no speech, analyze visible text, object movement, scene order, product appearance timing, and edit rhythm instead of inventing a transcript.",
    "- The reusable asset is the structure and intent, not the original sentences, creator persona, catchphrases, music identity, exact shot order, or distinctive examples."
  ];
}

function image2StoryboardLines(): string[] {
  return [
    "- Image2 storyboard method: create one unified storyboard image prompt that contains multiple numbered panels in one consistent visual world.",
    "- Lock continuity across panels: same protagonist face, product shape, clothing, scene, lighting, lens, color palette, and subtitle-safe space.",
    "- Each panel must include shot purpose, visible action, subject/product action, camera movement, on-screen text or voiceover, image prompt, and motion prompt for Seedance/Jimeng/Kling-style image-to-video."
  ];
}

function commerceProductMethodLines(): string[] {
  return [
    "- Product-to-commerce method: start from product category, target user, use case, pain point, proof opportunity, price/offer, objection, and click intent.",
    "- TikTok Shop conversion method: prioritize first 3 seconds, product visibility, trust proof, clear benefit, COD/yellow basket style CTA when market-appropriate, and GPM/CTR thinking.",
    "- Avoid unsupported medical, financial, permanent-result, or exaggerated guarantee claims. Use safe wording such as helps, supports, looks more, may vary, routine use, or follow instructions when relevant."
  ];
}
