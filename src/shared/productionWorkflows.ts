import type { VideoGenerationMode } from "./domain";

export type ProductionProviderNeed = "llm" | "asr" | "image" | "video" | "heygen" | "local";

export interface ProductionWorkflowStage {
  id: string;
  label: string;
  goal: string;
  method: string;
  requiredInputs: string[];
  outputs: string[];
  providerNeeds: ProductionProviderNeed[];
  qualityGate: string;
}

export interface ProductionModeWorkflow {
  mode: VideoGenerationMode;
  label: string;
  summary: string;
  builtInMethods: string[];
  defaultInputs: string[];
  stages: ProductionWorkflowStage[];
}

const SHARED_ANALYSIS_STAGE: ProductionWorkflowStage = {
  id: "source-analysis",
  label: "提取/拉片分析",
  goal: "先理解原视频、文案、商品或素材，再决定复用哪些结构。",
  method:
    "Claude Code style video breakdown: first frame, 0-3s hook, beat order, proof path, rhythm, subtitles, CTA, and copy risk.",
  requiredInputs: ["原视频链接或上传素材", "原文案/转写/画面分析", "任务目标"],
  outputs: ["拉片分析", "可复用结构", "原创改写边界"],
  providerNeeds: ["llm", "asr"],
  qualityGate: "必须先得到可编辑分析摘要，不能直接从原文案跳到成片。"
};

const SCRIPT_STAGE: ProductionWorkflowStage = {
  id: "editable-script",
  label: "AI 生成可编辑文案",
  goal: "把分析结果转换成可改价格、词语、禁用词和 CTA 的最终口播或字幕脚本。",
  method:
    "Viral-copy learning loop: combine source analysis, uploaded knowledge, viral examples, platform-native wording, and safe-claim rules.",
  requiredInputs: ["拉片/原文案分析", "知识库/爆款文案", "语言和视频目标"],
  outputs: ["最终文案", "相似风险", "合规提醒", "字幕关键词"],
  providerNeeds: ["llm"],
  qualityGate: "文案必须能人工修改，且不能保留独特口头禅、原句、创作者人设或高风险承诺。"
};

const LOCAL_POLISH_STAGE: ProductionWorkflowStage = {
  id: "local-polish",
  label: "字幕/封面/后期包装",
  goal: "把原始视频包装成可发布版本，保证字幕、标题、封面和导出文件一致。",
  method:
    "TikTok polish rule: top hook, safe-zone subtitles, bold outline, keyword emphasis, first-frame cover, and export package.",
  requiredInputs: ["原始 MP4", "字幕或 ASR 结果", "预览中保存的字幕/标题/封面样式"],
  outputs: ["成品 MP4", "封面", "字幕文件", "发布资料包"],
  providerNeeds: ["local", "asr"],
  qualityGate: "最终导出必须和预览设置一致；没有字幕时间轴时必须 ASR 兜底，不能只估算。"
};

export const PRODUCTION_MODE_WORKFLOWS: Record<VideoGenerationMode, ProductionModeWorkflow> = {
  "preset-avatar": {
    mode: "preset-avatar",
    label: "预设数字人口播",
    summary: "用 HeyGen 预设数字人承接口播脚本，重点是短视频钩子、可信证明和自然口播。",
    builtInMethods: [
      "AI talking-head pipeline",
      "Claude Code style video breakdown",
      "HeyGen preset avatar delivery",
      "TikTok subtitle and cover polish"
    ],
    defaultInputs: ["原视频链接/参考文案", "预设 Avatar", "动作提示词", "知识库/爆款文案"],
    stages: [
      SHARED_ANALYSIS_STAGE,
      SCRIPT_STAGE,
      {
        id: "avatar-render",
        label: "HeyGen 数字人口播",
        goal: "用选定 Avatar 和 HeyGen 内置语音生成横竖屏原生比例视频。",
        method:
          "AI talking-head pipeline: keep lines mouth-friendly, use motion prompt for 3-5 small movements, and avoid actions the avatar cannot perform.",
        requiredInputs: ["最终文案", "Avatar ID", "动作提示词", "输出比例"],
        outputs: ["数字人 MP4", "HeyGen 字幕"],
        providerNeeds: ["heygen"],
        qualityGate: "Avatar 和 Voice 必须自动兜底或可选，不能因为未手填 ID 直接失败。"
      },
      LOCAL_POLISH_STAGE
    ]
  },
  "product-avatar": {
    mode: "product-avatar",
    label: "商品/带货视频",
    summary:
      "先用商品资料和爆款打法生成文案，再用图片模型生成可验收的人物持商品图，最后 HeyGen 对口型。",
    builtInMethods: [
      "Product-to-commerce workflow",
      "TikTok Shop CTR/GPM thinking",
      "GPT Image 2 product-presenter image workflow",
      "HeyGen image lip-sync",
      "TikTok subtitle and cover polish"
    ],
    defaultInputs: ["商品图", "卖点/价格/痛点", "知识库/爆款文案", "人物或场景描述"],
    stages: [
      SHARED_ANALYSIS_STAGE,
      SCRIPT_STAGE,
      {
        id: "product-presenter-image",
        label: "人物商品图验收",
        goal: "生成或改图得到人物拿商品/穿搭/使用场景图，并让用户能预览、改提示词、重生成。",
        method:
          "GPT Image 2 rule: preserve product packaging, readable label, clear face and mouth, natural hands, native 9:16, scene matched to product angle.",
        requiredInputs: ["商品图", "人物/画面描述提示词", "视频类型和目标人群"],
        outputs: ["人物商品图", "生图提示词", "重试记录"],
        providerNeeds: ["image"],
        qualityGate: "静态图不合格时不能进入 HeyGen；必须先重生成或修改提示词。"
      },
      {
        id: "image-lipsync-render",
        label: "HeyGen 图片口型同步",
        goal: "把验收通过的人物商品图做成数字人口播视频。",
        method:
          "HeyGen image lip-sync: small varied motion, stable product label, no mouth/product occlusion, native output ratio per preset.",
        requiredInputs: ["最终文案", "已验收人物商品图", "动作提示词", "输出比例"],
        outputs: ["口型同步 MP4", "HeyGen 字幕"],
        providerNeeds: ["heygen"],
        qualityGate: "HeyGen 只负责口型视频；商品图生成仍由图片模型完成。"
      },
      LOCAL_POLISH_STAGE
    ]
  },
  "image-lipsync": {
    mode: "image-lipsync",
    label: "图片口型同步",
    summary: "用户上传人物图后，用短句脚本和动作提示词生成单图口型同步视频。",
    builtInMethods: [
      "Image lip-sync workflow",
      "AI talking-head pipeline",
      "Mouth-friendly script writing",
      "TikTok subtitle and cover polish"
    ],
    defaultInputs: ["人物图片", "参考文案/任务主题", "动作提示词"],
    stages: [
      SHARED_ANALYSIS_STAGE,
      SCRIPT_STAGE,
      {
        id: "single-image-lipsync",
        label: "单图口型同步",
        goal: "用上传人物图完成 HeyGen 对口型，脚本不依赖复杂换景。",
        method:
          "Single-image lip-sync: short spoken lines, clear mouth visibility, minimal physical action, optional product mention through proof.",
        requiredInputs: ["人物图片", "最终文案", "动作提示词"],
        outputs: ["口型同步 MP4", "字幕"],
        providerNeeds: ["heygen"],
        qualityGate: "没有人物图时必须阻止生成并提示上传。"
      },
      LOCAL_POLISH_STAGE
    ]
  },
  "personal-ip": {
    mode: "personal-ip",
    label: "个人IP视频",
    summary: "不默认带货，先判断探店、知识、观点、日常、行业洞察等类型，再按人设输出脚本。",
    builtInMethods: [
      "Personal IP subtype classification",
      "Creator persona consistency",
      "Knowledge/output framework",
      "AI talking-head or mixed material delivery"
    ],
    defaultInputs: ["IP 人设", "主题/原视频链接", "口头禅和禁用词", "知识库"],
    stages: [
      {
        ...SHARED_ANALYSIS_STAGE,
        method:
          "Personal IP analysis: classify store visit, knowledge output, opinion, daily workflow, industry insight, experience sharing, community interaction, or commerce."
      },
      {
        ...SCRIPT_STAGE,
        method:
          "Personal IP script method: keep stable viewpoint and tone; convert expertise into mistake, framework, comparison, checklist, field observation, or personal lesson."
      },
      {
        id: "ip-render-path",
        label: "选择呈现路径",
        goal: "根据内容类型选择预设数字人口播、上传人物图口型同步、探店素材混剪或后续生视频。",
        method:
          "Do not force sales CTA. Use follow, comment, save, visit, learning action, or commerce CTA only when the task asks for selling.",
        requiredInputs: ["最终文案", "素材或 Avatar", "输出比例"],
        outputs: ["数字人口播/混剪基础视频"],
        providerNeeds: ["heygen", "video", "local"],
        qualityGate: "个人 IP 的语气、人设和禁用词必须被保留。"
      },
      LOCAL_POLISH_STAGE
    ]
  },
  "viral-remix": {
    mode: "viral-remix",
    label: "爆款视频复刻",
    summary: "按原视频链接/素材先提取、拉片、分析，再生成可编辑脚本、分镜提示词和统一故事板图。",
    builtInMethods: [
      "Claude Code style video breakdown",
      "Viral reference remix",
      "Image2 unified storyboard",
      "Seedance/Jimeng/Kling image-to-video planning"
    ],
    defaultInputs: ["原视频链接", "参考视频/截图/文案", "商品或主题", "知识库/爆款案例"],
    stages: [
      SHARED_ANALYSIS_STAGE,
      {
        id: "remix-strategy",
        label: "复刻策略",
        goal: "保留市场验证过的结构、钩子功能、情绪曲线和 CTA 位置，替换表达和视觉签名。",
        method:
          "Viral remix method: reuse mechanics, replace wording, examples, creator persona, catchphrases, music identity, exact shot order, and distinctive visuals.",
        requiredInputs: ["拉片分析", "爆款文案/案例", "任务主题"],
        outputs: ["复刻策略", "原创边界", "相似风险"],
        providerNeeds: ["llm"],
        qualityGate: "必须输出可审查的复刻策略，不能只给最终文案。"
      },
      SCRIPT_STAGE,
      {
        id: "visual-storyboard",
        label: "分镜提示词与故事板",
        goal: "生成带画面的统一故事板和每个镜头的生图/生视频提示词。",
        method:
          "Image2 storyboard method: one multi-panel storyboard image, continuity locks, panel-level image prompts, and motion prompts for image-to-video models.",
        requiredInputs: ["确认后的文案", "复刻策略", "视觉设定"],
        outputs: ["分镜提示词", "统一视觉设定", "故事板图", "整条视频提示词"],
        providerNeeds: ["llm", "image", "video"],
        qualityGate: "分镜数量可自动，不固定九宫格；人物、产品、服装、场景和色调必须统一。"
      },
      LOCAL_POLISH_STAGE
    ]
  },
  "mixed-cut": {
    mode: "mixed-cut",
    label: "混剪视频",
    summary: "不要求真人或数字人，专注上传素材的批量混剪；去重处理作为独立模式执行。",
    builtInMethods: [
      "Mixed-cut material analysis",
      "Viral reference breakdown",
      "Voiceover/subtitle spine",
      "Local render and polish"
    ],
    defaultInputs: ["混剪素材", "生成数量", "原视频链接/参考文案", "脚本目标", "BGM 可选"],
    stages: [
      {
        ...SHARED_ANALYSIS_STAGE,
        method:
          "Mixed-cut analysis: classify uploaded materials by hook visual, proof visual, context visual, objection visual, result visual, CTA visual, caption role, and edit order."
      },
      {
        ...SCRIPT_STAGE,
        method:
          "Mixed-cut script method: write a voiceover/subtitle spine that supports B-roll, product shots, screen recordings, generated visuals, and optional digital-human inserts."
      },
      {
        id: "material-edit-plan",
        label: "批量素材编排/基础混剪",
        goal: "根据目标数量，把素材按钩子、证明、对比、转场、CTA 的顺序组合成多条可导出的基础混剪。",
        method:
          "Do not assume a real person is required. Use uploaded assets, subtitles, local rendering, and per-video edit decision records. Deduplication happens later in video-dedup mode.",
        requiredInputs: ["混剪素材", "最终文案", "素材编排计划", "生成数量"],
        outputs: ["批量混剪 MP4", "时间轴字幕", "封面", "剪辑记录", "素材使用说明"],
        providerNeeds: ["local", "video"],
        qualityGate: "混剪模式不能只产出数字人口播占位，必须至少使用上传素材生成成品。"
      },
      LOCAL_POLISH_STAGE
    ]
  },
  "video-dedup": {
    mode: "video-dedup",
    label: "视频去重处理",
    summary:
      "导入任意成片或混剪结果后做保真去重处理，输出处理后视频和内部重复风险/原创度评分报告。",
    builtInMethods: [
      "Originality score report",
      "Fidelity-preserving technical dedup",
      "Low-value dedup warning",
      "Local render with optional video-model rewrite"
    ],
    defaultInputs: ["待处理 MP4", "目标原创度评分", "去重策略", "字幕/封面样式"],
    stages: [
      {
        id: "dedup-source-ingest",
        label: "导入待处理视频",
        goal: "选择混剪成片、本地视频或下载原视频作为去重处理源。",
        method:
          "Record source asset, duration, selected preset, and current title/subtitle/cover style before rewriting.",
        requiredInputs: ["本地 MP4 或任务产物"],
        outputs: ["待处理视频资产"],
        providerNeeds: ["local"],
        qualityGate: "没有待处理视频时必须阻止运行。"
      },
      {
        id: "fidelity-dedup",
        label: "保真去重处理",
        goal: "尽量保持肉眼观感，同时通过重采样、轻微像素扰动、编码结构变化、字幕标题封面变化降低重复风险。",
        method:
          "Default strategy is fidelity-strong. It changes frame sampling, slight crop/scale, color, noise, GOP, and metadata while avoiding obvious mirror/border tricks. Optional V2V can be added later through the OpenAI-compatible video provider.",
        requiredInputs: ["待处理视频", "目标原创度评分"],
        outputs: ["处理后 MP4", "封面", "字幕"],
        providerNeeds: ["local", "video"],
        qualityGate: "只做轻微后处理时必须提示仍有同质化风险。"
      },
      {
        id: "originality-score",
        label: "原创度评分",
        goal: "输出 0-100 的内部原创度评分，达到 80+ 才标记为通过。",
        method:
          "Score segment restructure, source reuse, visual variation, subtitle/title/cover variation, audio variation, script risk, and watermark risk.",
        requiredInputs: ["处理前视频", "处理后视频", "剪辑/处理记录"],
        outputs: ["原创度评分报告", "建议修改项"],
        providerNeeds: ["local", "llm"],
        qualityGate: "评分低于目标值时必须给出原因和下一步建议，不能承诺平台官方判定。"
      },
      LOCAL_POLISH_STAGE
    ]
  }
};

export function getProductionModeWorkflow(mode: VideoGenerationMode): ProductionModeWorkflow {
  return PRODUCTION_MODE_WORKFLOWS[mode] ?? PRODUCTION_MODE_WORKFLOWS["preset-avatar"];
}

export function productionWorkflowPromptLines(mode: VideoGenerationMode | undefined): string[] {
  const workflow = getProductionModeWorkflow(mode ?? "preset-avatar");
  return [
    `Mode workflow: ${workflow.label}.`,
    `Workflow summary: ${workflow.summary}`,
    "Built-in methods for this mode:",
    ...workflow.builtInMethods.map((method) => `- ${method}`),
    "Required workflow stages:",
    ...workflow.stages.map(
      (stage, index) =>
        `${index + 1}. ${stage.label}: ${stage.goal} Method: ${stage.method} Outputs: ${stage.outputs.join(
          ", "
        )}. Quality gate: ${stage.qualityGate}`
    )
  ];
}

export function storyboardWorkflowPromptLines(mode: VideoGenerationMode | undefined): string[] {
  const workflow = getProductionModeWorkflow(mode ?? "viral-remix");
  return workflow.stages
    .filter(
      (stage) =>
        stage.id.includes("storyboard") ||
        stage.id.includes("analysis") ||
        stage.id.includes("strategy") ||
        stage.id.includes("script")
    )
    .flatMap((stage, index) => [
      `${index + 1}. Storyboard-related stage: ${stage.label}.`,
      `Goal: ${stage.goal}`,
      `Method: ${stage.method}`,
      `Outputs: ${stage.outputs.join(", ")}`,
      `Quality gate: ${stage.qualityGate}`
    ]);
}
