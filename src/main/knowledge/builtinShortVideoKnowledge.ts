import type { VideoGenerationMode } from "../../shared/domain";

export interface BuiltInKnowledgeEntry {
  id: string;
  title: string;
  appliesTo: Array<VideoGenerationMode | "all">;
  lines: string[];
}

export const BUILTIN_SHORT_VIDEO_KNOWLEDGE: BuiltInKnowledgeEntry[] = [
  {
    id: "priority-and-originality",
    title: "知识优先级与原创边界",
    appliesTo: ["all"],
    lines: [
      "商品事实、价格、禁用词、用户手动修改的最终脚本优先级最高，旧案例和内置规则不能覆盖这些信息。",
      "爆款案例只提取结构、钩子功能、节奏、证明方式、情绪转折和 CTA 位置，不复制原句、独特口头禅、创作者人设或镜头签名。",
      "前 5 秒可以尽量保留同类钩子功能，但必须换成适合当前商品、账号或主题的原创表达。",
      "生成结果必须附带相似度/合规风险判断，遇到医疗、功效、金融、夸大承诺时降级为温和表达。"
    ]
  },
  {
    id: "indonesia-tiktok-copy",
    title: "印尼 TikTok Shop 口语化文案规则",
    appliesTo: ["product-avatar", "viral-remix", "mixed-cut", "image-lipsync"],
    lines: [
      "默认市场为 Indonesia 时，脚本要像本地 TikTok 达人说话，优先使用 kamu、aku、nih、serius、coba、buat kamu yang、cek keranjang kuning、bisa COD 等自然表达。",
      "避免翻译腔、详情页式堆卖点、过度正式的 Anda、开头直接报品牌名或成分名。",
      "常用结构包括痛点解决、反常识、场景代入、价格重塑、demo-first、评论提问和复购背书。",
      "美妆、护肤、减肥、健康类避免 pasti、100%、dijamin、menyembuhkan、langsung hilang permanen 等绝对承诺；优先使用 membantu、terlihat、tampak、hasil tiap orang bisa berbeda。"
    ]
  },
  {
    id: "product-commerce-video",
    title: "商品/带货视频生产规则",
    appliesTo: ["product-avatar", "image-lipsync", "viral-remix", "mixed-cut"],
    lines: [
      "先判断产品类目、目标人群、痛点、使用场景、价格/促销和可证明点，再选择 1-2 个爆款公式。",
      "高频公式：价格震惊 + 一品多用、痛点焦虑 + 简单解决、demo-first 视觉冲击、评论/复购背书、疤痕贴评论提问 + 手部演示。",
      "每条脚本要同时考虑屏幕字幕关键词、CTA、数字人形象提示词、动作提示词和合规提醒。",
      "商品包装、价格、规格、SPF/PA、认证、禁用词以当前任务上传资料和用户手改内容为准。"
    ]
  },
  {
    id: "gpt-image-2-presenter",
    title: "GPT Image 2 人物商品图规则",
    appliesTo: ["product-avatar", "image-lipsync"],
    lines: [
      "需要 AI 生成任务图片时，优先使用 OpenAI 兼容图片模型（如 GPT Image 2）生成或改图，再给用户预览与重生成。",
      "人物商品图要原生匹配输出比例，人物脸部清晰、嘴部无遮挡，手自然，产品真实可识别，标签尽量朝向镜头。",
      "不得把商品改成假包装、贴纸感、重设计瓶身或看不清品牌；静态图不合格时继续改图，不进入 HeyGen。",
      "画面要为字幕和顶部标题预留安全区，适合作为 HeyGen image lip-sync 的输入。"
    ]
  },
  {
    id: "heygen-lipsync",
    title: "HeyGen 对口型与动作规则",
    appliesTo: ["preset-avatar", "product-avatar", "image-lipsync", "personal-ip"],
    lines: [
      "HeyGen 负责预设 Avatar 或已验收静态图的口型同步，不作为商品图、持握图或包装重绘工具。",
      "动作提示词不能只写 smile/nod，要按 0-3 秒钩子、中段证明、价格/COD/CTA、结尾稳定展示安排 3-5 个微动作。",
      "动作必须小而自然：轻微点头、眼神变化、短暂看产品再看镜头；禁止大幅挥手、转身、遮挡嘴部或遮挡产品标签。",
      "优先使用 HeyGen 返回字幕；拿不到字幕时才走 ASR，不能用纯估算字幕作为最终发布字幕。"
    ]
  },
  {
    id: "storyboard-image-to-video",
    title: "故事板与生视频规则",
    appliesTo: ["viral-remix", "mixed-cut", "product-avatar"],
    lines: [
      "爆款素材复刻先做拉片/原文案分析，再做改写，再生成带画面的统一故事板，最后才进入生视频或数字人口播。",
      "故事板不强制 9 宫格，应根据内容密度选择 6、8、9 或 12 格；必须保持主角、商品、服装、场景、光线、色调、镜头风格一致。",
      "每个分镜要包含画面动作、主体动作、产品动作、字幕/口播、运镜、图片提示词、视频动作提示词、负面提示词和连续性说明。",
      "单张多格故事板图用于统一后续 Seedance、即梦、可灵等图生视频模型的视觉参考。"
    ]
  },
  {
    id: "personal-ip-and-mixed-cut",
    title: "个人 IP 与混剪视频规则",
    appliesTo: ["personal-ip", "mixed-cut"],
    lines: [
      "个人 IP 不强制带货，先判断是探店、知识输出、观点、日常流程、行业洞察、经验分享、社群互动还是商业转化。",
      "个人 IP 脚本优先保留人设、观点立场、可信经历和可持续栏目结构，商业 CTA 只有在任务资料明确需要时才加入。",
      "混剪视频不一定有真人，先分析素材类型、可用画面、叙事线、字幕节奏和转场逻辑，再决定是否加入数字人口播或旁白。",
      "混剪成片必须来自上传素材和分析结果，不能只用数字人口播占位；混剪模式只负责批量组合，去重处理进入独立的视频去重模式。"
    ]
  },
  {
    id: "mixed-cut-batch-and-dedup-boundary",
    title: "批量混剪与视频去重边界",
    appliesTo: ["mixed-cut", "video-dedup"],
    lines: [
      "混剪模式只负责上传素材的批量编排和本地渲染，可设置生成数量；生成数量应结合素材数量，素材越少越要提示同质化风险。",
      "每条混剪成片都要保存剪辑记录，包含素材来源、片段顺序、起止时间、裁切比例、字幕/标题和使用次数。",
      "视频去重处理是独立模式，输入可以是混剪成片、本地 MP4 或其他任务产物，输出处理后视频和原创度评分报告。",
      "原创概率实现为内部原创度评分，默认通过阈值 80 分；报告必须解释评分原因，不承诺平台官方判定。"
    ]
  },
  {
    id: "originality-risk-quality-check",
    title: "原创度与重复风险质检规则",
    appliesTo: ["video-dedup", "viral-remix", "product-avatar", "mixed-cut", "preset-avatar"],
    lines: [
      "低价值去重动作包括只改 MD5、只镜像、只裁切边缘、只调色、只换 BGM、只加字幕、只改封面标题；这些动作不能单独视为内容级原创。",
      "内容级重构优先改变片段组合、分镜顺序、脚本表达、字幕层级、画面标题、封面构图、节奏和部分视觉素材。",
      "原创度评分同时看片段重组、单素材占比、连续同源、视觉变化、音频变化、文案相似、字幕/标题/封面模板和水印风险。",
      "高风险时建议替换镜头、补充自有素材、重写脚本、重生成 AI 片段或改变封面/字幕样式。"
    ]
  }
];

export function selectBuiltInKnowledge(mode: VideoGenerationMode): BuiltInKnowledgeEntry[] {
  return BUILTIN_SHORT_VIDEO_KNOWLEDGE.filter(
    (entry) => entry.appliesTo.includes("all") || entry.appliesTo.includes(mode)
  );
}
