import {
  CheckCircle2,
  Download,
  FileSearch,
  FolderOpen,
  KeyRound,
  Link2,
  Monitor,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Smartphone,
  Save,
  Trash2,
  Upload,
  UserRound,
  WandSparkles
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  DEFAULT_APP_PATH_SETTINGS,
  type AppPathSettingKind,
  type AppPathSettings
} from "../shared/appSettings";
import {
  CONTENT_LANGUAGES,
  DEFAULT_COVER_STYLE,
  DEFAULT_CREATIVE_WORKFLOW,
  DEFAULT_FRAME_TITLE_STYLE,
  DEFAULT_PERSONAL_IP_PROFILE,
  DEFAULT_SUBTITLE_STYLE,
  OUTPUT_PRESETS,
  type CoverStyle,
  type FrameTitleStyle,
  type MediaAsset,
  type OriginalityScoreReport,
  type OutputPresetId,
  type PersonalIpProfile,
  type StoryScriptPackage,
  type SubtitleStyle,
  type VisualStoryboardPackage,
  type VisualStoryboardPanelCount,
  type VideoGenerationMode,
  type VideoTask,
  type VideoTaskSummary
} from "../shared/domain";
import type { DigitalHumanStudioAPI, HeyGenAvatarLook, UpdateTaskInput } from "../shared/ipc";
import { calculateMixedCutBatchPlan, type MixedCutBatchPlan } from "../shared/mixedCutPlanning";
import {
  getProductionModeWorkflow,
  type ProductionModeWorkflow
} from "../shared/productionWorkflows";
import type {
  ProviderId,
  SaveServiceConfigurationInput,
  ServiceConfiguration,
  ServiceConnectionCheck,
  ServiceModelList,
  ServiceConfigurationSettings
} from "../shared/serviceConfig";
import { defaultServiceSettings } from "../shared/serviceConfig";
import { countCompleteSteps } from "../shared/workbench";

const now = new Date().toISOString();

type PreviewMode = "finished" | "cover";
type ActiveWorkspaceTab = "analysis-center" | VideoGenerationMode;
type ActiveOperation = "download-original" | "extract-copy" | "visual-analysis";
type OperationNotice = {
  tone: "running" | "success" | "error";
  title: string;
  detail?: string;
};
type TaskNameDialog =
  | {
      mode: "create";
      value: string;
    }
  | {
      mode: "rename";
      taskId: string;
      currentTitle: string;
      value: string;
    };

interface AvatarCreateDialog {
  name: string;
  prompt: string;
}

const fallbackTask: VideoTask = {
  id: "preview-task",
  title: "护肤品口播样片",
  originalVideoUrl: "",
  exportDirectory: "",
  sourceScript: "如果你的内容一直有播放，却始终带不动成交，问题可能不在流量。",
  finalScript: "播放量不差却没有订单时，先别急着加预算。真正要改的，往往是前三秒给用户的购买理由。",
  similarityRisk: "low",
  scriptGenerationNotes: "本地预览脚本。",
  contentLanguage: "zh-CN",
  generationMode: "preset-avatar",
  avatarMode: "preset-avatar",
  presetAvatarId: "",
  presetAvatarGroupId: "",
  avatarDescriptionPrompt: "",
  motionPrompt: "",
  generatedPresenterImageSelections: {},
  mixedCutTargetCount: 1,
  mixedCutMaterialDirectory: "",
  mixedCutBackgroundMusicDirectory: "",
  mixedCutDubbingDirectory: "",
  mixedCutChapterMode: "fill-with-bgm",
  mixedCutReuseRate: 35,
  mixedCutRemoveOriginalAudio: false,
  mixedCutEnableTransitions: false,
  mixedCutBgmVolume: 70,
  dedupTargetScore: 80,
  dedupStrategy: "content-rewrite",
  dedupAttemptCount: 0,
  customFontFamily: "",
  selectedOutputPresets: ["portrait-9-16"],
  frameTitleStyle: DEFAULT_FRAME_TITLE_STYLE,
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
  coverStyle: DEFAULT_COVER_STYLE,
  personalIpProfile: DEFAULT_PERSONAL_IP_PROFILE,
  creativeWorkflow: DEFAULT_CREATIVE_WORKFLOW,
  publishingPackage: {
    title: "",
    description: "",
    tags: [],
    notes: ""
  },
  steps: [
    { id: "source", label: "提取文案", status: "complete", updatedAt: now },
    { id: "script", label: "原创脚本", status: "complete", updatedAt: now },
    { id: "avatar", label: "数字人", status: "running", updatedAt: now },
    { id: "subtitles", label: "字幕", status: "waiting", updatedAt: now },
    { id: "post-production", label: "合成", status: "waiting", updatedAt: now },
    { id: "export", label: "导出", status: "waiting", updatedAt: now }
  ],
  outputVariants: [],
  mediaAssets: [],
  createdAt: now,
  updatedAt: now
};

const fallbackTasks: VideoTaskSummary[] = [
  {
    id: fallbackTask.id,
    title: fallbackTask.title,
    contentLanguage: fallbackTask.contentLanguage,
    generationMode: fallbackTask.generationMode,
    selectedOutputPresets: fallbackTask.selectedOutputPresets,
    activeStepLabel: "数字人",
    status: "running",
    createdAt: fallbackTask.createdAt,
    updatedAt: fallbackTask.updatedAt
  }
];

type EditableTaskPatch = Partial<
  Pick<
    VideoTask,
    | "title"
    | "originalVideoUrl"
    | "exportDirectory"
    | "sourceScript"
    | "finalScript"
    | "contentLanguage"
    | "generationMode"
    | "avatarMode"
    | "presetAvatarId"
    | "presetAvatarGroupId"
    | "avatarDescriptionPrompt"
    | "motionPrompt"
    | "selectedOutputPresets"
    | "frameTitleStyle"
    | "subtitleStyle"
    | "coverStyle"
    | "customFontFamily"
    | "personalIpProfile"
    | "generatedPresenterImageSelections"
    | "mixedCutTargetCount"
    | "mixedCutMaterialDirectory"
    | "mixedCutBackgroundMusicDirectory"
    | "mixedCutDubbingDirectory"
    | "mixedCutChapterMode"
    | "mixedCutReuseRate"
    | "mixedCutRemoveOriginalAudio"
    | "mixedCutEnableTransitions"
    | "mixedCutBgmVolume"
    | "dedupSourceVideoAssetId"
    | "dedupTargetScore"
    | "dedupStrategy"
    | "dedupAttemptCount"
  >
>;

const GENERATION_MODE_TABS: Array<{
  id: VideoGenerationMode;
  label: string;
  description: string;
  disabled?: boolean;
}> = [
  {
    id: "preset-avatar",
    label: "预设数字人口播",
    description: "HeyGen Avatar + 脚本"
  },
  {
    id: "product-avatar",
    label: "商品/带货视频",
    description: "商品图 + 素材 + 可选数字人"
  },
  {
    id: "image-lipsync",
    label: "图片口型同步",
    description: "人物图 + 对口型"
  },
  {
    id: "personal-ip",
    label: "个人IP视频",
    description: "探店 / 知识 / 观点 / 人设"
  },
  {
    id: "viral-remix",
    label: "爆款视频复刻",
    description: "复刻结构，原创表达"
  },
  {
    id: "mixed-cut",
    label: "混剪视频",
    description: "批量素材混剪"
  },
  {
    id: "video-dedup",
    label: "视频去重处理",
    description: "成片二次处理 + 80分质检"
  }
];

const WORKSPACE_TABS: Array<{
  id: ActiveWorkspaceTab;
  label: string;
  description: string;
}> = [
  {
    id: "analysis-center",
    label: "视频分析中心",
    description: "先分析资料并推荐模式"
  },
  ...GENERATION_MODE_TABS
];

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appVersion, setAppVersion] = useState("自媒体视频工作台 本地预览");
  const [taskSummaries, setTaskSummaries] = useState<VideoTaskSummary[]>(fallbackTasks);
  const [selectedTaskId, setSelectedTaskId] = useState(fallbackTask.id);
  const [selectedTask, setSelectedTask] = useState<VideoTask>(fallbackTask);
  const [activeWorkspaceTab, setActiveWorkspaceTab] =
    useState<ActiveWorkspaceTab>("analysis-center");
  const [taskError, setTaskError] = useState("");
  const [serviceConfigurations, setServiceConfigurations] = useState<ServiceConfiguration[]>([]);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, SettingsDraft>>({});
  const [settingsCheckResults, setSettingsCheckResults] = useState<
    Record<string, ServiceConnectionCheck>
  >({});
  const [settingsModelLists, setSettingsModelLists] = useState<Record<string, ServiceModelList>>(
    {}
  );
  const [activeSettingsProviderId, setActiveSettingsProviderId] = useState<ProviderId | "">("");
  const [settingsBusyProviderId, setSettingsBusyProviderId] = useState<ProviderId | "">("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [appPathSettings, setAppPathSettings] =
    useState<AppPathSettings>(DEFAULT_APP_PATH_SETTINGS);
  const [pathSettingsMessage, setPathSettingsMessage] = useState("");
  const [choosingPathKind, setChoosingPathKind] = useState<AppPathSettingKind | "">("");
  const [actionMessage, setActionMessage] = useState("");
  const [operationNotice, setOperationNotice] = useState<OperationNotice | null>(null);
  const [activeOperation, setActiveOperation] = useState<ActiveOperation | null>(null);
  const [isWorkflowRunning, setIsWorkflowRunning] = useState(false);
  const [taskNameDialog, setTaskNameDialog] = useState<TaskNameDialog | null>(null);
  const [isTaskNameSaving, setIsTaskNameSaving] = useState(false);
  const [deleteTaskDialog, setDeleteTaskDialog] = useState<VideoTaskSummary | null>(null);
  const [isTaskDeleting, setIsTaskDeleting] = useState(false);
  const [avatarCreateDialog, setAvatarCreateDialog] = useState<AvatarCreateDialog | null>(null);
  const [isAvatarCreating, setIsAvatarCreating] = useState(false);
  const [outputConfirmTask, setOutputConfirmTask] = useState<VideoTask | null>(null);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [avatarLooks, setAvatarLooks] = useState<HeyGenAvatarLook[]>([]);
  const [avatarLookMessage, setAvatarLookMessage] = useState("");
  const [isAvatarLookLoading, setIsAvatarLookLoading] = useState(false);
  const [activePreviewMode, setActivePreviewMode] = useState<PreviewMode>("finished");
  const [storyboardPanelCount, setStoryboardPanelCount] =
    useState<VisualStoryboardPanelCount>("auto");
  const [storyScriptPackage, setStoryScriptPackage] = useState<StoryScriptPackage | null>(null);
  const [storyScriptError, setStoryScriptError] = useState("");
  const [visualStoryboard, setVisualStoryboard] = useState<VisualStoryboardPackage | null>(null);
  const [visualStoryboardError, setVisualStoryboardError] = useState("");
  const [originalityReport, setOriginalityReport] = useState<OriginalityScoreReport | null>(null);

  const steps = selectedTask.steps;
  const completeCount = useMemo(() => countCompleteSteps(steps), [steps]);
  const frameTitleStyle = selectedTask.frameTitleStyle ?? DEFAULT_FRAME_TITLE_STYLE;
  const subtitleStyle = selectedTask.subtitleStyle ?? DEFAULT_SUBTITLE_STYLE;
  const coverStyle = selectedTask.coverStyle ?? DEFAULT_COVER_STYLE;
  const exportDirectoryLabel = selectedTask.exportDirectory?.trim() || "未选择保存目录";
  const sourceScriptLabel =
    selectedTask.generationMode === "viral-remix" ? "爆款参考文案" : "参考文案";
  const currentTaskMediaAssets = useMemo(
    () => getTaskScopedMediaAssets(selectedTask),
    [selectedTask]
  );
  const primaryVariant =
    selectedTask.outputVariants.find((variant) =>
      selectedTask.selectedOutputPresets.includes(variant.presetId)
    ) ?? selectedTask.outputVariants[0];
  const productImageAsset = currentTaskMediaAssets.find(
    (asset) => asset.id === selectedTask.productImageAssetId
  );
  const customFontAsset =
    currentTaskMediaAssets.find((asset) => asset.id === selectedTask.customFontAssetId) ??
    currentTaskMediaAssets.find((asset) => asset.kind === "custom-font");
  const referenceImageAsset =
    currentTaskMediaAssets.find((asset) => asset.id === selectedTask.referenceImageAssetId) ??
    currentTaskMediaAssets.find((asset) => asset.kind === "reference-image");
  const generatedPresenterAssets = useMemo(
    () => currentTaskMediaAssets.filter((asset) => asset.kind === "generated-presenter-image"),
    [currentTaskMediaAssets]
  );
  const selectedGeneratedPresenterAssetId = primaryVariant
    ? selectedTask.generatedPresenterImageSelections?.[primaryVariant.presetId]
    : undefined;
  const generatedPresenterAsset =
    generatedPresenterAssets.find((asset) => asset.id === selectedGeneratedPresenterAssetId) ??
    currentTaskMediaAssets.find(
      (asset) =>
        asset.kind === "generated-presenter-image" &&
        primaryVariant &&
        asset.relativePath.includes(primaryVariant.presetId)
    ) ??
    currentTaskMediaAssets.find(
      (asset) => asset.id === selectedTask.generatedPresenterImageAssetId
    );
  const sourceMaterialAssets = currentTaskMediaAssets.filter((asset) =>
    ["source-video", "source-audio", "source-transcript", "source-visual-analysis"].includes(
      asset.kind
    )
  );
  const mixedCutMaterialAssets = currentTaskMediaAssets.filter(
    (asset) => asset.kind === "mixed-cut-material"
  );
  const mixedCutVisualMaterialCount = mixedCutMaterialAssets.filter((asset) =>
    isVisualMixedCutAsset(asset.relativePath)
  ).length;
  const mixedCutAudioMaterialCount = mixedCutMaterialAssets.length - mixedCutVisualMaterialCount;
  const mixedCutBatchPlan = useMemo(
    () =>
      calculateMixedCutBatchPlan({
        materialCount: mixedCutVisualMaterialCount,
        reuseRate: selectedTask.mixedCutReuseRate
      }),
    [mixedCutVisualMaterialCount, selectedTask.mixedCutReuseRate]
  );
  const mixedCutOutputAssets = currentTaskMediaAssets.filter((asset) =>
    ["mixed-cut-video", "edit-decision-record"].includes(asset.kind)
  );
  const mixedCutVideoAssets = currentTaskMediaAssets.filter(
    (asset) => asset.kind === "mixed-cut-video"
  );
  const latestMixedCutVideoAsset = [...mixedCutVideoAssets].reverse()[0];
  const dedupAssets = currentTaskMediaAssets.filter((asset) =>
    ["dedup-source-video", "dedup-processed-video", "dedup-report"].includes(asset.kind)
  );
  const dedupSourceAsset =
    (selectedTask.dedupSourceVideoAssetId
      ? currentTaskMediaAssets.find((asset) => asset.id === selectedTask.dedupSourceVideoAssetId)
      : undefined) ??
    [...dedupAssets].reverse().find((asset) => asset.kind === "dedup-source-video");
  const dedupProcessedAsset = [...dedupAssets]
    .reverse()
    .find((asset) => asset.kind === "dedup-processed-video");
  const latestDedupReportAsset = [...currentTaskMediaAssets]
    .reverse()
    .find((asset) => asset.kind === "dedup-report" && asset.relativePath.endsWith(".json"));
  const knowledgeAssets = currentTaskMediaAssets.filter((asset) =>
    ["knowledge-document", "viral-copy-reference"].includes(asset.kind)
  );
  const knowledgeContextCounts = useMemo(
    () => countKnowledgeContextSources(selectedTask),
    [selectedTask]
  );
  const modeRecommendationReport = useMemo(
    () =>
      buildModeRecommendationReport({
        generatedPresenterImageCount: generatedPresenterAssets.length,
        knowledgeContextCounts,
        mixedCutVisualMaterialCount,
        sourceMaterialCount: sourceMaterialAssets.length,
        task: selectedTask
      }),
    [
      generatedPresenterAssets.length,
      knowledgeContextCounts,
      mixedCutVisualMaterialCount,
      sourceMaterialAssets.length,
      selectedTask
    ]
  );
  const analysisRecommendationReady = hasAnalysisCenterResult(selectedTask);
  const recommendedProductionWorkflow = getProductionModeWorkflow(
    modeRecommendationReport.primaryMode
  );
  const visualStoryboardAssets = currentTaskMediaAssets.filter(
    (asset) => asset.kind === "visual-storyboard"
  );
  const storyScriptAssets = currentTaskMediaAssets.filter(
    (asset) => asset.kind === "story-script-options"
  );
  const latestStoryScriptJsonAsset = [...storyScriptAssets]
    .reverse()
    .find((asset) => asset.relativePath.endsWith(".json"));
  const latestStoryboardImageAsset = [...visualStoryboardAssets]
    .reverse()
    .find((asset) => /\.(png|jpe?g|webp)$/i.test(asset.relativePath));
  const latestStoryboardJsonAsset = [...visualStoryboardAssets]
    .reverse()
    .find((asset) => asset.relativePath.endsWith(".json"));
  const previewRelativePaths = useMemo(
    () =>
      Array.from(
        new Set(
          [
            productImageAsset?.relativePath,
            customFontAsset?.relativePath,
            referenceImageAsset?.relativePath,
            generatedPresenterAsset?.relativePath,
            ...generatedPresenterAssets.map((asset) => asset.relativePath),
            latestStoryScriptJsonAsset?.relativePath,
            latestStoryboardImageAsset?.relativePath,
            latestStoryboardJsonAsset?.relativePath,
            latestDedupReportAsset?.relativePath,
            ...mixedCutOutputAssets.map((asset) => asset.relativePath),
            ...dedupAssets.map((asset) => asset.relativePath),
            ...selectedTask.outputVariants.flatMap((variant) => [
              variant.finishedVideoPath,
              variant.coverImagePath
            ])
          ].filter((path): path is string => Boolean(path))
        )
      ),
    [
      generatedPresenterAsset?.relativePath,
      generatedPresenterAssets,
      customFontAsset?.relativePath,
      latestStoryboardImageAsset?.relativePath,
      latestStoryboardJsonAsset?.relativePath,
      latestStoryScriptJsonAsset?.relativePath,
      latestDedupReportAsset?.relativePath,
      mixedCutOutputAssets,
      dedupAssets,
      productImageAsset?.relativePath,
      referenceImageAsset?.relativePath,
      selectedTask
    ]
  );
  const previewPathSignature = previewRelativePaths.join("|");
  const finishedVideoUrl = primaryVariant?.finishedVideoPath
    ? assetUrls[primaryVariant.finishedVideoPath]
    : "";
  const latestMixedCutVideoUrl = latestMixedCutVideoAsset?.relativePath
    ? assetUrls[latestMixedCutVideoAsset.relativePath]
    : "";
  const dedupSourceVideoUrl = dedupSourceAsset?.relativePath
    ? assetUrls[dedupSourceAsset.relativePath]
    : "";
  const dedupProcessedVideoUrl = dedupProcessedAsset?.relativePath
    ? assetUrls[dedupProcessedAsset.relativePath]
    : "";
  const coverAssetUrl = primaryVariant?.coverImagePath
    ? assetUrls[primaryVariant.coverImagePath]
    : "";
  const usesResultPreview =
    selectedTask.generationMode === "mixed-cut" || selectedTask.generationMode === "video-dedup";
  const productImageUrl = productImageAsset?.relativePath
    ? assetUrls[productImageAsset.relativePath]
    : "";
  const referenceImageUrl = referenceImageAsset?.relativePath
    ? assetUrls[referenceImageAsset.relativePath]
    : "";
  const generatedPresenterUrl = generatedPresenterAsset?.relativePath
    ? assetUrls[generatedPresenterAsset.relativePath]
    : "";
  const customFontUrl = customFontAsset?.relativePath
    ? assetUrls[customFontAsset.relativePath]
    : "";
  const visualStoryboardImageUrl = latestStoryboardImageAsset?.relativePath
    ? assetUrls[latestStoryboardImageAsset.relativePath]
    : "";
  const storyScriptJsonUrl = latestStoryScriptJsonAsset?.relativePath
    ? assetUrls[latestStoryScriptJsonAsset.relativePath]
    : "";
  const visualStoryboardJsonUrl = latestStoryboardJsonAsset?.relativePath
    ? assetUrls[latestStoryboardJsonAsset.relativePath]
    : "";
  const dedupReportJsonUrl = latestDedupReportAsset?.relativePath
    ? assetUrls[latestDedupReportAsset.relativePath]
    : "";
  const displayedStoryScriptPackage = storyScriptJsonUrl ? storyScriptPackage : null;
  const displayedStoryScriptError = storyScriptJsonUrl ? storyScriptError : "";
  const displayedVisualStoryboard = visualStoryboardJsonUrl ? visualStoryboard : null;
  const displayedVisualStoryboardError = visualStoryboardJsonUrl ? visualStoryboardError : "";
  const previewPresetId = primaryVariant?.presetId ?? selectedTask.selectedOutputPresets[0];
  const heygenConfiguration = serviceConfigurations.find(
    (configuration) => configuration.providerId === "heygen"
  );
  const configuredAvatarIds = useMemo(
    () => parseAvatarOptions(heygenConfiguration?.settings.avatarId),
    [heygenConfiguration?.settings.avatarId]
  );
  const avatarOptions = useMemo(
    () => Array.from(new Set([...avatarLooks.map((look) => look.id), ...configuredAvatarIds])),
    [avatarLooks, configuredAvatarIds]
  );
  const selectedAvatarLook = avatarLooks.find(
    (look) =>
      look.id === selectedTask.presetAvatarId ||
      Boolean(look.groupId && look.groupId === selectedTask.presetAvatarGroupId)
  );

  function requireDesktopRuntime(
    actionLabel: string
  ): NonNullable<typeof window.digitalHumanStudio> | null {
    const api = window.digitalHumanStudio;
    if (api) {
      return api;
    }

    setActionMessage(`${actionLabel}需要桌面版本机服务；当前窗口没有连接到 Electron 后端。`);
    return null;
  }

  function showOperationNotice(notice: OperationNotice): void {
    setOperationNotice(notice);
    setActionMessage(notice.detail ? `${notice.title}: ${notice.detail}` : notice.title);
  }

  useEffect(() => {
    if (!window.digitalHumanStudio) {
      return;
    }

    window.digitalHumanStudio
      .getAppInfo()
      .then((info) => setAppVersion(`${info.name} ${info.version}`))
      .catch(() => setAppVersion("自媒体视频工作台"));
    void loadServiceConfigurations();
    void loadAppPathSettings();
  }, []);

  useEffect(() => {
    if (!window.digitalHumanStudio) {
      return;
    }

    let ignore = false;

    async function loadTasks() {
      try {
        const summaries = await window.digitalHumanStudio?.listTasks();
        if (!summaries || ignore) {
          return;
        }

        setTaskSummaries(summaries);
        const nextSelectedId = summaries[0]?.id;
        if (!nextSelectedId) {
          setSelectedTaskId("");
          setSelectedTask(fallbackTask);
          setAssetUrls({});
          return;
        }

        setSelectedTaskId(nextSelectedId);
        const task = await window.digitalHumanStudio?.getTask(nextSelectedId);
        if (task && !ignore) {
          setSelectedTask(task);
        }
      } catch (error) {
        if (!ignore) {
          setTaskError(error instanceof Error ? error.message : "任务加载失败");
        }
      }
    }

    void loadTasks();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const api = window.digitalHumanStudio;
    if (!api || previewRelativePaths.length === 0) {
      return;
    }

    const desktopApi = api;
    let ignore = false;

    async function loadAssetUrls() {
      const resolvedEntries = await Promise.all(
        previewRelativePaths.map(async (relativePath) => {
          try {
            const url = await desktopApi.resolveTaskAssetUrl({
              taskId: selectedTask.id,
              relativePath
            });
            return [relativePath, url] as const;
          } catch {
            return [relativePath, ""] as const;
          }
        })
      );

      if (ignore) {
        return;
      }

      setAssetUrls(Object.fromEntries(resolvedEntries.filter(([, url]) => Boolean(url))));
    }

    void loadAssetUrls();

    return () => {
      ignore = true;
    };
  }, [previewPathSignature, previewRelativePaths, selectedTask.id]);

  useEffect(() => {
    if (!storyScriptJsonUrl) {
      return;
    }

    let ignore = false;

    async function loadStoryScriptPackage() {
      try {
        const response = await fetch(storyScriptJsonUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const parsed = (await response.json()) as StoryScriptPackage;
        if (!ignore) {
          setStoryScriptPackage(parsed);
          setStoryScriptError("");
        }
      } catch (error) {
        if (!ignore) {
          setStoryScriptPackage(null);
          setStoryScriptError(error instanceof Error ? error.message : "剧情脚本方案读取失败");
        }
      }
    }

    void loadStoryScriptPackage();

    return () => {
      ignore = true;
    };
  }, [storyScriptJsonUrl]);

  useEffect(() => {
    if (!visualStoryboardJsonUrl) {
      return;
    }

    let ignore = false;

    async function loadVisualStoryboard() {
      try {
        const response = await fetch(visualStoryboardJsonUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const parsed = (await response.json()) as VisualStoryboardPackage;
        if (!ignore) {
          setVisualStoryboard(parsed);
          setVisualStoryboardError("");
        }
      } catch (error) {
        if (!ignore) {
          setVisualStoryboard(null);
          setVisualStoryboardError(error instanceof Error ? error.message : "视觉故事板读取失败");
        }
      }
    }

    void loadVisualStoryboard();

    return () => {
      ignore = true;
    };
  }, [visualStoryboardJsonUrl]);

  useEffect(() => {
    if (!dedupReportJsonUrl) {
      return;
    }

    let ignore = false;

    async function loadOriginalityReport() {
      try {
        const response = await fetch(dedupReportJsonUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const parsed = (await response.json()) as OriginalityScoreReport;
        if (!ignore) {
          setOriginalityReport(parsed);
        }
      } catch {
        if (!ignore) {
          setOriginalityReport(null);
        }
      }
    }

    void loadOriginalityReport();

    return () => {
      ignore = true;
    };
  }, [dedupReportJsonUrl]);

  useEffect(() => {
    if (
      selectedTask.generationMode !== "preset-avatar" ||
      !heygenConfiguration?.credentialConfigured ||
      avatarLooks.length > 0 ||
      isAvatarLookLoading
    ) {
      return;
    }

    void refreshHeyGenAvatarLooks(false);
  }, [
    selectedTask.generationMode,
    heygenConfiguration?.credentialConfigured,
    avatarLooks.length,
    isAvatarLookLoading
  ]);

  async function refreshTaskState(taskId: string, nextTask?: VideoTask) {
    if (!window.digitalHumanStudio) {
      return;
    }

    const [summaries, loadedTask] = await Promise.all([
      window.digitalHumanStudio.listTasks(),
      nextTask ? Promise.resolve(nextTask) : window.digitalHumanStudio.getTask(taskId)
    ]);

    setTaskSummaries(summaries);
    setSelectedTaskId(taskId);
    if (loadedTask) {
      setSelectedTask(loadedTask);
    }
  }

  async function selectTask(taskId: string) {
    setSelectedTaskId(taskId);

    if (!window.digitalHumanStudio) {
      return;
    }

    const task = await window.digitalHumanStudio.getTask(taskId);
    if (task) {
      setSelectedTask(task);
    }
  }

  async function updateCurrentTask(patch: EditableTaskPatch) {
    if (!window.digitalHumanStudio) {
      return;
    }

    const input: UpdateTaskInput = {
      taskId: selectedTask.id,
      ...patch
    };
    const task = await window.digitalHumanStudio.updateTask(input);
    await refreshTaskState(task.id, task);
  }

  function openCreateTaskDialog() {
    const api = requireDesktopRuntime("新建任务");
    if (!api) {
      return;
    }

    setTaskError("");
    setTaskNameDialog({
      mode: "create",
      value: "新建视频任务"
    });
  }

  function openRenameTaskDialog(taskId: string, currentTitle: string) {
    const api = requireDesktopRuntime("重命名任务");
    if (!api) {
      return;
    }

    setTaskError("");
    setTaskNameDialog({
      mode: "rename",
      taskId,
      currentTitle,
      value: currentTitle
    });
  }

  async function submitTaskNameDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const api = requireDesktopRuntime(
      taskNameDialog?.mode === "rename" ? "重命名任务" : "新建任务"
    );
    if (!api || !taskNameDialog) {
      return;
    }

    const normalizedTitle = taskNameDialog.value.trim() || "未命名任务";
    setIsTaskNameSaving(true);
    setTaskError("");

    try {
      if (taskNameDialog.mode === "create") {
        const task = await api.createTask({
          title: normalizedTitle
        });
        const summaries = await api.listTasks();
        setTaskSummaries(summaries);
        setSelectedTaskId(task.id);
        setSelectedTask(task);
        setActionMessage(`已新建任务：${task.title}`);
      } else if (normalizedTitle !== taskNameDialog.currentTitle.trim()) {
        const task = await api.updateTask({
          taskId: taskNameDialog.taskId,
          title: normalizedTitle
        });
        await refreshTaskState(task.id, task);
        setActionMessage(`任务已重命名为：${task.title}`);
      }

      setTaskNameDialog(null);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "任务保存失败");
    } finally {
      setIsTaskNameSaving(false);
    }
  }

  function requestDeleteTask(taskId: string) {
    const targetTask = taskSummaries.find((task) => task.id === taskId);
    if (targetTask) {
      setDeleteTaskDialog(targetTask);
    }
  }

  async function deleteTask(taskId: string) {
    const api = requireDesktopRuntime("删除任务");
    if (!api) {
      return;
    }

    try {
      setIsTaskDeleting(true);
      setTaskError("");
      const summaries = await api.deleteTask(taskId);
      setTaskSummaries(summaries);
      const nextSelectedId =
        taskId === selectedTaskId
          ? summaries[0]?.id
          : summaries.find((task) => task.id === selectedTaskId)?.id;

      if (!nextSelectedId) {
        setSelectedTaskId("");
        setSelectedTask(fallbackTask);
        setAssetUrls({});
        setActionMessage("任务已删除。点击左上角 + 新建任务后继续。");
        return;
      }

      setSelectedTaskId(nextSelectedId);
      const nextTask = await api.getTask(nextSelectedId);
      if (nextTask) {
        setSelectedTask(nextTask);
      }
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "任务删除失败");
    } finally {
      setIsTaskDeleting(false);
      setDeleteTaskDialog(null);
    }
  }

  async function chooseExportDirectory(): Promise<VideoTask | null> {
    const api = requireDesktopRuntime("选择保存目录");
    if (!api) {
      return null;
    }

    const task = await api.chooseExportDirectory(selectedTask.id);
    await refreshTaskState(task.id, task);
    setActionMessage(
      task.exportDirectory?.trim()
        ? `保存目录已选择：${task.exportDirectory}`
        : "已取消选择保存目录"
    );
    return task;
  }

  async function runRealWorkflow() {
    const api = requireDesktopRuntime("一键输出视频和封面");
    if (!api) {
      return;
    }

    let taskForRun = selectedTask;
    if (!taskForRun.exportDirectory?.trim()) {
      setActionMessage("请先选择保存目录，再一键输出视频和封面。");
      const chosenTask = await chooseExportDirectory();
      if (!chosenTask?.exportDirectory?.trim()) {
        return;
      }
      taskForRun = chosenTask;
    }

    setOutputConfirmTask(taskForRun);
  }

  async function executeRealWorkflow(taskForRun: VideoTask) {
    const api = requireDesktopRuntime("一键输出视频和封面");
    if (!api) {
      return;
    }

    setOutputConfirmTask(null);
    setIsWorkflowRunning(true);
    setActionMessage("正在输出视频、封面和字幕文件...");

    try {
      const preflightMessage = await checkOutputServiceConfiguration(api, taskForRun);
      if (preflightMessage) {
        setActionMessage(preflightMessage);
        return;
      }

      await api.updateTask({
        taskId: taskForRun.id,
        originalVideoUrl: taskForRun.originalVideoUrl ?? "",
        exportDirectory: taskForRun.exportDirectory ?? "",
        sourceScript: taskForRun.sourceScript,
        finalScript: taskForRun.finalScript,
        contentLanguage: taskForRun.contentLanguage,
        generationMode: taskForRun.generationMode,
        avatarMode: taskForRun.avatarMode,
        presetAvatarId: taskForRun.presetAvatarId ?? "",
        presetAvatarGroupId: taskForRun.presetAvatarGroupId ?? "",
        avatarDescriptionPrompt: taskForRun.avatarDescriptionPrompt,
        motionPrompt: taskForRun.motionPrompt,
        generatedPresenterImageSelections: taskForRun.generatedPresenterImageSelections,
        mixedCutTargetCount: getMixedCutBatchPlanForTask(taskForRun).targetCount || 1,
        mixedCutMaterialDirectory: taskForRun.mixedCutMaterialDirectory,
        mixedCutBackgroundMusicDirectory: taskForRun.mixedCutBackgroundMusicDirectory,
        mixedCutDubbingDirectory: taskForRun.mixedCutDubbingDirectory,
        mixedCutChapterMode: taskForRun.mixedCutChapterMode,
        mixedCutReuseRate: taskForRun.mixedCutReuseRate,
        mixedCutRemoveOriginalAudio: taskForRun.mixedCutRemoveOriginalAudio,
        mixedCutEnableTransitions: taskForRun.mixedCutEnableTransitions,
        mixedCutBgmVolume: taskForRun.mixedCutBgmVolume,
        dedupSourceVideoAssetId: taskForRun.dedupSourceVideoAssetId ?? null,
        dedupTargetScore: taskForRun.dedupTargetScore,
        dedupStrategy: taskForRun.dedupStrategy,
        dedupAttemptCount: taskForRun.dedupAttemptCount,
        selectedOutputPresets: taskForRun.selectedOutputPresets,
        frameTitleStyle,
        subtitleStyle,
        coverStyle,
        personalIpProfile: taskForRun.personalIpProfile
      });
      const task = await api.runRealWorkflow(taskForRun.id);
      const failedStep = task.steps.find(
        (step) => step.status === "retry-ready" || step.status === "failed"
      );
      setActionMessage(
        failedStep
          ? withApiTroubleshootingHint(failedStep.errorMessage || `${failedStep.label}未完成`)
          : `视频、封面和字幕文件已输出到：${
              task.publishingPackage.exportDirectory ?? task.exportDirectory ?? "内部导出目录"
            }；当前版本暂未把字幕烧录进 MP4`
      );
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(
        withApiTroubleshootingHint(
          error instanceof Error ? error.message : "一键输出视频和封面失败"
        )
      );
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function savePreviewStyleSettings() {
    await updateCurrentTask({
      frameTitleStyle,
      subtitleStyle,
      coverStyle
    });
    setActionMessage("字幕、画面标题和封面样式已保存");
  }

  async function uploadProductImage() {
    const api = requireDesktopRuntime("上传商品图");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在选择商品图片...");

    try {
      const task = await api.uploadProductImage(selectedTask.id);
      setActionMessage(
        task.productImageAssetId ? "商品图片已导入，可在右侧预览" : "未选择商品图片，任务保持不变"
      );
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "商品图片导入失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function uploadReferenceImage() {
    const api = requireDesktopRuntime("上传人物图");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在选择人物图片...");

    try {
      const task = await api.uploadReferenceImage(selectedTask.id);
      setActionMessage(
        task.referenceImageAssetId ? "人物图片已导入，可在右侧预览" : "未选择人物图片，任务保持不变"
      );
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "人物图片导入失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function uploadCustomFont() {
    const api = requireDesktopRuntime("上传字体");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在选择字体文件...");

    try {
      const task = await api.uploadCustomFont(selectedTask.id);
      setActionMessage(
        task.customFontAssetId ? "字体已导入，并应用到字幕和封面预览" : "未选择字体文件"
      );
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "字体导入失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function downloadOriginalVideo() {
    const api = requireDesktopRuntime("下载原视频");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActiveOperation("download-original");
    showOperationNotice({
      tone: "running",
      title: "正在下载原视频",
      detail: "解析完成后会自动保存到任务素材，并复制到你设置的下载目录。"
    });

    try {
      await api.updateTask({
        taskId: selectedTask.id,
        originalVideoUrl: selectedTask.originalVideoUrl ?? ""
      });
      const task = await api.downloadOriginalVideo(selectedTask.id);
      const latestSource = latestTaskAsset(task, ["source-video", "source-audio"]);
      showOperationNotice({
        tone: "success",
        title: "下载视频完成",
        detail: [
          latestSource ? `文件：${assetFileName(latestSource.relativePath)}` : "",
          appPathSettings.sourceDownloadDirectory
            ? `已复制到：${appPathSettings.sourceDownloadDirectory}`
            : "已保存到当前任务素材中"
        ]
          .filter(Boolean)
          .join("；")
      });
      await refreshTaskState(task.id, task);
    } catch (error) {
      showOperationNotice({
        tone: "error",
        title: "下载视频失败",
        detail: error instanceof Error ? error.message : "原视频下载失败"
      });
    } finally {
      setActiveOperation(null);
      setIsWorkflowRunning(false);
    }
  }

  async function uploadSourceVideo() {
    const api = requireDesktopRuntime("上传原视频");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在选择原视频或原音频...");

    try {
      const task = await api.uploadSourceVideo(selectedTask.id);
      const imported = task.mediaAssets.some(
        (asset) => asset.kind === "source-video" || asset.kind === "source-audio"
      );
      setActionMessage(imported ? "原视频/原音频已导入，可继续提取文案或画面分析" : "未选择原视频");
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "原视频导入失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function uploadMixedCutMaterial() {
    const api = requireDesktopRuntime("上传混剪素材");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在选择混剪素材...");

    try {
      const beforeCount = mixedCutMaterialAssets.length;
      const task = await api.uploadMixedCutMaterial(selectedTask.id);
      const afterCount = task.mediaAssets.filter(
        (asset) => asset.kind === "mixed-cut-material"
      ).length;
      setActionMessage(
        afterCount > beforeCount
          ? `已导入 ${afterCount - beforeCount} 个混剪素材`
          : "未选择混剪素材"
      );
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "混剪素材导入失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  void uploadMixedCutMaterial;

  async function chooseMixedCutMaterialDirectory() {
    const api = requireDesktopRuntime("选择混剪素材文件夹");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在选择并同步混剪素材文件夹...");

    try {
      const task = await api.chooseMixedCutMaterialDirectory(selectedTask.id);
      const materialCount = task.mediaAssets.filter(
        (asset) => asset.kind === "mixed-cut-material"
      ).length;
      setActionMessage(
        materialCount > 0
          ? `已同步 ${materialCount} 个混剪素材`
          : "所选文件夹里没有找到支持的视频、图片或音频素材"
      );
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "混剪素材文件夹同步失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function importDedupSourceVideo() {
    const api = requireDesktopRuntime("导入待去重视频");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在选择待去重视频...");

    try {
      const task = await api.importDedupSourceVideo(selectedTask.id);
      const imported = task.mediaAssets.some((asset) => asset.kind === "dedup-source-video");
      setActionMessage(imported ? "待去重视频已导入，可一键输出处理版" : "未选择待去重视频");
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "待去重视频导入失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function runOriginalityScore() {
    const api = requireDesktopRuntime("原创度评分");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在生成原创度评分报告...");

    try {
      const task = await api.runOriginalityScore(selectedTask.id);
      setActionMessage("原创度评分报告已生成");
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "原创度评分失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function uploadKnowledgeDocuments() {
    const api = requireDesktopRuntime("上传知识库");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在选择知识库文档...");

    try {
      const beforeCount = knowledgeAssets.length;
      const task = await api.uploadKnowledgeDocuments(selectedTask.id);
      const afterCount = task.mediaAssets.filter((asset) =>
        ["knowledge-document", "viral-copy-reference"].includes(asset.kind)
      ).length;
      setActionMessage(
        afterCount > beforeCount ? `已导入 ${afterCount - beforeCount} 个知识库文档` : "未选择文档"
      );
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "知识库导入失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function uploadViralCopyReferences() {
    const api = requireDesktopRuntime("上传爆款文案");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在选择爆款文案或案例...");

    try {
      const beforeCount = knowledgeAssets.length;
      const task = await api.uploadViralCopyReferences(selectedTask.id);
      const afterCount = task.mediaAssets.filter((asset) =>
        ["knowledge-document", "viral-copy-reference"].includes(asset.kind)
      ).length;
      setActionMessage(
        afterCount > beforeCount ? `已导入 ${afterCount - beforeCount} 个爆款案例` : "未选择文档"
      );
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "爆款文案导入失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function generateScriptOnly() {
    const api = requireDesktopRuntime("一键AI生成文案");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在生成可编辑文案...");

    try {
      await api.updateTask({
        taskId: selectedTask.id,
        originalVideoUrl: selectedTask.originalVideoUrl ?? "",
        sourceScript: selectedTask.sourceScript,
        finalScript: selectedTask.finalScript,
        contentLanguage: selectedTask.contentLanguage,
        generationMode: selectedTask.generationMode,
        avatarMode: selectedTask.avatarMode,
        presetAvatarId: selectedTask.presetAvatarId ?? "",
        presetAvatarGroupId: selectedTask.presetAvatarGroupId ?? "",
        avatarDescriptionPrompt: selectedTask.avatarDescriptionPrompt,
        motionPrompt: selectedTask.motionPrompt,
        generatedPresenterImageSelections: selectedTask.generatedPresenterImageSelections,
        selectedOutputPresets: selectedTask.selectedOutputPresets,
        frameTitleStyle,
        subtitleStyle,
        coverStyle,
        personalIpProfile: selectedTask.personalIpProfile
      });
      const task = await api.generateScript(selectedTask.id);
      setActionMessage("文案已生成，可以直接修改价格、词语和表达后再生成视频");
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "AI 文案生成失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function extractSourceCopy() {
    const api = requireDesktopRuntime("一键提取文案");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActiveOperation("extract-copy");
    showOperationNotice({
      tone: "running",
      title: "正在提取文案",
      detail: "完成后会写入左侧参考文案，并保存转写文件。"
    });

    try {
      await api.updateTask({
        taskId: selectedTask.id,
        originalVideoUrl: selectedTask.originalVideoUrl ?? "",
        sourceScript: selectedTask.sourceScript,
        contentLanguage: selectedTask.contentLanguage
      });
      const result = await api.transcribeSource(selectedTask.id);
      const task = await api.getTask(selectedTask.id);
      showOperationNotice({
        tone: "success",
        title: "提取文案完成",
        detail: `已写入${result.contentLanguage === "id-ID" ? "印尼语" : result.contentLanguage === "en-US" ? "英文" : "中文"}参考文案，并保存 source-transcript.txt`
      });
      if (task) {
        await refreshTaskState(task.id, task);
      }
    } catch (error) {
      showOperationNotice({
        tone: "error",
        title: "提取文案失败",
        detail: error instanceof Error ? error.message : "一键提取文案失败"
      });
    } finally {
      setActiveOperation(null);
      setIsWorkflowRunning(false);
    }
  }

  async function analyzeSourceVisuals() {
    const api = requireDesktopRuntime("画面分析");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActiveOperation("visual-analysis");
    showOperationNotice({
      tone: "running",
      title: "正在画面分析",
      detail: "完成后会生成 visual-analysis.md，并纳入 AI 生成文案上下文。"
    });

    try {
      await api.updateTask({
        taskId: selectedTask.id,
        originalVideoUrl: selectedTask.originalVideoUrl ?? "",
        sourceScript: selectedTask.sourceScript,
        generationMode: selectedTask.generationMode
      });
      const task = await api.analyzeSourceVisuals(selectedTask.id);
      const analysisAsset = latestTaskAsset(task, ["source-visual-analysis"]);
      showOperationNotice({
        tone: "success",
        title: "画面分析完成",
        detail: analysisAsset
          ? `已生成 ${analysisAsset.relativePath}，后续 AI 文案会自动参考`
          : "已生成画面分析，后续 AI 文案会自动参考"
      });
      await refreshTaskState(task.id, task);
    } catch (error) {
      showOperationNotice({
        tone: "error",
        title: "画面分析失败",
        detail: error instanceof Error ? error.message : "画面分析失败"
      });
    } finally {
      setActiveOperation(null);
      setIsWorkflowRunning(false);
    }
  }

  async function generateStoryScriptOptions() {
    const api = requireDesktopRuntime("生成剧情脚本方案");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在分析素材并生成多套剧情脚本方案...");

    try {
      await api.updateTask({
        taskId: selectedTask.id,
        originalVideoUrl: selectedTask.originalVideoUrl ?? "",
        sourceScript: selectedTask.sourceScript,
        finalScript: selectedTask.finalScript,
        contentLanguage: selectedTask.contentLanguage,
        generationMode: "viral-remix",
        avatarDescriptionPrompt: selectedTask.avatarDescriptionPrompt,
        motionPrompt: selectedTask.motionPrompt,
        personalIpProfile: selectedTask.personalIpProfile
      });
      const task = await api.generateStoryScriptOptions(selectedTask.id);
      const scriptStep = task.steps.find((step) => step.id === "script");
      setActionMessage(
        scriptStep?.status === "retry-ready"
          ? scriptStep.errorMessage || "剧情脚本方案生成失败，可检查 API 设置后重试"
          : "剧情脚本方案已生成，推荐方案已写入 AI 生成文案，可先修改再生成故事板"
      );
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "剧情脚本方案生成失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function applyStoryScriptOption(script: string) {
    setSelectedTask((current) => ({
      ...current,
      finalScript: script
    }));
    await updateCurrentTask({ finalScript: script });
    setActionMessage("已把所选剧情方案写入 AI 生成文案，可继续手动修改。");
  }

  async function generateVisualStoryboard() {
    const api = requireDesktopRuntime("一键生成视觉故事板");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在生成分镜提示词和统一视觉故事板...");

    try {
      await api.updateTask({
        taskId: selectedTask.id,
        originalVideoUrl: selectedTask.originalVideoUrl ?? "",
        sourceScript: selectedTask.sourceScript,
        finalScript: selectedTask.finalScript,
        contentLanguage: selectedTask.contentLanguage,
        generationMode: "viral-remix",
        avatarDescriptionPrompt: selectedTask.avatarDescriptionPrompt,
        motionPrompt: selectedTask.motionPrompt,
        personalIpProfile: selectedTask.personalIpProfile
      });
      const task = await api.generateVisualStoryboard({
        taskId: selectedTask.id,
        panelCount: storyboardPanelCount
      });
      const storyboardStep = task.steps.find((step) => step.id === "script");
      setActionMessage(
        storyboardStep?.status === "retry-ready"
          ? storyboardStep.errorMessage || "视觉故事板已生成文本，但故事板图需要重试"
          : "视觉故事板已生成，可查看分镜提示词、统一设定和故事板图"
      );
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "视觉故事板生成失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function generatePresenterImages(presetIds?: OutputPresetId[]) {
    const api = requireDesktopRuntime("生成人物商品图");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在生成人物商品图...");

    try {
      await api.updateTask({
        taskId: selectedTask.id,
        generationMode: "product-avatar",
        avatarMode: "image-presenter",
        originalVideoUrl: selectedTask.originalVideoUrl ?? "",
        sourceScript: selectedTask.sourceScript,
        finalScript: selectedTask.finalScript,
        avatarDescriptionPrompt: selectedTask.avatarDescriptionPrompt,
        motionPrompt: selectedTask.motionPrompt,
        selectedOutputPresets: selectedTask.selectedOutputPresets,
        frameTitleStyle,
        subtitleStyle,
        coverStyle
      });
      const task = await api.generatePresenterImages({
        taskId: selectedTask.id,
        presetIds: presetIds ?? selectedTask.selectedOutputPresets
      });
      const avatarStep = task.steps.find((step) => step.id === "avatar");
      setActionMessage(
        avatarStep?.status === "retry-ready"
          ? avatarStep.errorMessage || "人物商品图生成失败"
          : "人物商品图已生成，可在右侧预览"
      );
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "人物商品图生成失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function selectGeneratedPresenterImage(presetId: OutputPresetId, assetId: string) {
    const api = requireDesktopRuntime("选择人物商品图");
    if (!api) {
      return;
    }

    try {
      const task = await api.selectGeneratedPresenterImage({
        taskId: selectedTask.id,
        presetId,
        assetId
      });
      setActionMessage("已切换当前人物商品图");
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "人物商品图切换失败");
    }
  }

  async function toggleOutputPreset(presetId: OutputPresetId, checked: boolean) {
    const nextPresets = checked
      ? Array.from(new Set([...selectedTask.selectedOutputPresets, presetId]))
      : selectedTask.selectedOutputPresets.filter((candidate) => candidate !== presetId);

    await updateCurrentTask({
      selectedOutputPresets: nextPresets.length > 0 ? nextPresets : ["portrait-9-16"]
    });
  }

  async function changeGenerationMode(mode: VideoGenerationMode) {
    const nextAvatarMode =
      mode === "product-avatar" || mode === "image-lipsync" ? "image-presenter" : "preset-avatar";

    setSelectedTask((current) => ({
      ...current,
      generationMode: mode,
      avatarMode: nextAvatarMode
    }));
    await updateCurrentTask({
      generationMode: mode,
      avatarMode: nextAvatarMode
    });
  }

  async function openWorkspaceTab(tab: ActiveWorkspaceTab) {
    setActiveWorkspaceTab(tab);
    if (tab !== "analysis-center" && tab !== selectedTask.generationMode) {
      await changeGenerationMode(tab);
    }
  }

  async function changeProductAvatarMode(avatarMode: VideoTask["avatarMode"]) {
    setSelectedTask((current) => ({
      ...current,
      avatarMode
    }));
    await updateCurrentTask({
      generationMode: "product-avatar",
      avatarMode
    });
  }

  async function refreshHeyGenAvatarLooks(showSuccessMessage = true) {
    const api = window.digitalHumanStudio;
    if (!api) {
      if (showSuccessMessage) {
        setAvatarLookMessage(
          "数字人列表需要桌面版本机服务；当前浏览器预览可继续手动输入 Avatar ID。"
        );
      }
      return;
    }

    setIsAvatarLookLoading(true);
    setAvatarLookMessage("正在从 HeyGen 读取预设数字人...");

    try {
      const looks = await api.listHeyGenAvatarLooks();
      setAvatarLooks(looks);
      if (looks.length === 0) {
        setAvatarLookMessage("HeyGen 没有返回可用数字人；可以继续手动输入 Avatar ID。");
        return;
      }

      setAvatarLookMessage(showSuccessMessage ? `已加载 ${looks.length} 个 HeyGen 数字人。` : "");
    } catch (error) {
      setAvatarLookMessage(
        error instanceof Error
          ? error.message
          : "HeyGen 数字人列表读取失败；可以继续手动输入 Avatar ID。"
      );
    } finally {
      setIsAvatarLookLoading(false);
    }
  }

  async function selectHeyGenAvatarLook(look: HeyGenAvatarLook) {
    setSelectedTask((current) => ({
      ...current,
      presetAvatarId: look.id,
      presetAvatarGroupId: look.groupId ?? ""
    }));
    await updateCurrentTask({ presetAvatarId: look.id, presetAvatarGroupId: look.groupId ?? "" });
  }

  async function createHeyGenAvatar() {
    const api = requireDesktopRuntime("创建 HeyGen Avatar");
    if (!api || !avatarCreateDialog) {
      return;
    }

    setIsAvatarCreating(true);
    setAvatarLookMessage("正在创建 HeyGen Avatar...");

    try {
      const result = await api.createHeyGenAvatar({
        name: avatarCreateDialog.name,
        prompt: avatarCreateDialog.prompt,
        avatarGroupId: selectedTask.presetAvatarGroupId || undefined
      });
      setAvatarCreateDialog(null);
      setAvatarLooks((current) => {
        const withoutDuplicate = current.filter((look) => look.id !== result.look.id);
        return [result.look, ...withoutDuplicate];
      });
      await selectHeyGenAvatarLook(result.look);
      setAvatarLookMessage(result.message);
    } catch (error) {
      setAvatarLookMessage(error instanceof Error ? error.message : "HeyGen Avatar 创建失败");
    } finally {
      setIsAvatarCreating(false);
    }
  }

  async function updateSubtitleStyle(patch: Partial<SubtitleStyle>) {
    const nextStyle = { ...subtitleStyle, ...patch };
    setSelectedTask((current) => ({
      ...current,
      subtitleStyle: {
        ...(current.subtitleStyle ?? DEFAULT_SUBTITLE_STYLE),
        ...patch
      }
    }));
    void updateCurrentTask({ subtitleStyle: nextStyle });
  }

  async function updateFrameTitleStyle(patch: Partial<FrameTitleStyle>) {
    const nextStyle = { ...frameTitleStyle, ...patch };
    setSelectedTask((current) => ({
      ...current,
      frameTitleStyle: {
        ...(current.frameTitleStyle ?? DEFAULT_FRAME_TITLE_STYLE),
        ...patch
      }
    }));
    void updateCurrentTask({ frameTitleStyle: nextStyle });
  }

  async function updateCoverStyle(patch: Partial<CoverStyle>) {
    const nextStyle = { ...coverStyle, ...patch };
    setSelectedTask((current) => ({
      ...current,
      coverStyle: {
        ...(current.coverStyle ?? DEFAULT_COVER_STYLE),
        ...patch
      }
    }));
    void updateCurrentTask({ coverStyle: nextStyle });
  }

  async function updatePersonalIpProfile(patch: Partial<PersonalIpProfile>) {
    const nextProfile = {
      ...(selectedTask.personalIpProfile ?? DEFAULT_PERSONAL_IP_PROFILE),
      ...patch
    };
    setSelectedTask((current) => ({
      ...current,
      personalIpProfile: {
        ...(current.personalIpProfile ?? DEFAULT_PERSONAL_IP_PROFILE),
        ...patch
      }
    }));
    await updateCurrentTask({ personalIpProfile: nextProfile });
  }

  async function openTaskExports() {
    const api = requireDesktopRuntime("打开导出目录");
    if (!api) {
      return;
    }

    await api.openTaskExports(selectedTask.id);
  }

  async function openSettingsModal() {
    setSettingsOpen(true);
    void loadServiceConfigurations();
    void loadAppPathSettings();
  }

  async function loadAppPathSettings() {
    if (!window.digitalHumanStudio) {
      setAppPathSettings(DEFAULT_APP_PATH_SETTINGS);
      return;
    }

    try {
      const settings = await window.digitalHumanStudio.getAppPathSettings();
      setAppPathSettings(settings);
    } catch (error) {
      setPathSettingsMessage(
        error instanceof Error ? `路径设置读取失败：${error.message}` : "路径设置读取失败"
      );
    }
  }

  async function chooseAppPathSetting(kind: AppPathSettingKind) {
    if (!window.digitalHumanStudio) {
      setPathSettingsMessage("本地预览模式无法选择保存路径");
      return;
    }

    try {
      setChoosingPathKind(kind);
      setPathSettingsMessage(`正在打开${appPathSettingLabel(kind)}选择窗口...`);
      const before = appPathSettings[kind];
      const settings = await window.digitalHumanStudio.chooseAppPathSetting(kind);
      setAppPathSettings(settings);
      setPathSettingsMessage(
        settings[kind] === before
          ? `${appPathSettingLabel(kind)}未变更`
          : `${appPathSettingLabel(kind)}已更新`
      );
    } catch (error) {
      setPathSettingsMessage(
        error instanceof Error ? error.message : `${appPathSettingLabel(kind)}设置失败`
      );
    } finally {
      setChoosingPathKind("");
    }
  }

  async function loadServiceConfigurations() {
    if (!window.digitalHumanStudio) {
      setServiceConfigurations([]);
      setSettingsMessage("当前窗口没有连接到桌面本机服务，服务配置请在桌面版窗口中操作。");
      return;
    }

    try {
      const configurations = await window.digitalHumanStudio.listServiceConfigurations();
      setServiceConfigurations(configurations);
      setSettingsDraft(createSettingsDraft(configurations));
      setActiveSettingsProviderId((current) =>
        configurations.some((configuration) => configuration.providerId === current)
          ? current
          : (configurations[0]?.providerId ?? "")
      );
    } catch (error) {
      setSettingsMessage(
        error instanceof Error
          ? `设置读取失败：${error.message}`
          : "设置读取失败，请重启桌面版后重试。"
      );
    }
  }

  async function saveServiceConfiguration(providerId: ProviderId) {
    const draft = settingsDraft[providerId];
    if (!window.digitalHumanStudio || !draft) {
      return;
    }

    const label = providerLabel(serviceConfigurations, providerId);
    const input: SaveServiceConfigurationInput = {
      providerId,
      settings: {
        baseUrl: draft.baseUrl,
        modelName: draft.modelName,
        authMode: draft.authMode,
        generationRoute: draft.generationRoute,
        asrMode: draft.asrMode,
        avatarId: draft.avatarId,
        voiceId: draft.voiceId,
        resolution: draft.resolution,
        enabled: draft.enabled
      },
      apiKey: draft.apiKey || undefined
    };

    setSettingsBusyProviderId(providerId);
    setSettingsMessage(`${label} 正在保存并测试...`);
    setSettingsCheckResults((current) => {
      const next = { ...current };
      delete next[providerId];
      return next;
    });

    try {
      await window.digitalHumanStudio.saveServiceConfiguration(input);
      const result = await window.digitalHumanStudio.testServiceConfiguration(providerId);
      setSettingsCheckResults((current) => ({ ...current, [providerId]: result }));
      setSettingsMessage(`配置已保存。${result.message}`);
      await loadServiceConfigurations();
      if (providerId === "heygen" && result.ok) {
        void refreshHeyGenAvatarLooks(true);
      }
    } catch (error) {
      const result: ServiceConnectionCheck = {
        providerId,
        ok: false,
        message: error instanceof Error ? error.message : `${label} 保存或测试失败`
      };
      setSettingsCheckResults((current) => ({ ...current, [providerId]: result }));
      setSettingsMessage(result.message);
    } finally {
      setSettingsBusyProviderId("");
    }
  }

  async function clearServiceCredential(providerId: ProviderId) {
    if (!window.digitalHumanStudio) {
      return;
    }

    setSettingsBusyProviderId(providerId);
    try {
      await window.digitalHumanStudio.clearServiceCredential(providerId);
      setSettingsCheckResults((current) => {
        const next = { ...current };
        delete next[providerId];
        return next;
      });
      setSettingsMessage("凭据已清除");
      await loadServiceConfigurations();
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "凭据清除失败");
    } finally {
      setSettingsBusyProviderId("");
    }
  }

  async function testServiceConfiguration(providerId: ProviderId) {
    if (!window.digitalHumanStudio) {
      setSettingsMessage("本地预览模式无法检查服务配置");
      return;
    }

    setSettingsBusyProviderId(providerId);
    setSettingsMessage(`${providerLabel(serviceConfigurations, providerId)} 正在测试...`);
    try {
      const result = await window.digitalHumanStudio.testServiceConfiguration(providerId);
      setSettingsCheckResults((current) => ({ ...current, [providerId]: result }));
      setSettingsMessage(result.message);
      if (providerId === "heygen" && result.ok) {
        void refreshHeyGenAvatarLooks(true);
      }
    } catch (error) {
      const result: ServiceConnectionCheck = {
        providerId,
        ok: false,
        message: error instanceof Error ? error.message : "服务测试失败"
      };
      setSettingsCheckResults((current) => ({ ...current, [providerId]: result }));
      setSettingsMessage(result.message);
    } finally {
      setSettingsBusyProviderId("");
    }
  }

  async function fetchServiceModels(providerId: ProviderId) {
    const draft = settingsDraft[providerId];
    if (!window.digitalHumanStudio || !draft) {
      setSettingsMessage("本地预览模式无法获取模型列表");
      return;
    }

    const label = providerLabel(serviceConfigurations, providerId);
    setSettingsBusyProviderId(providerId);
    setSettingsMessage(`${label} 正在获取模型列表...`);

    try {
      const result = await window.digitalHumanStudio.listServiceModels({
        providerId,
        settings: {
          baseUrl: draft.baseUrl,
          modelName: draft.modelName,
          authMode: draft.authMode,
          generationRoute: draft.generationRoute,
          avatarId: draft.avatarId,
          voiceId: draft.voiceId,
          resolution: draft.resolution,
          enabled: draft.enabled
        },
        apiKey: draft.apiKey || undefined
      });
      setSettingsModelLists((current) => ({ ...current, [providerId]: result }));
      setSettingsMessage(result.message);

      if (result.ok && result.models.length > 0 && !draft.modelName?.trim()) {
        setSettingsDraft((current) =>
          updateDraft(current, providerId, {
            modelName: result.models[0] ?? ""
          })
        );
      }
    } catch (error) {
      const result: ServiceModelList = {
        providerId,
        ok: false,
        models: [],
        message: error instanceof Error ? error.message : "模型列表获取失败"
      };
      setSettingsModelLists((current) => ({ ...current, [providerId]: result }));
      setSettingsMessage(result.message);
    } finally {
      setSettingsBusyProviderId("");
    }
  }

  const activeSettingsConfiguration =
    serviceConfigurations.find(
      (configuration) => configuration.providerId === activeSettingsProviderId
    ) ?? serviceConfigurations[0];
  const activeSettingsDraft = activeSettingsConfiguration
    ? (settingsDraft[activeSettingsConfiguration.providerId] ?? createEmptySettingsDraft())
    : null;
  const activeSettingsCheckResult = activeSettingsConfiguration
    ? settingsCheckResults[activeSettingsConfiguration.providerId]
    : undefined;
  const activeSettingsModelList = activeSettingsConfiguration
    ? settingsModelLists[activeSettingsConfiguration.providerId]
    : undefined;
  const activeSettingsIsBusy = activeSettingsConfiguration
    ? settingsBusyProviderId === activeSettingsConfiguration.providerId
    : false;
  const activeSettingsCanFetchModels =
    activeSettingsConfiguration && activeSettingsDraft
      ? canFetchServiceModels(activeSettingsConfiguration.providerId)
      : false;

  return (
    <div className="app-shell">
      {customFontUrl ? (
        <style>{`@font-face { font-family: "DHS Custom Font"; src: url("${customFontUrl}"); font-display: swap; }`}</style>
      ) : null}
      <header className="topbar">
        <div>
          <h1>自媒体视频工作台</h1>
          <p>{appVersion || "自媒体视频工作台"}</p>
        </div>
        <div className="topbar-actions">
          <button
            className="icon-button"
            data-testid="release-open-settings"
            title="设置"
            onClick={() => void openSettingsModal()}
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {operationNotice ? (
        <div className={`operation-notice ${operationNotice.tone}`} role="status">
          <span>
            <strong>{operationNotice.title}</strong>
            {operationNotice.detail ? <small>{operationNotice.detail}</small> : null}
          </span>
          <button type="button" onClick={() => setOperationNotice(null)}>
            关闭
          </button>
        </div>
      ) : null}

      <section className="task-strip" aria-label="任务列表">
        <button
          className="icon-button small"
          data-testid="release-new-task"
          title="新建任务"
          onClick={openCreateTaskDialog}
        >
          <Plus size={16} />
        </button>
        <div className="task-list">
          {taskSummaries.map((task) => (
            <div
              key={task.id}
              className={`task-row ${task.id === selectedTaskId ? "active" : ""}`}
              data-testid="release-task-row"
              data-task-id={task.id}
              title={`${task.title} · ${formatTaskMeta(task)}`}
            >
              <button
                className="task-main"
                type="button"
                onClick={() => void selectTask(task.id)}
                onDoubleClick={() => openRenameTaskDialog(task.id, task.title)}
              >
                <span className={`task-dot ${task.status}`} />
                <span>
                  <strong>{task.title}</strong>
                  <small>{formatTaskMeta(task)}</small>
                </span>
              </button>
              <button
                className="icon-button task-delete-button"
                data-testid="release-delete-task"
                type="button"
                title="删除任务"
                onClick={(event) => {
                  event.stopPropagation();
                  requestDeleteTask(task.id);
                }}
                onDoubleClick={(event) => event.stopPropagation()}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        {taskError ? <p className="task-error">{taskError}</p> : null}
      </section>

      {taskSummaries.length === 0 ? (
        <main className="empty-workspace">
          <section className="empty-task-panel">
            <h2>还没有视频任务</h2>
            <p>点击左上角 + 新建任务，并在弹窗里给任务命名。</p>
            <button className="primary" type="button" onClick={openCreateTaskDialog}>
              新建任务
            </button>
          </section>
        </main>
      ) : (
        <main className="workspace" data-mode={selectedTask.generationMode}>
          <section className="editor-pane">
            <nav className="mode-tabs" aria-label="视频生成类别">
              {WORKSPACE_TABS.map((mode) => (
                <button
                  className={activeWorkspaceTab === mode.id ? "active" : ""}
                  key={mode.id}
                  type="button"
                  onClick={() => void openWorkspaceTab(mode.id)}
                  title={mode.description}
                >
                  <strong>{mode.label}</strong>
                  <span>{mode.description}</span>
                </button>
              ))}
            </nav>

            {activeWorkspaceTab === "analysis-center" ? (
              <section className="video-analysis-center" aria-label="视频分析中心">
                <div className="analysis-center-heading">
                  <div>
                    <span>01</span>
                    <h2>视频分析中心</h2>
                  </div>
                  <p>
                    可先整理原视频、源素材、统一知识库、爆款案例和参考文案，生成建议后再选择模式；也可以直接切到任意视频模式制作。
                  </p>
                </div>

                <section className="source-ingest-card">
                  <div className="source-ingest-heading">
                    <span>
                      <Link2 size={16} />
                      原视频链接
                    </span>
                  </div>
                  <div className="source-link-row">
                    <input
                      type="url"
                      value={selectedTask.originalVideoUrl ?? ""}
                      placeholder="先粘贴 TikTok / 抖音 / Reels / Shorts 原视频链接"
                      aria-label="原视频链接"
                      onBlur={() =>
                        void updateCurrentTask({
                          originalVideoUrl: selectedTask.originalVideoUrl ?? ""
                        })
                      }
                      onChange={(event) =>
                        setSelectedTask((current) => ({
                          ...current,
                          originalVideoUrl: event.target.value
                        }))
                      }
                    />
                  </div>
                  <div className="source-action-row">
                    <button
                      type="button"
                      disabled={isWorkflowRunning}
                      onClick={() => void downloadOriginalVideo()}
                    >
                      <Download size={16} />
                      {activeOperation === "download-original" ? "下载中..." : "下载原视频"}
                    </button>
                    <button
                      type="button"
                      disabled={isWorkflowRunning}
                      onClick={() => void uploadSourceVideo()}
                    >
                      <Upload size={16} />
                      上传原视频
                    </button>
                    <button
                      type="button"
                      disabled={isWorkflowRunning}
                      onClick={() => void extractSourceCopy()}
                    >
                      <FileSearch size={16} />
                      {activeOperation === "extract-copy" ? "提取中..." : "提取文案"}
                    </button>
                    <button
                      type="button"
                      disabled={isWorkflowRunning}
                      onClick={() => void analyzeSourceVisuals()}
                    >
                      <WandSparkles size={16} />
                      {activeOperation === "visual-analysis" ? "分析中..." : "画面分析"}
                    </button>
                  </div>
                  <AssetList
                    assets={sourceMaterialAssets}
                    emptyLabel="还没有原视频、转写或画面分析素材"
                    title="源素材"
                  />
                  <div className="source-knowledge-row">
                    <div>
                      <strong>统一知识库 / 爆款案例</strong>
                      <span>内置知识库统一参与生成；当前任务上传的案例会作为本任务补充资料。</span>
                    </div>
                    <div className="source-action-row compact">
                      <button
                        type="button"
                        disabled={isWorkflowRunning}
                        onClick={() => void uploadKnowledgeDocuments()}
                      >
                        <Upload size={16} />
                        上传知识资料
                      </button>
                      <button
                        type="button"
                        disabled={isWorkflowRunning}
                        onClick={() => void uploadViralCopyReferences()}
                      >
                        <Upload size={16} />
                        上传爆款文案
                      </button>
                    </div>
                  </div>
                  <AssetList
                    assets={knowledgeAssets}
                    itemBadge="已纳入AI上下文"
                    emptyLabel="还没有上传当前任务补充资料或爆款案例"
                    title="当前任务补充资料"
                  />
                </section>

                <div className="script-grid">
                  <section className="field-block">
                    <div className="section-title">
                      <FileSearch size={16} />
                      <h2>{sourceScriptLabel}</h2>
                    </div>
                    <p className="field-hint">提取后会填到这里；也可以直接粘贴或修改原视频文案。</p>
                    <textarea
                      value={selectedTask.sourceScript}
                      aria-label={sourceScriptLabel}
                      onBlur={() =>
                        void updateCurrentTask({ sourceScript: selectedTask.sourceScript })
                      }
                      onChange={(event) =>
                        setSelectedTask((current) => ({
                          ...current,
                          sourceScript: event.target.value
                        }))
                      }
                    />
                  </section>

                  <section className="field-block">
                    <div className="section-title">
                      <WandSparkles size={16} />
                      <h2>AI生成文案</h2>
                      <button
                        type="button"
                        className="small-action-button"
                        disabled={isWorkflowRunning}
                        onClick={() => void generateScriptOnly()}
                      >
                        <WandSparkles size={15} />
                        一键AI生成文案
                      </button>
                    </div>
                    <p className="field-hint">
                      生成后可直接改价格、禁用词和表达，视频会按这里的最终文案生成。
                    </p>
                    <p className="knowledge-context-summary">
                      将调用：内置知识 {knowledgeContextCounts.builtIn} / 上传知识{" "}
                      {knowledgeContextCounts.uploadedKnowledge} / 爆款案例{" "}
                      {knowledgeContextCounts.viralReferences} / 当前素材{" "}
                      {knowledgeContextCounts.taskAssets}
                    </p>
                    <textarea
                      value={selectedTask.finalScript}
                      placeholder="点击一键AI生成文案，或直接手动输入最终口播文案"
                      aria-label="AI生成文案"
                      onBlur={() =>
                        void updateCurrentTask({ finalScript: selectedTask.finalScript })
                      }
                      onChange={(event) =>
                        setSelectedTask((current) => ({
                          ...current,
                          finalScript: event.target.value
                        }))
                      }
                    />
                    <div className="risk-row">
                      <CheckCircle2 size={16} />
                      <span>相似风险：{similarityRiskLabel(selectedTask.similarityRisk)}</span>
                    </div>
                    {selectedTask.scriptGenerationNotes ? (
                      <p className="script-note">{selectedTask.scriptGenerationNotes}</p>
                    ) : null}
                  </section>
                </div>

                <TaskResourceLibrary
                  generatedPresenterCount={generatedPresenterAssets.length}
                  knowledgeCount={knowledgeAssets.length}
                  mixedCutOutputCount={mixedCutOutputAssets.length}
                  mixedCutVisualMaterialCount={mixedCutVisualMaterialCount}
                  sourceMaterialCount={sourceMaterialAssets.length}
                  task={selectedTask}
                  visualStoryboardCount={visualStoryboardAssets.length}
                />

                <ModeRecommendationPanel
                  currentMode={selectedTask.generationMode}
                  isReady={analysisRecommendationReady}
                  onSelectMode={(mode) => void openWorkspaceTab(mode)}
                  report={modeRecommendationReport}
                />

                {analysisRecommendationReady ? (
                  <ProductionWorkflowPanel workflow={recommendedProductionWorkflow} />
                ) : null}
              </section>
            ) : (
              <>
                <section
                  className="compact-block generation-settings-block"
                  data-avatar-mode={selectedTask.avatarMode}
                  data-mode={selectedTask.generationMode}
                >
                  <div className="mode-production-heading">
                    <div>
                      <span>02</span>
                      <h2>模式制作</h2>
                    </div>
                    <p>先填本模式必需资料，再设置输出比例和 API，最后一键生成。</p>
                  </div>
                  <h3>{generationModeLabel(selectedTask.generationMode)}资料</h3>

                  {modeNeedsEditableScript(selectedTask.generationMode) ? (
                    <section className="mode-source-script-card">
                      <div className="section-title">
                        <FileSearch size={16} />
                        <h2>原文案 / 参考文案</h2>
                      </div>
                      <textarea
                        className="compact-textarea"
                        value={selectedTask.sourceScript}
                        placeholder="不走视频分析时，先把原文案、参考文案或素材说明粘贴到这里，AI 生成文案会优先参考。"
                        aria-label="原文案 / 参考文案"
                        onBlur={() =>
                          void updateCurrentTask({ sourceScript: selectedTask.sourceScript })
                        }
                        onChange={(event) =>
                          setSelectedTask((current) => ({
                            ...current,
                            sourceScript: event.target.value
                          }))
                        }
                      />
                      <p className="field-hint">
                        用来给 AI 学习结构、卖点和节奏；不会直接作为最终出片文案。
                      </p>
                    </section>
                  ) : null}

                  {modeNeedsEditableScript(selectedTask.generationMode) ? (
                    <section className="mode-script-card">
                      <div className="section-title">
                        <WandSparkles size={16} />
                        <h2>本次生成文案</h2>
                        <button
                          type="button"
                          className="small-action-button"
                          disabled={isWorkflowRunning}
                          onClick={() => void generateScriptOnly()}
                        >
                          一键AI生成
                        </button>
                      </div>
                      <textarea
                        className="compact-textarea"
                        value={selectedTask.finalScript}
                        placeholder="可直接输入本次视频脚本；需要先拉片分析时，切到“视频分析中心”。"
                        aria-label="本次生成文案"
                        onBlur={() =>
                          void updateCurrentTask({ finalScript: selectedTask.finalScript })
                        }
                        onChange={(event) =>
                          setSelectedTask((current) => ({
                            ...current,
                            finalScript: event.target.value
                          }))
                        }
                      />
                      <p className="field-hint">
                        会调用统一知识库和当前任务资料；价格、禁用词和最终表达以这里为准。
                      </p>
                    </section>
                  ) : null}

                  {selectedTask.generationMode === "product-avatar" ? (
                    <div className="avatar-source-toggle">
                      <span>数字人来源</span>
                      <button
                        type="button"
                        className={selectedTask.avatarMode === "image-presenter" ? "active" : ""}
                        onClick={() => void changeProductAvatarMode("image-presenter")}
                      >
                        OpenAI 人物商品图
                      </button>
                      <button
                        type="button"
                        className={selectedTask.avatarMode === "preset-avatar" ? "active" : ""}
                        onClick={() => void changeProductAvatarMode("preset-avatar")}
                      >
                        HeyGen Avatar 口播
                      </button>
                    </div>
                  ) : null}

                  <div className="prompt-grid">
                    {selectedTask.generationMode === "preset-avatar" ||
                    (selectedTask.generationMode === "product-avatar" &&
                      selectedTask.avatarMode === "preset-avatar") ? (
                      <div className="avatar-picker-block">
                        <div className="avatar-picker-header">
                          <span>预设数字人选择</span>
                          <span className="avatar-picker-actions">
                            <button
                              type="button"
                              disabled={isAvatarLookLoading || isAvatarCreating}
                              onClick={() =>
                                setAvatarCreateDialog({
                                  name: selectedTask.title || "新数字人",
                                  prompt:
                                    selectedTask.avatarDescriptionPrompt ||
                                    "真实自然的短视频口播数字人，干净背景，亲和可信，适合自媒体视频。"
                                })
                              }
                            >
                              <Plus size={15} />
                              创建
                            </button>
                            <button
                              type="button"
                              disabled={isAvatarLookLoading || isAvatarCreating}
                              onClick={() => void refreshHeyGenAvatarLooks()}
                            >
                              <RefreshCw size={15} />
                              {isAvatarLookLoading ? "读取中" : "刷新"}
                            </button>
                          </span>
                        </div>
                        {selectedAvatarLook ? (
                          <p className="selected-avatar-summary">
                            当前：{selectedAvatarLook.name} · {selectedAvatarLook.id}
                            {selectedAvatarLook.groupId
                              ? ` · Group ${selectedAvatarLook.groupId}`
                              : ""}
                          </p>
                        ) : null}
                        {avatarLooks.length > 0 ? (
                          <div className="avatar-look-grid" aria-label="HeyGen 预设数字人">
                            {avatarLooks.map((look) => (
                              <button
                                className={
                                  selectedTask.presetAvatarId === look.id ||
                                  Boolean(
                                    look.groupId &&
                                    look.groupId === selectedTask.presetAvatarGroupId
                                  )
                                    ? "avatar-look-card selected"
                                    : "avatar-look-card"
                                }
                                key={look.id}
                                title={`${look.name} · ${look.id}`}
                                type="button"
                                onClick={() => void selectHeyGenAvatarLook(look)}
                              >
                                <span className="avatar-look-thumb">
                                  {look.previewImageUrl ? (
                                    <img
                                      alt={look.name}
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                      src={look.previewImageUrl}
                                    />
                                  ) : (
                                    <UserRound size={24} />
                                  )}
                                </span>
                                <strong>{look.name}</strong>
                                <small>{avatarLookMeta(look)}</small>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="field-hint">
                            点击刷新读取当前 HeyGen 账号可用数字人；读取失败时仍可手动输入 Avatar
                            ID。
                          </p>
                        )}
                        {avatarLookMessage ? (
                          <p className="avatar-look-message">{avatarLookMessage}</p>
                        ) : null}
                        <label className="avatar-id-field">
                          Avatar ID
                          <input
                            type="text"
                            list="avatar-id-options"
                            value={selectedTask.presetAvatarId ?? ""}
                            placeholder="留空使用设置里的默认 Avatar ID"
                            onBlur={() =>
                              void updateCurrentTask({
                                presetAvatarId: selectedTask.presetAvatarId ?? "",
                                presetAvatarGroupId: selectedTask.presetAvatarGroupId ?? ""
                              })
                            }
                            onChange={(event) =>
                              setSelectedTask((current) => ({
                                ...current,
                                presetAvatarId: event.target.value,
                                presetAvatarGroupId:
                                  avatarLooks.find((look) => look.id === event.target.value)
                                    ?.groupId ?? ""
                              }))
                            }
                          />
                          <datalist id="avatar-id-options">
                            {avatarOptions.map((avatarId) => (
                              <option key={avatarId} value={avatarId} />
                            ))}
                          </datalist>
                        </label>
                      </div>
                    ) : null}
                    {selectedTask.generationMode === "product-avatar" &&
                    selectedTask.avatarMode === "image-presenter" ? (
                      <label>
                        人物/画面描述提示词
                        <textarea
                          className="compact-textarea"
                          value={selectedTask.avatarDescriptionPrompt}
                          aria-label="人物/画面描述提示词"
                          onBlur={() =>
                            void updateCurrentTask({
                              avatarDescriptionPrompt: selectedTask.avatarDescriptionPrompt
                            })
                          }
                          onChange={(event) =>
                            setSelectedTask((current) => ({
                              ...current,
                              avatarDescriptionPrompt: event.target.value
                            }))
                          }
                        />
                      </label>
                    ) : null}
                    {selectedTask.generationMode === "personal-ip" ? (
                      <>
                        <label>
                          IP 名称
                          <input
                            type="text"
                            value={selectedTask.personalIpProfile.name}
                            onChange={(event) =>
                              void updatePersonalIpProfile({ name: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          固定语气
                          <input
                            type="text"
                            value={selectedTask.personalIpProfile.tone}
                            onChange={(event) =>
                              void updatePersonalIpProfile({ tone: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          人设描述
                          <textarea
                            className="compact-textarea"
                            value={selectedTask.personalIpProfile.persona}
                            onChange={(event) =>
                              void updatePersonalIpProfile({ persona: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          口头禅
                          <textarea
                            className="compact-textarea"
                            value={selectedTask.personalIpProfile.catchphrases}
                            onChange={(event) =>
                              void updatePersonalIpProfile({ catchphrases: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          禁用词
                          <textarea
                            className="compact-textarea"
                            value={selectedTask.personalIpProfile.bannedWords}
                            onChange={(event) =>
                              void updatePersonalIpProfile({ bannedWords: event.target.value })
                            }
                          />
                        </label>
                      </>
                    ) : null}
                    {selectedTask.generationMode === "viral-remix" ? (
                      <div className="mode-note">
                        <strong>爆款视频复刻</strong>
                        <span>保留爆款结构、钩子功能、情绪曲线和 CTA，生成时改写为新的表达。</span>
                      </div>
                    ) : null}
                    {selectedTask.generationMode === "mixed-cut" ? (
                      <div className="mode-note">
                        <strong>混剪视频</strong>
                        <span>
                          只负责批量素材混剪；需要进一步去重时，把成片导入“视频去重处理”模式。
                        </span>
                      </div>
                    ) : null}
                    {selectedTask.generationMode === "video-dedup" ? (
                      <div className="mode-note">
                        <strong>视频去重处理</strong>
                        <span>
                          对本地视频或混剪成片做内容级重构，并输出内部原创度评分报告，默认目标 80+。
                        </span>
                      </div>
                    ) : null}
                    {modeNeedsMotionPrompt(selectedTask.generationMode) ? (
                      <label>
                        动作提示词
                        <textarea
                          className="compact-textarea"
                          value={selectedTask.motionPrompt}
                          aria-label="动作提示词"
                          onBlur={() =>
                            void updateCurrentTask({ motionPrompt: selectedTask.motionPrompt })
                          }
                          onChange={(event) =>
                            setSelectedTask((current) => ({
                              ...current,
                              motionPrompt: event.target.value
                            }))
                          }
                        />
                      </label>
                    ) : null}
                  </div>

                  {selectedTask.generationMode === "viral-remix" ? (
                    <div className="mode-material-card viral-reference-card">
                      <div>
                        <strong>爆款参考素材</strong>
                        <span>上传参考视频后，可先提取文案和生成画面分析，再做结构复刻。</span>
                      </div>
                      <div className="source-action-row compact">
                        <button
                          type="button"
                          disabled={isWorkflowRunning}
                          onClick={() => void uploadSourceVideo()}
                        >
                          <Upload size={16} />
                          上传参考视频
                        </button>
                        <button
                          type="button"
                          disabled={isWorkflowRunning}
                          onClick={() => void analyzeSourceVisuals()}
                        >
                          <WandSparkles size={16} />
                          {activeOperation === "visual-analysis" ? "分析中..." : "画面分析"}
                        </button>
                      </div>
                      <AssetList
                        assets={sourceMaterialAssets}
                        emptyLabel="还没有参考视频或分析产物"
                        title="参考素材"
                      />
                    </div>
                  ) : null}

                  {selectedTask.generationMode === "viral-remix" ? (
                    <VisualStoryboardPanelV2
                      disabled={isWorkflowRunning}
                      errorMessage={displayedVisualStoryboardError}
                      finalScript={selectedTask.finalScript}
                      imageUrl={visualStoryboardImageUrl}
                      onGenerateScriptOptions={() => void generateStoryScriptOptions()}
                      onGenerateStoryboard={() => void generateVisualStoryboard()}
                      onPanelCountChange={setStoryboardPanelCount}
                      onUseScriptOption={(script) => void applyStoryScriptOption(script)}
                      panelCount={storyboardPanelCount}
                      scriptErrorMessage={displayedStoryScriptError}
                      scriptPackage={displayedStoryScriptPackage}
                      storyboard={displayedVisualStoryboard}
                    />
                  ) : null}

                  {selectedTask.generationMode === "mixed-cut" ? (
                    <div className="mixed-cut-workspace-card">
                      <div className="mixed-cut-library-panel">
                        <div className="mixed-cut-library-card">
                          <div className="mixed-cut-card-heading">
                            <strong>视频素材库</strong>
                            <button
                              type="button"
                              disabled={isWorkflowRunning}
                              onClick={() => void chooseMixedCutMaterialDirectory()}
                            >
                              <FolderOpen size={16} />
                              选择素材文件夹
                            </button>
                          </div>
                          <div
                            className={`mixed-cut-sync-state ${
                              mixedCutMaterialAssets.length > 0 ? "ok" : "pending"
                            }`}
                          >
                            {mixedCutMaterialAssets.length > 0
                              ? `已同步 ${mixedCutMaterialAssets.length} 个素材`
                              : "未发现素材，请选择工作文件夹"}
                          </div>
                          <p title={selectedTask.mixedCutMaterialDirectory}>
                            {selectedTask.mixedCutMaterialDirectory || "尚未选择素材文件夹"}
                          </p>
                          <div className="mixed-cut-stat-row">
                            <span>画面素材 {mixedCutVisualMaterialCount}</span>
                            <span>音频素材 {mixedCutAudioMaterialCount}</span>
                          </div>
                        </div>

                        <div className="mixed-cut-library-card">
                          <div className="mixed-cut-card-heading">
                            <strong>音频/BGM</strong>
                            <span>跟随素材库</span>
                          </div>
                          <label className="range-field">
                            BGM 音量
                            <div>
                              <input
                                min={0}
                                max={100}
                                type="range"
                                value={selectedTask.mixedCutBgmVolume}
                                onChange={(event) =>
                                  void updateCurrentTask({
                                    mixedCutBgmVolume: clampUiNumber(event.target.value, 0, 100, 70)
                                  })
                                }
                              />
                              <output>{selectedTask.mixedCutBgmVolume}</output>
                            </div>
                          </label>
                          <p className="field-hint">
                            去除原音、转场和重复率在右侧组合参数中统一设置。
                          </p>
                        </div>
                      </div>

                      <div className="mixed-cut-chapter-panel">
                        <div className="mixed-cut-panel-topline">
                          <strong>章节与组合</strong>
                          <span>
                            {mixedCutRecommendation(mixedCutVisualMaterialCount, mixedCutBatchPlan)}
                          </span>
                        </div>

                        <div className="mixed-cut-control-grid">
                          <div className="mixed-cut-plan-card">
                            <span>智能估算数量</span>
                            <strong>
                              {mixedCutBatchPlan.targetCount
                                ? `${mixedCutBatchPlan.targetCount} 条`
                                : "待计算"}
                            </strong>
                            <small>{mixedCutPlanDetail(mixedCutBatchPlan)}</small>
                          </div>
                          <label>
                            章节模式
                            <select
                              value={selectedTask.mixedCutChapterMode}
                              onChange={(event) =>
                                void updateCurrentTask({
                                  mixedCutChapterMode:
                                    event.target.value === "fixed-material-count" ||
                                    event.target.value === "minimum-duration"
                                      ? event.target.value
                                      : "fill-with-bgm"
                                })
                              }
                            >
                              <option value="fill-with-bgm">为配音填充画面</option>
                              <option value="fixed-material-count">固定素材数</option>
                              <option value="minimum-duration">至少 X 秒</option>
                            </select>
                          </label>
                          <label className="range-field">
                            视频重复率
                            <div>
                              <input
                                min={0}
                                max={100}
                                type="range"
                                value={selectedTask.mixedCutReuseRate}
                                onChange={(event) =>
                                  void updateCurrentTask({
                                    mixedCutReuseRate: clampUiNumber(event.target.value, 0, 100, 35)
                                  })
                                }
                              />
                              <output>{selectedTask.mixedCutReuseRate}</output>
                            </div>
                          </label>
                          <label className="compact-checkbox mixed-cut-switch">
                            <input
                              checked={selectedTask.mixedCutRemoveOriginalAudio}
                              type="checkbox"
                              onChange={(event) =>
                                void updateCurrentTask({
                                  mixedCutRemoveOriginalAudio: event.target.checked
                                })
                              }
                            />
                            去除视频素材原音
                          </label>
                          <label className="compact-checkbox mixed-cut-switch">
                            <input
                              checked={selectedTask.mixedCutEnableTransitions}
                              type="checkbox"
                              onChange={(event) =>
                                void updateCurrentTask({
                                  mixedCutEnableTransitions: event.target.checked
                                })
                              }
                            />
                            转场
                          </label>
                        </div>

                        <div className="mixed-cut-table-wrap">
                          <table className="mixed-cut-chapter-table">
                            <thead>
                              <tr>
                                <th>章节</th>
                                <th>素材数 & 组合</th>
                                <th>模式</th>
                                <th>重复率</th>
                              </tr>
                            </thead>
                            <tbody>
                              {mixedCutChapterRows(
                                mixedCutVisualMaterialCount,
                                mixedCutBatchPlan.targetCount,
                                selectedTask.mixedCutChapterMode,
                                selectedTask.mixedCutReuseRate
                              ).map((row) => (
                                <tr key={row.index}>
                                  <td>{row.index}</td>
                                  <td>{row.materialLabel}</td>
                                  <td>{row.modeLabel}</td>
                                  <td>{row.reuseRate}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="source-action-row compact">
                          <button
                            type="button"
                            disabled={isWorkflowRunning}
                            onClick={() => void chooseMixedCutMaterialDirectory()}
                          >
                            <FolderOpen size={16} />
                            重新同步素材文件夹
                          </button>
                          <button
                            type="button"
                            disabled={isWorkflowRunning}
                            onClick={() => void analyzeSourceVisuals()}
                          >
                            <WandSparkles size={16} />
                            {activeOperation === "visual-analysis" ? "分析中..." : "画面分析"}
                          </button>
                        </div>

                        <AssetList
                          assets={mixedCutOutputAssets}
                          emptyLabel="还没有批量混剪产物"
                          title="混剪产物"
                        />
                      </div>
                    </div>
                  ) : null}

                  {selectedTask.generationMode === "video-dedup" ? (
                    <div className="mode-material-card dedup-source-card">
                      <div>
                        <strong>待处理视频</strong>
                        <span>导入混剪成片或本地 MP4，处理后以内部原创度评分 80+ 为通过阈值。</span>
                      </div>
                      <div className="mode-settings-grid">
                        <label>
                          目标原创度评分
                          <input
                            min={60}
                            max={95}
                            type="number"
                            value={selectedTask.dedupTargetScore}
                            onBlur={() =>
                              void updateCurrentTask({
                                dedupTargetScore: selectedTask.dedupTargetScore
                              })
                            }
                            onChange={(event) =>
                              setSelectedTask((current) => ({
                                ...current,
                                dedupTargetScore: clampUiNumber(event.target.value, 60, 95, 80)
                              }))
                            }
                          />
                        </label>
                        <label>
                          处理策略
                          <select
                            value={selectedTask.dedupStrategy}
                            onChange={(event) =>
                              void updateCurrentTask({
                                dedupStrategy:
                                  event.target.value === "light-polish"
                                    ? "light-polish"
                                    : "content-rewrite"
                              })
                            }
                          >
                            <option value="content-rewrite">内容级重构</option>
                            <option value="light-polish">轻量后处理</option>
                          </select>
                        </label>
                      </div>
                      <div className="source-action-row compact">
                        <button
                          type="button"
                          disabled={isWorkflowRunning}
                          onClick={() => void importDedupSourceVideo()}
                        >
                          <Upload size={16} />
                          导入待去重视频
                        </button>
                        <button
                          type="button"
                          disabled={isWorkflowRunning}
                          onClick={() => void runOriginalityScore()}
                        >
                          <FileSearch size={16} />
                          只生成评分报告
                        </button>
                      </div>
                      <OriginalityReportCard
                        report={dedupReportJsonUrl ? originalityReport : null}
                      />
                      <AssetList
                        assets={dedupAssets}
                        emptyLabel="还没有去重素材或报告"
                        title="去重产物"
                      />
                    </div>
                  ) : null}

                  {selectedTask.generationMode === "product-avatar" &&
                  selectedTask.avatarMode === "image-presenter" ? (
                    <div className="image-action-row product-image-assets">
                      <AssetPreview title="商品图" url={productImageUrl} emptyLabel="未上传" />
                      <AssetPreview
                        title="人物商品图"
                        url={generatedPresenterUrl}
                        emptyLabel="未生成"
                      />
                      <GeneratedPresenterHistory
                        assets={generatedPresenterAssets}
                        assetUrls={assetUrls}
                        presetId={previewPresetId ?? "portrait-9-16"}
                        selectedAssetId={selectedGeneratedPresenterAssetId}
                        onSelect={(presetId, assetId) =>
                          void selectGeneratedPresenterImage(presetId, assetId)
                        }
                      />
                      <div className="stacked-actions">
                        <button
                          type="button"
                          disabled={isWorkflowRunning}
                          onClick={() => void uploadProductImage()}
                        >
                          <Upload size={16} />
                          上传商品图
                        </button>
                        <button
                          type="button"
                          disabled={isWorkflowRunning}
                          onClick={() => void generatePresenterImages()}
                        >
                          <WandSparkles size={16} />
                          生成人物商品图
                        </button>
                        <button
                          type="button"
                          disabled={isWorkflowRunning}
                          onClick={() =>
                            void generatePresenterImages([previewPresetId ?? "portrait-9-16"])
                          }
                        >
                          <RefreshCw size={16} />
                          重生成当前比例
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {selectedTask.generationMode === "image-lipsync" ? (
                    <div className="image-action-row single lipsync-source-card">
                      <AssetPreview title="人物图" url={referenceImageUrl} emptyLabel="未上传" />
                      <div className="mode-note">
                        <strong>图片口型同步</strong>
                        <span>上传一张人物图，HeyGen 会用这张图对脚本做口型同步。</span>
                      </div>
                      <div className="stacked-actions">
                        <button
                          type="button"
                          disabled={isWorkflowRunning}
                          onClick={() => void uploadReferenceImage()}
                        >
                          <Upload size={16} />
                          上传人物图
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <section className="mode-output-card">
                    <div className="section-title">
                      <Save size={16} />
                      <h2>输出设置</h2>
                    </div>
                    <div className="control-grid mode-settings-grid">
                      <label>
                        生成语言 / 语音
                        <select
                          value={selectedTask.contentLanguage}
                          onChange={(event) =>
                            void updateCurrentTask({
                              contentLanguage: event.target.value as VideoTask["contentLanguage"]
                            })
                          }
                        >
                          {CONTENT_LANGUAGES.map((language) => (
                            <option key={language.id} value={language.id}>
                              {language.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <fieldset className="preset-fieldset">
                        <legend>输出比例</legend>
                        <label className="checkbox-row compact-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedTask.selectedOutputPresets.includes("portrait-9-16")}
                            onChange={(event) =>
                              void toggleOutputPreset("portrait-9-16", event.target.checked)
                            }
                          />
                          <Smartphone size={16} />
                          竖屏 9:16
                        </label>
                        <label className="checkbox-row compact-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedTask.selectedOutputPresets.includes("landscape-16-9")}
                            onChange={(event) =>
                              void toggleOutputPreset("landscape-16-9", event.target.checked)
                            }
                          />
                          <Monitor size={16} />
                          横屏 16:9
                        </label>
                      </fieldset>
                    </div>
                  </section>

                  <details className="mode-api-details">
                    <summary>本模式需要的 API / 模型</summary>
                    <FlowApiGuide
                      configurations={serviceConfigurations}
                      task={selectedTask}
                      hasGeneratedPresenterImages={hasGeneratedPresenterImages(selectedTask)}
                      selectedAvatarName={selectedAvatarLook?.name}
                    />
                  </details>
                </section>

                <div className="primary-actions">
                  {actionMessage ? <span className="action-message">{actionMessage}</span> : null}
                  <div className="export-directory-control">
                    <button
                      type="button"
                      disabled={isWorkflowRunning}
                      onClick={() => void chooseExportDirectory()}
                    >
                      <FolderOpen size={16} />
                      选择保存目录
                    </button>
                    <span title={exportDirectoryLabel}>{exportDirectoryLabel}</span>
                  </div>
                  <button
                    type="button"
                    className="primary"
                    disabled={isWorkflowRunning}
                    onClick={() => void runRealWorkflow()}
                  >
                    <Play size={18} />
                    一键输出视频和封面
                  </button>
                </div>
              </>
            )}
          </section>

          <aside className="preview-pane">
            <section className="preview-card">
              <div className="pane-heading">
                <span>{usesResultPreview ? "结果" : "预览"}</span>
                <button type="button" onClick={() => void openTaskExports()}>
                  <FolderOpen size={16} />
                  打开导出
                </button>
              </div>
              {selectedTask.generationMode === "mixed-cut" ? (
                <MixedCutResultPreview
                  editDecisionCount={
                    mixedCutOutputAssets.filter((asset) => asset.kind === "edit-decision-record")
                      .length
                  }
                  materialCount={mixedCutMaterialAssets.length}
                  targetCount={mixedCutBatchPlan.targetCount}
                  videoCount={mixedCutVideoAssets.length}
                  videoUrl={latestMixedCutVideoUrl}
                />
              ) : selectedTask.generationMode === "video-dedup" ? (
                <DedupResultPreview
                  processedVideoUrl={dedupProcessedVideoUrl}
                  report={dedupReportJsonUrl ? originalityReport : null}
                  sourceVideoUrl={dedupSourceVideoUrl}
                />
              ) : (
                <>
                  <nav className="preview-mode-tabs" aria-label="预览类型">
                    <button
                      className={activePreviewMode === "finished" ? "active" : ""}
                      data-testid="release-preview-finished-tab"
                      type="button"
                      onClick={() => setActivePreviewMode("finished")}
                    >
                      <strong>成品预览</strong>
                      <span>{presetLabel(previewPresetId ?? "portrait-9-16")}</span>
                    </button>
                    <button
                      className={activePreviewMode === "cover" ? "active" : ""}
                      data-testid="release-preview-cover-tab"
                      type="button"
                      onClick={() => setActivePreviewMode("cover")}
                    >
                      <strong>封面预览</strong>
                      <span>{coverAssetUrl ? "已生成" : "编辑中"}</span>
                    </button>
                  </nav>
                  {activePreviewMode === "finished" ? (
                    <PrimaryPreview
                      frameTitleStyle={frameTitleStyle}
                      frameTitleText={createFrameTitleText(selectedTask, coverStyle)}
                      presetId={previewPresetId}
                      videoUrl={finishedVideoUrl}
                      imageUrl={generatedPresenterUrl || referenceImageUrl || productImageUrl}
                      subtitleStyle={subtitleStyle}
                      subtitleText={createSubtitleSample(selectedTask)}
                      variantStatus={primaryVariant?.status}
                    />
                  ) : (
                    <CoverPreview
                      imageUrl={coverAssetUrl}
                      style={coverStyle}
                      title={coverStyle.title || createCoverTitle(selectedTask)}
                      presetId={previewPresetId}
                    />
                  )}
                  <PreviewStyleControls
                    activePreviewMode={activePreviewMode}
                    coverStyle={coverStyle}
                    customFontEnabled={Boolean(customFontUrl)}
                    disabled={isWorkflowRunning}
                    onCoverStyleChange={(patch) => void updateCoverStyle(patch)}
                    onFrameTitleStyleChange={(patch) => void updateFrameTitleStyle(patch)}
                    onSubtitleStyleChange={(patch) => void updateSubtitleStyle(patch)}
                    onUploadCustomFont={() => void uploadCustomFont()}
                    onSaveSettings={() => void savePreviewStyleSettings()}
                    frameTitleStyle={frameTitleStyle}
                    subtitleStyle={subtitleStyle}
                  />
                </>
              )}
            </section>

            <section className="status-strip" aria-label="步骤状态">
              <span className="status-count">
                {completeCount}/{steps.length}
              </span>
              {steps.map((step) => (
                <span
                  className={`status-pill ${step.status}`}
                  key={step.id}
                  title={step.errorMessage}
                >
                  {step.label}
                </span>
              ))}
            </section>

            {!usesResultPreview ? (
              <div className="preview-asset-grid">
                <AssetPreview title="商品图" url={productImageUrl} emptyLabel="未上传" />
                <AssetPreview title="人物图" url={referenceImageUrl} emptyLabel="未上传" />
                <AssetPreview title="人物商品图" url={generatedPresenterUrl} emptyLabel="未生成" />
              </div>
            ) : null}
          </aside>
        </main>
      )}

      {taskNameDialog ? (
        <div
          className="modal-backdrop"
          data-testid="release-task-dialog-backdrop"
          role="presentation"
          onClick={() => {
            if (!isTaskNameSaving) {
              setTaskNameDialog(null);
            }
          }}
        >
          <form
            className="task-dialog"
            data-testid="release-task-dialog"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void submitTaskNameDialog(event)}
          >
            <div className="task-dialog-heading">
              <h2>{taskNameDialog.mode === "create" ? "新建任务" : "重命名任务"}</h2>
              <p>
                {taskNameDialog.mode === "create"
                  ? "给这条视频任务起一个容易识别的名字。"
                  : "双击任务卡片后可在这里修改名称。"}
              </p>
            </div>
            <label>
              任务名称
              <input
                data-testid="release-task-name-input"
                autoFocus
                value={taskNameDialog.value}
                onChange={(event) =>
                  setTaskNameDialog((current) =>
                    current ? { ...current, value: event.target.value } : current
                  )
                }
              />
            </label>
            <div className="task-dialog-actions">
              <button
                disabled={isTaskNameSaving}
                type="button"
                onClick={() => setTaskNameDialog(null)}
              >
                取消
              </button>
              <button
                className="primary"
                data-testid="release-task-dialog-submit"
                disabled={isTaskNameSaving}
                type="submit"
              >
                {isTaskNameSaving ? "保存中..." : "确认"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteTaskDialog ? (
        <div
          className="modal-backdrop"
          data-testid="release-delete-dialog-backdrop"
          role="presentation"
          onClick={() => {
            if (!isTaskDeleting) {
              setDeleteTaskDialog(null);
            }
          }}
        >
          <section className="task-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="task-dialog-heading">
              <h2>删除任务</h2>
              <p>删除后会移除任务记录和本地素材目录，这个操作不可撤销。</p>
            </div>
            <div className="delete-task-name">{deleteTaskDialog.title}</div>
            <div className="task-dialog-actions">
              <button
                disabled={isTaskDeleting}
                type="button"
                onClick={() => setDeleteTaskDialog(null)}
              >
                取消
              </button>
              <button
                className="danger-button"
                data-testid="release-confirm-delete"
                disabled={isTaskDeleting}
                type="button"
                onClick={() => void deleteTask(deleteTaskDialog.id)}
              >
                {isTaskDeleting ? "删除中..." : "确认删除"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {outputConfirmTask ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!isWorkflowRunning) {
              setOutputConfirmTask(null);
            }
          }}
        >
          <section
            className="task-dialog output-confirm-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="task-dialog-heading">
              <h2>确认输出</h2>
              <p>
                请先在预览中设置字幕、画面标题和封面。确认后将输出带字幕与标题样式的成片
                MP4、封面、字幕文件和发布资料包。
              </p>
            </div>
            <div className="delete-task-name">{outputConfirmTask.title}</div>
            <div className="task-dialog-actions">
              <button
                disabled={isWorkflowRunning}
                type="button"
                onClick={() => setOutputConfirmTask(null)}
              >
                取消
              </button>
              <button
                className="primary"
                disabled={isWorkflowRunning}
                type="button"
                onClick={() => void executeRealWorkflow(outputConfirmTask)}
              >
                {isWorkflowRunning ? "输出中..." : "继续输出"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {avatarCreateDialog ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!isAvatarCreating) {
              setAvatarCreateDialog(null);
            }
          }}
        >
          <form
            className="task-dialog avatar-create-dialog"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void createHeyGenAvatar();
            }}
          >
            <div className="task-dialog-heading">
              <h2>创建 HeyGen Avatar</h2>
              <p>根据描述创建一个可复用数字人形象，成功后会自动加入当前任务选择。</p>
            </div>
            <label>
              Avatar 名称
              <input
                value={avatarCreateDialog.name}
                disabled={isAvatarCreating}
                onChange={(event) =>
                  setAvatarCreateDialog((current) =>
                    current ? { ...current, name: event.target.value } : current
                  )
                }
              />
            </label>
            <label>
              数字人描述提示词
              <textarea
                className="compact-textarea"
                value={avatarCreateDialog.prompt}
                disabled={isAvatarCreating}
                onChange={(event) =>
                  setAvatarCreateDialog((current) =>
                    current ? { ...current, prompt: event.target.value } : current
                  )
                }
              />
            </label>
            <div className="task-dialog-actions">
              <button
                disabled={isAvatarCreating}
                type="button"
                onClick={() => setAvatarCreateDialog(null)}
              >
                取消
              </button>
              <button className="primary" disabled={isAvatarCreating} type="submit">
                {isAvatarCreating ? "创建中..." : "创建并选中"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}>
          <section
            className="settings-modal"
            data-testid="release-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="设置"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pane-heading">
              <span>服务配置</span>
              <button
                className="icon-button small"
                title="关闭"
                onClick={() => setSettingsOpen(false)}
              >
                <Settings size={16} />
              </button>
            </div>
            <p className="settings-note">API Key 只保存在本机安全存储里，不写入任务数据库。</p>
            <LocalPathSettingsPanel
              choosingKind={choosingPathKind}
              message={pathSettingsMessage}
              onChoose={(kind) => void chooseAppPathSetting(kind)}
              settings={appPathSettings}
            />
            <div className="settings-layout">
              <nav className="settings-provider-nav" aria-label="服务列表">
                {serviceConfigurations.map((configuration) => {
                  const draft =
                    settingsDraft[configuration.providerId] ?? createEmptySettingsDraft();
                  const status = settingsProviderStatus(configuration, draft);
                  return (
                    <button
                      data-testid="release-settings-provider-tab"
                      data-provider-id={configuration.providerId}
                      className={
                        activeSettingsConfiguration?.providerId === configuration.providerId
                          ? "settings-provider-tab active"
                          : "settings-provider-tab"
                      }
                      key={configuration.providerId}
                      type="button"
                      onClick={() => setActiveSettingsProviderId(configuration.providerId)}
                    >
                      <span>
                        <strong>{configuration.label}</strong>
                        <small>{providerSidebarDescription(configuration.providerId)}</small>
                      </span>
                      <em className={`settings-provider-state ${status.tone}`}>{status.label}</em>
                    </button>
                  );
                })}
              </nav>

              <section className="settings-detail-panel">
                {activeSettingsConfiguration && activeSettingsDraft ? (
                  <>
                    <div className="settings-detail-heading">
                      <div>
                        <h3>{activeSettingsConfiguration.label}</h3>
                        <p>{providerSettingsHint(activeSettingsConfiguration.providerId)}</p>
                      </div>
                      <span>
                        {activeSettingsConfiguration.credentialConfigured
                          ? "已保存凭据"
                          : "未保存凭据"}
                      </span>
                    </div>

                    <div className="settings-form-grid">
                      <label>
                        Base URL
                        <input
                          type="text"
                          value={activeSettingsDraft.baseUrl}
                          placeholder="服务地址"
                          onChange={(event) =>
                            setSettingsDraft((current) =>
                              updateDraft(current, activeSettingsConfiguration.providerId, {
                                baseUrl: event.target.value
                              })
                            )
                          }
                        />
                      </label>

                      {hasModelNameField(activeSettingsConfiguration.providerId) ? (
                        <label>
                          模型名
                          <input
                            type="text"
                            value={activeSettingsDraft.modelName}
                            placeholder="先获取模型，或手动填写"
                            onChange={(event) =>
                              setSettingsDraft((current) =>
                                updateDraft(current, activeSettingsConfiguration.providerId, {
                                  modelName: event.target.value
                                })
                              )
                            }
                          />
                        </label>
                      ) : null}

                      {activeSettingsCanFetchModels ? (
                        <div className="model-picker-row">
                          <button
                            type="button"
                            disabled={Boolean(settingsBusyProviderId)}
                            onClick={() =>
                              void fetchServiceModels(activeSettingsConfiguration.providerId)
                            }
                          >
                            获取模型
                          </button>
                          {activeSettingsModelList?.models.length ? (
                            <select
                              className="model-select"
                              value={activeSettingsDraft.modelName}
                              onChange={(event) =>
                                setSettingsDraft((current) =>
                                  updateDraft(current, activeSettingsConfiguration.providerId, {
                                    modelName: event.target.value
                                  })
                                )
                              }
                            >
                              <option value="">选择模型</option>
                              {activeSettingsModelList.models.map((model) => (
                                <option key={model} value={model}>
                                  {model}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {activeSettingsCanFetchModels && activeSettingsModelList ? (
                      <p
                        className={
                          activeSettingsModelList.ok
                            ? "model-list-message ok"
                            : "model-list-message failed"
                        }
                      >
                        {activeSettingsModelList.message}
                      </p>
                    ) : null}

                    {activeSettingsConfiguration.providerId === "heygen" ? (
                      <div className="settings-form-grid three">
                        <label>
                          认证方式
                          <select
                            value={activeSettingsDraft.authMode ?? "api-key"}
                            onChange={(event) =>
                              setSettingsDraft((current) =>
                                updateDraft(current, activeSettingsConfiguration.providerId, {
                                  authMode: event.target.value as SettingsDraft["authMode"]
                                })
                              )
                            }
                          >
                            <option value="api-key">API Key（X-Api-Key）</option>
                            <option value="oauth-bearer">会员/OAuth Token（Bearer）</option>
                          </select>
                        </label>
                        <label>
                          生成路由
                          <select
                            value={activeSettingsDraft.generationRoute ?? "auto"}
                            onChange={(event) =>
                              setSettingsDraft((current) =>
                                updateDraft(current, activeSettingsConfiguration.providerId, {
                                  generationRoute: event.target
                                    .value as SettingsDraft["generationRoute"]
                                })
                              )
                            }
                          >
                            <option value="auto">自动（会员优先 Video Agent）</option>
                            <option value="direct-video">Direct Video（脚本精确）</option>
                            <option value="video-agent">Video Agent（会员路由）</option>
                          </select>
                        </label>
                        <label>
                          默认 Avatar ID（可选）
                          <input
                            type="text"
                            value={activeSettingsDraft.avatarId ?? ""}
                            placeholder="通常不用填；任务里会自动读取并选择预设数字人"
                            onChange={(event) =>
                              setSettingsDraft((current) =>
                                updateDraft(current, activeSettingsConfiguration.providerId, {
                                  avatarId: event.target.value
                                })
                              )
                            }
                          />
                        </label>
                        <label>
                          Voice ID
                          <input
                            type="text"
                            value={activeSettingsDraft.voiceId ?? ""}
                            placeholder="当前 HeyGen 账号可用的 Voice ID，可留空"
                            onChange={(event) =>
                              setSettingsDraft((current) =>
                                updateDraft(current, activeSettingsConfiguration.providerId, {
                                  voiceId: event.target.value
                                })
                              )
                            }
                          />
                        </label>
                        <label>
                          分辨率
                          <select
                            value={activeSettingsDraft.resolution ?? "720p"}
                            onChange={(event) =>
                              setSettingsDraft((current) =>
                                updateDraft(current, activeSettingsConfiguration.providerId, {
                                  resolution: event.target.value as SettingsDraft["resolution"]
                                })
                              )
                            }
                          >
                            <option value="720p">720p</option>
                            <option value="1080p">1080p</option>
                          </select>
                        </label>
                      </div>
                    ) : null}

                    {activeSettingsConfiguration.providerId === "asr" ? (
                      <div className="settings-form-grid">
                        <label>
                          ASR æŽ¥å£æ¨¡å¼
                          <select
                            value={activeSettingsDraft.asrMode ?? "audio-transcriptions"}
                            onChange={(event) =>
                              setSettingsDraft((current) =>
                                updateDraft(current, activeSettingsConfiguration.providerId, {
                                  asrMode: event.target.value as SettingsDraft["asrMode"]
                                })
                              )
                            }
                          >
                            <option value="chat-audio">
                              OpenAI Chat éŸ³é¢‘è¾“å…¥ï¼ˆGemini ä¸­è½¬æŽ¨èï¼‰
                            </option>
                            <option value="audio-transcriptions">
                              OpenAI audio/transcriptions
                            </option>
                          </select>
                        </label>
                      </div>
                    ) : null}

                    {needsServiceCredentialField(activeSettingsConfiguration.providerId) ? (
                      <label>
                        {activeSettingsConfiguration.providerId === "heygen" &&
                        activeSettingsDraft.authMode === "oauth-bearer"
                          ? "OAuth/Bearer Token（填新值会替换）"
                          : "API Key（填新值会替换）"}
                        <input
                          type="password"
                          value={activeSettingsDraft.apiKey}
                          placeholder={
                            activeSettingsConfiguration.credentialConfigured
                              ? "已保存；输入新值后保存会替换"
                              : activeSettingsConfiguration.providerId === "heygen" &&
                                  activeSettingsDraft.authMode === "oauth-bearer"
                                ? "粘贴 HeyGen OAuth/Bearer Token"
                                : "输入后保存"
                          }
                          onChange={(event) =>
                            setSettingsDraft((current) =>
                              updateDraft(current, activeSettingsConfiguration.providerId, {
                                apiKey: event.target.value
                              })
                            )
                          }
                        />
                      </label>
                    ) : null}

                    {activeSettingsConfiguration.providerId !== "video" ? (
                      <label className="checkbox-row settings-enabled-row">
                        <input
                          type="checkbox"
                          checked={activeSettingsDraft.enabled}
                          onChange={(event) =>
                            setSettingsDraft((current) =>
                              updateDraft(current, activeSettingsConfiguration.providerId, {
                                enabled: event.target.checked
                              })
                            )
                          }
                        />
                        启用
                      </label>
                    ) : null}

                    <div className="provider-actions settings-sticky-actions">
                      <button
                        type="button"
                        disabled={Boolean(settingsBusyProviderId)}
                        onClick={() =>
                          void saveServiceConfiguration(activeSettingsConfiguration.providerId)
                        }
                      >
                        {activeSettingsIsBusy ? "测试中" : "保存并测试"}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(settingsBusyProviderId)}
                        onClick={() =>
                          void testServiceConfiguration(activeSettingsConfiguration.providerId)
                        }
                      >
                        检查
                      </button>
                      {needsServiceCredentialField(activeSettingsConfiguration.providerId) ? (
                        <button
                          type="button"
                          disabled={Boolean(settingsBusyProviderId)}
                          onClick={() =>
                            void clearServiceCredential(activeSettingsConfiguration.providerId)
                          }
                        >
                          清除凭据
                        </button>
                      ) : null}
                    </div>

                    {activeSettingsCheckResult ? (
                      <p
                        className={
                          activeSettingsCheckResult.ok
                            ? "provider-check-result ok"
                            : "provider-check-result failed"
                        }
                      >
                        {activeSettingsCheckResult.ok ? "测试通过：" : "测试失败："}
                        {activeSettingsCheckResult.message}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="settings-route-note">正在读取服务配置...</p>
                )}
              </section>
            </div>
            {settingsMessage ? <p className="settings-message">{settingsMessage}</p> : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function LocalPathSettingsPanel({
  choosingKind,
  message,
  onChoose,
  settings
}: {
  choosingKind: AppPathSettingKind | "";
  message: string;
  onChoose: (kind: AppPathSettingKind) => void;
  settings: AppPathSettings;
}) {
  const rows: Array<{
    kind: AppPathSettingKind;
    label: string;
    hint: string;
    value: string;
  }> = [
    {
      kind: "sourceDownloadDirectory",
      label: "原视频下载目录",
      hint: "点击下载原视频后，除任务素材外会额外复制一份到这里。",
      value: settings.sourceDownloadDirectory
    },
    {
      kind: "generatedImageDirectory",
      label: "生成图片保存目录",
      hint: "人物商品图、重生成图片会额外复制到这里，并保存同名 prompt。",
      value: settings.generatedImageDirectory
    },
    {
      kind: "generatedVideoDirectory",
      label: "生成视频保存目录",
      hint: "一键输出视频和封面时，未选择任务目录则默认复制到这里。",
      value: settings.generatedVideoDirectory
    }
  ];

  return (
    <section className="local-path-settings" aria-label="本地保存路径">
      <div className="local-path-heading">
        <strong>本地保存路径</strong>
        <span>这些路径只保存在本机，用来快速找到下载素材、生成图片和最终成片。</span>
      </div>
      <div className="local-path-grid">
        {rows.map((row) => (
          <div className="local-path-row" key={row.kind}>
            <div>
              <strong>{row.label}</strong>
              <small>{row.hint}</small>
              <code title={row.value || "未设置"}>
                {row.value || "未设置，使用软件内部任务目录"}
              </code>
            </div>
            <span>
              <button
                disabled={Boolean(choosingKind)}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onChoose(row.kind);
                }}
              >
                {choosingKind === row.kind ? "选择中..." : "选择路径"}
              </button>
            </span>
          </div>
        ))}
      </div>
      {message ? <p className="local-path-message">{message}</p> : null}
    </section>
  );
}

function AssetPreview({
  title,
  url,
  emptyLabel
}: {
  title: string;
  url: string;
  emptyLabel: string;
}) {
  return (
    <div className="asset-preview">
      <span>{title}</span>
      <div className="asset-preview-media">
        {url ? <img alt={title} src={url} /> : <strong>{emptyLabel}</strong>}
      </div>
    </div>
  );
}

function GeneratedPresenterHistory({
  assets,
  assetUrls,
  onSelect,
  presetId,
  selectedAssetId
}: {
  assets: MediaAsset[];
  assetUrls: Record<string, string>;
  onSelect: (presetId: OutputPresetId, assetId: string) => void;
  presetId: OutputPresetId;
  selectedAssetId?: string;
}) {
  const presetAssets = [...assets]
    .filter((asset) => asset.relativePath.includes(presetId))
    .reverse()
    .slice(0, 8);

  return (
    <div className="generated-image-history">
      <div className="asset-list-heading">
        <strong>{presetLabel(presetId)} 历史图</strong>
        <span>{presetAssets.length} 张</span>
      </div>
      {presetAssets.length > 0 ? (
        <div className="generated-image-grid">
          {presetAssets.map((asset) => {
            const url = assetUrls[asset.relativePath] ?? "";
            return (
              <button
                className={asset.id === selectedAssetId ? "selected" : ""}
                key={asset.id}
                type="button"
                title={assetFileName(asset.relativePath)}
                onClick={() => onSelect(presetId, asset.id)}
              >
                {url ? <img alt={assetFileName(asset.relativePath)} src={url} /> : null}
                <span>{asset.id === selectedAssetId ? "当前" : "选择"}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="field-hint">当前比例还没有人物商品图。</p>
      )}
    </div>
  );
}

function AssetList({
  assets,
  emptyLabel,
  itemBadge,
  title
}: {
  assets: MediaAsset[];
  emptyLabel: string;
  itemBadge?: string;
  title: string;
}) {
  const visibleAssets = [...assets].reverse().slice(0, 6);

  return (
    <div className="asset-list">
      <div className="asset-list-heading">
        <strong>{title}</strong>
        <span>{assets.length} 个</span>
      </div>
      {visibleAssets.length > 0 ? (
        <ul>
          {visibleAssets.map((asset) => (
            <li key={asset.id}>
              <span>{assetKindLabel(asset.kind)}</span>
              <strong title={asset.relativePath}>{assetFileName(asset.relativePath)}</strong>
              {itemBadge ? <em>{itemBadge}</em> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>{emptyLabel}</p>
      )}
    </div>
  );
}

function OriginalityReportCard({ report }: { report: OriginalityScoreReport | null }) {
  return (
    <div className="originality-report-card">
      <div className="asset-list-heading">
        <strong>原创度评分</strong>
        <span>{report ? `${report.score}/${report.targetScore}` : "未生成"}</span>
      </div>
      {report ? (
        <>
          <div className={`score-meter ${report.passed ? "passed" : "warning"}`}>
            <strong>{report.score}</strong>
            <span>{report.passed ? "已达到阈值" : "需要继续处理"}</span>
          </div>
          <p>{report.summary}</p>
          <p className="field-hint">该分数为软件内部原创度/重复风险评分，不代表平台官方判定。</p>
        </>
      ) : (
        <p>导入视频并运行后会显示评分报告。</p>
      )}
    </div>
  );
}

function MixedCutResultPreview({
  editDecisionCount,
  materialCount,
  targetCount,
  videoCount,
  videoUrl
}: {
  editDecisionCount: number;
  materialCount: number;
  targetCount: number;
  videoCount: number;
  videoUrl: string;
}) {
  return (
    <div className="result-preview-panel">
      <div className="result-preview-stats">
        <span>
          <strong>{materialCount}</strong>
          <small>素材</small>
        </span>
        <span>
          <strong>{targetCount}</strong>
          <small>预计条数</small>
        </span>
        <span>
          <strong>{videoCount}</strong>
          <small>已生成视频</small>
        </span>
        <span>
          <strong>{editDecisionCount}</strong>
          <small>剪辑记录</small>
        </span>
      </div>
      <div className="result-video-box">
        {videoUrl ? (
          <video controls src={videoUrl} />
        ) : (
          <div>
            <strong>等待生成混剪成片</strong>
            <span>先选择素材文件夹，再一键输出视频和封面。</span>
          </div>
        )}
      </div>
      <p className="field-hint">
        混剪模块以素材组合、剪辑记录和批量成片为主，不显示字幕/封面实时样式面板。
      </p>
    </div>
  );
}

function DedupResultPreview({
  processedVideoUrl,
  report,
  sourceVideoUrl
}: {
  processedVideoUrl: string;
  report: OriginalityScoreReport | null;
  sourceVideoUrl: string;
}) {
  return (
    <div className="result-preview-panel">
      <div className="dedup-video-compare">
        <div className="result-video-box">
          <small>处理前</small>
          {sourceVideoUrl ? (
            <video controls src={sourceVideoUrl} />
          ) : (
            <div>
              <strong>未导入待处理视频</strong>
              <span>先导入混剪成片或本地 MP4。</span>
            </div>
          )}
        </div>
        <div className="result-video-box">
          <small>处理后</small>
          {processedVideoUrl ? (
            <video controls src={processedVideoUrl} />
          ) : (
            <div>
              <strong>等待去重处理</strong>
              <span>处理完成后这里显示新视频。</span>
            </div>
          )}
        </div>
      </div>
      <OriginalityReportCard report={report} />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function VisualStoryboardPanel({
  disabled,
  errorMessage,
  imageUrl,
  onGenerate,
  onPanelCountChange,
  panelCount,
  storyboard
}: {
  disabled: boolean;
  errorMessage: string;
  imageUrl: string;
  onGenerate: () => void;
  onPanelCountChange: (panelCount: VisualStoryboardPanelCount) => void;
  panelCount: VisualStoryboardPanelCount;
  storyboard: VisualStoryboardPackage | null;
}) {
  const shots = storyboard?.shots ?? [];

  return (
    <div className="visual-storyboard-card">
      <div className="visual-storyboard-header">
        <div>
          <strong>视觉故事板</strong>
          <span>生成带画面的统一分镜板，后续给即梦 / Seedance 等生视频模型参考。</span>
        </div>
        <div className="storyboard-controls">
          <label>
            分镜数量
            <select
              value={String(panelCount)}
              onChange={(event) =>
                onPanelCountChange(parseVisualStoryboardPanelCount(event.target.value))
              }
            >
              <option value="auto">自动 6-12</option>
              <option value="6">6 格</option>
              <option value="8">8 格</option>
              <option value="9">9 格</option>
              <option value="12">12 格</option>
            </select>
          </label>
          <button type="button" disabled={disabled} onClick={onGenerate}>
            <WandSparkles size={16} />
            一键生成视觉故事板
          </button>
        </div>
      </div>

      {storyboard ? (
        <div className="visual-storyboard-summary">
          <div>
            <small>布局</small>
            <strong>
              {storyboard.panelCount} 个分镜 · {storyboard.layout}
            </strong>
          </div>
          <div>
            <small>复刻策略</small>
            <span>{storyboard.remakeStrategy}</span>
          </div>
        </div>
      ) : (
        <p className="field-hint">
          先提取文案或做画面分析，再生成分镜提示词和统一故事板图。分镜数量可以自动，不固定九宫格。
        </p>
      )}

      {imageUrl ? (
        <div className="visual-storyboard-image">
          <img alt="视觉故事板" src={imageUrl} />
        </div>
      ) : (
        <div className="visual-storyboard-empty">
          {storyboard ? "故事板提示词已生成，故事板图尚未生成或需要重试。" : "还没有故事板图"}
        </div>
      )}

      {errorMessage ? <p className="storyboard-error">{errorMessage}</p> : null}

      {storyboard ? (
        <div className="storyboard-output-grid">
          <section>
            <h4>视觉统一设定</h4>
            <dl className="storyboard-bible">
              <div>
                <dt>主角</dt>
                <dd>{storyboard.visualBible.protagonist}</dd>
              </div>
              <div>
                <dt>商品</dt>
                <dd>{storyboard.visualBible.product}</dd>
              </div>
              <div>
                <dt>场景</dt>
                <dd>{storyboard.visualBible.location}</dd>
              </div>
              <div>
                <dt>风格</dt>
                <dd>
                  {storyboard.visualBible.colorPalette} · {storyboard.visualBible.cameraStyle}
                </dd>
              </div>
            </dl>
            <p className="storyboard-locks">
              {storyboard.visualBible.consistencyLocks.join(" / ")}
            </p>
          </section>

          <section>
            <h4>整片视频提示词</h4>
            <p className="storyboard-long-text">{storyboard.wholeVideoPrompt}</p>
          </section>
        </div>
      ) : null}

      {shots.length > 0 ? (
        <div className="storyboard-shot-list">
          <h4>分镜提示词</h4>
          <div className="storyboard-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>镜头</th>
                  <th>时长</th>
                  <th>画面</th>
                  <th>动作</th>
                  <th>运镜</th>
                  <th>提示词</th>
                </tr>
              </thead>
              <tbody>
                {shots.map((shot) => (
                  <tr key={`${shot.shotNumber}-${shot.imagePrompt}`}>
                    <td>{shot.shotNumber}</td>
                    <td>{shot.durationSeconds}s</td>
                    <td>{shot.visualAction}</td>
                    <td>{shot.subjectAction || shot.productAction}</td>
                    <td>{shot.cameraMovement}</td>
                    <td>{shot.imagePrompt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function VisualStoryboardPanelV2({
  disabled,
  errorMessage,
  finalScript,
  imageUrl,
  onGenerateScriptOptions,
  onGenerateStoryboard,
  onPanelCountChange,
  onUseScriptOption,
  panelCount,
  scriptErrorMessage,
  scriptPackage,
  storyboard
}: {
  disabled: boolean;
  errorMessage: string;
  finalScript: string;
  imageUrl: string;
  onGenerateScriptOptions: () => void;
  onGenerateStoryboard: () => void;
  onPanelCountChange: (panelCount: VisualStoryboardPanelCount) => void;
  onUseScriptOption: (script: string) => void;
  panelCount: VisualStoryboardPanelCount;
  scriptErrorMessage: string;
  scriptPackage: StoryScriptPackage | null;
  storyboard: VisualStoryboardPackage | null;
}) {
  const shots = storyboard?.shots ?? [];
  const recommendedOption =
    scriptPackage?.options.find((option) => option.id === scriptPackage.recommendedOptionId) ??
    scriptPackage?.options[0];

  return (
    <div className="visual-storyboard-card">
      <div className="visual-storyboard-header">
        <div>
          <strong>剧情带货故事板</strong>
          <span>先生成多套剧情脚本方案，确认或修改 AI 生成文案后，再生成统一视觉故事板。</span>
        </div>
        <button type="button" disabled={disabled} onClick={onGenerateScriptOptions}>
          <WandSparkles size={16} />
          生成剧情脚本方案
        </button>
      </div>

      {scriptErrorMessage ? <p className="storyboard-error">{scriptErrorMessage}</p> : null}

      {scriptPackage ? (
        <div className="story-script-panel">
          <div className="story-script-analysis">
            <section>
              <small>产品与用户分析</small>
              <p>{scriptPackage.productAnalysis}</p>
            </section>
            <section>
              <small>爆款机制</small>
              <p>{scriptPackage.referenceMechanics}</p>
            </section>
            <section>
              <small>转化策略</small>
              <p>{scriptPackage.conversionStrategy}</p>
            </section>
          </div>
          <div className="story-script-options">
            {scriptPackage.options.map((option) => (
              <article
                className={
                  option.id === recommendedOption?.id
                    ? "story-script-option recommended"
                    : "story-script-option"
                }
                key={option.id}
              >
                <div>
                  <strong>
                    {option.id}. {option.title}
                  </strong>
                  {option.id === recommendedOption?.id ? <span>推荐</span> : null}
                </div>
                <p>{option.angle}</p>
                <dl>
                  <div>
                    <dt>前 5 秒</dt>
                    <dd>{option.hook}</dd>
                  </div>
                  <div>
                    <dt>人群</dt>
                    <dd>{option.targetAudience}</dd>
                  </div>
                </dl>
                <ul>
                  {option.beatSheet.slice(0, 5).map((beat) => (
                    <li key={beat}>{beat}</li>
                  ))}
                </ul>
                <p className="story-script-reason">{option.reason}</p>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onUseScriptOption(option.script)}
                >
                  使用此方案
                </button>
              </article>
            ))}
          </div>
          <p className="story-script-originality">{scriptPackage.originalityNotes}</p>
        </div>
      ) : (
        <p className="field-hint">
          先提取文案、上传素材或做画面分析，再生成剧情脚本方案。推荐方案会自动写入 AI
          生成文案，你可以修改后再生成故事板。
        </p>
      )}

      <div className="visual-storyboard-header compact">
        <div>
          <strong>视觉故事板</strong>
          <span>根据当前 AI 生成文案生成分镜提示词、统一设定和带画面的故事板图。</span>
        </div>
        <div className="storyboard-controls">
          <label>
            分镜数量
            <select
              value={String(panelCount)}
              onChange={(event) =>
                onPanelCountChange(parseVisualStoryboardPanelCount(event.target.value))
              }
            >
              <option value="auto">自动 6-12</option>
              <option value="6">6 格</option>
              <option value="8">8 格</option>
              <option value="9">9 格</option>
              <option value="12">12 格</option>
            </select>
          </label>
          <button
            type="button"
            disabled={disabled || !finalScript.trim()}
            onClick={onGenerateStoryboard}
          >
            <WandSparkles size={16} />
            确认脚本并生成故事板
          </button>
        </div>
      </div>

      {storyboard ? (
        <div className="visual-storyboard-summary">
          <div>
            <small>布局</small>
            <strong>
              {storyboard.panelCount} 个分镜 · {storyboard.layout}
            </strong>
          </div>
          <div>
            <small>复刻策略</small>
            <span>{storyboard.remakeStrategy}</span>
          </div>
        </div>
      ) : (
        <p className="field-hint">
          当前还没有视觉故事板。请先确认 AI 生成文案，再生成分镜提示词和统一故事板图。
        </p>
      )}

      {imageUrl ? (
        <div className="visual-storyboard-image">
          <img alt="视觉故事板" src={imageUrl} />
        </div>
      ) : (
        <div className="visual-storyboard-empty">
          {storyboard ? "故事板提示词已生成，故事板图尚未生成或需要重试。" : "还没有故事板图"}
        </div>
      )}

      {errorMessage ? <p className="storyboard-error">{errorMessage}</p> : null}

      {storyboard ? (
        <div className="storyboard-output-grid">
          <section>
            <h4>视觉统一设定</h4>
            <dl className="storyboard-bible">
              <div>
                <dt>主角</dt>
                <dd>{storyboard.visualBible.protagonist}</dd>
              </div>
              <div>
                <dt>商品</dt>
                <dd>{storyboard.visualBible.product}</dd>
              </div>
              <div>
                <dt>场景</dt>
                <dd>{storyboard.visualBible.location}</dd>
              </div>
              <div>
                <dt>风格</dt>
                <dd>
                  {storyboard.visualBible.colorPalette} · {storyboard.visualBible.cameraStyle}
                </dd>
              </div>
            </dl>
            <p className="storyboard-locks">
              {storyboard.visualBible.consistencyLocks.join(" / ")}
            </p>
          </section>

          <section>
            <h4>整片视频提示词</h4>
            <p className="storyboard-long-text">{storyboard.wholeVideoPrompt}</p>
          </section>
        </div>
      ) : null}

      {shots.length > 0 ? (
        <div className="storyboard-shot-list">
          <h4>分镜提示词</h4>
          <div className="storyboard-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>镜头</th>
                  <th>时长</th>
                  <th>画面</th>
                  <th>动作</th>
                  <th>运镜</th>
                  <th>提示词</th>
                </tr>
              </thead>
              <tbody>
                {shots.map((shot) => (
                  <tr key={`${shot.shotNumber}-${shot.imagePrompt}`}>
                    <td>{shot.shotNumber}</td>
                    <td>{shot.durationSeconds}s</td>
                    <td>{shot.visualAction}</td>
                    <td>{shot.subjectAction || shot.productAction}</td>
                    <td>{shot.cameraMovement}</td>
                    <td>{shot.imagePrompt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface FlowApiGuideItem {
  title: string;
  providerId?: ProviderId;
  providerLabel: string;
  modelLabel: string;
  detail: string;
  active: boolean;
}

interface ModeRecommendation {
  mode: VideoGenerationMode;
  score: number;
  reason: string;
  missing: string[];
  resourcePackLabel: string;
}

interface ModeRecommendationReport {
  primaryMode: VideoGenerationMode;
  summary: string;
  recommendations: ModeRecommendation[];
}

function buildModeRecommendationReport({
  generatedPresenterImageCount,
  knowledgeContextCounts,
  mixedCutVisualMaterialCount,
  sourceMaterialCount,
  task
}: {
  generatedPresenterImageCount: number;
  knowledgeContextCounts: ReturnType<typeof countKnowledgeContextSources>;
  mixedCutVisualMaterialCount: number;
  sourceMaterialCount: number;
  task: VideoTask;
}): ModeRecommendationReport {
  const assets = getTaskScopedMediaAssets(task);
  const hasAsset = (...kinds: MediaAsset["kind"][]) =>
    assets.some((asset) => kinds.includes(asset.kind));
  const countAssets = (...kinds: MediaAsset["kind"][]) =>
    assets.filter((asset) => kinds.includes(asset.kind)).length;
  const allText = [
    task.sourceScript,
    task.finalScript,
    task.avatarDescriptionPrompt,
    task.motionPrompt,
    task.creativeWorkflow.referenceAnalysis,
    task.creativeWorkflow.sellingPoints,
    task.creativeWorkflow.storyboard,
    task.creativeWorkflow.dailyPipeline,
    task.creativeWorkflow.aiVideoPrompt,
    task.creativeWorkflow.mixedCutPlan,
    task.personalIpProfile.name,
    task.personalIpProfile.persona,
    task.personalIpProfile.tone,
    task.personalIpProfile.catchphrases,
    task.personalIpProfile.bannedWords
  ].join("\n");
  const hasEditableScript = Boolean(task.finalScript.trim());
  const hasReferenceCopy = Boolean(task.sourceScript.trim() || hasAsset("source-transcript"));
  const hasSourceAnalysis = Boolean(
    task.originalVideoUrl?.trim() || sourceMaterialCount > 0 || hasAsset("source-visual-analysis")
  );
  const hasKnowledge =
    knowledgeContextCounts.uploadedKnowledge + knowledgeContextCounts.viralReferences > 0;
  const hasAvatar = Boolean(task.presetAvatarId || task.presetAvatarGroupId);
  const hasProductSignal =
    hasAsset("product-image") ||
    /商品|带货|卖点|价格|折扣|优惠|sku|product|price|shop|order|buy/i.test(allText);
  const hasIpSignal =
    Boolean(
      task.personalIpProfile.name.trim() ||
      task.personalIpProfile.persona.trim() ||
      task.personalIpProfile.tone.trim()
    ) || /探店|知识|观点|经验|教程|分享|人设|IP|review|tutorial|opinion/i.test(allText);
  const hasPresenterImage = generatedPresenterImageCount > 0 || hasAsset("reference-image");
  const hasStoryboard =
    hasAsset("visual-storyboard", "story-script-options") ||
    Boolean(task.creativeWorkflow.storyboard.trim());
  const hasMixedCutSource =
    mixedCutVisualMaterialCount > 0 || Boolean(task.mixedCutMaterialDirectory.trim());
  const hasDedupSource =
    Boolean(task.dedupSourceVideoAssetId) ||
    task.outputVariants.some((variant) => Boolean(variant.finishedVideoPath)) ||
    hasAsset("dedup-source-video", "mixed-cut-video", "finished-video", "avatar-video");
  const finishedOutputCount =
    countAssets("mixed-cut-video", "dedup-processed-video", "finished-video", "avatar-video") +
    task.outputVariants.filter((variant) => Boolean(variant.finishedVideoPath)).length;
  const mixedCutPlan = calculateMixedCutBatchPlan({
    materialCount: mixedCutVisualMaterialCount,
    reuseRate: task.mixedCutReuseRate
  });

  const makeRecommendation = (
    mode: VideoGenerationMode,
    score: number,
    reason: string,
    missing: string[],
    resourcePackLabel: string
  ): ModeRecommendation => ({
    mode,
    score: clampScore(score),
    reason,
    missing,
    resourcePackLabel
  });

  const recommendations: ModeRecommendation[] = [
    makeRecommendation(
      "preset-avatar",
      26 +
        (hasEditableScript ? 26 : 0) +
        (hasAvatar ? 20 : 0) +
        (hasReferenceCopy ? 10 : 0) +
        (task.selectedOutputPresets.length > 0 ? 8 : 0) +
        (hasKnowledge ? 6 : 0),
      "适合用已确认脚本驱动 HeyGen 预设数字人口播。",
      [
        hasEditableScript ? "" : "AI生成文案/最终脚本",
        hasAvatar ? "" : "预设数字人",
        task.selectedOutputPresets.length > 0 ? "" : "输出比例"
      ].filter(Boolean),
      `${hasEditableScript ? 1 : 0} 条脚本 / ${hasAvatar ? 1 : 0} 个数字人`
    ),
    makeRecommendation(
      "product-avatar",
      24 +
        (hasProductSignal ? 26 : 0) +
        (hasEditableScript ? 16 : 0) +
        (hasAsset("product-image") ? 14 : 0) +
        (generatedPresenterImageCount > 0 ? 10 : 0) +
        (hasSourceAnalysis ? 6 : 0),
      "适合把商品卖点、人物商品图和数字人口播组合成带货视频。",
      [
        hasProductSignal ? "" : "商品卖点/价格/产品资料",
        hasEditableScript ? "" : "带货文案",
        hasAsset("product-image") ? "" : "商品图片"
      ].filter(Boolean),
      `${countAssets("product-image")} 张商品图 / ${generatedPresenterImageCount} 张人物商品图`
    ),
    makeRecommendation(
      "image-lipsync",
      22 +
        (hasPresenterImage ? 34 : 0) +
        (hasEditableScript ? 22 : 0) +
        (task.motionPrompt.trim() ? 10 : 0) +
        (task.selectedOutputPresets.length > 0 ? 6 : 0),
      "适合用人物图或人物商品图做图片口型同步视频。",
      [
        hasPresenterImage ? "" : "人物图/人物商品图",
        hasEditableScript ? "" : "口播脚本",
        task.motionPrompt.trim() ? "" : "动作提示词"
      ].filter(Boolean),
      `${generatedPresenterImageCount + countAssets("reference-image")} 张可用人物图`
    ),
    makeRecommendation(
      "personal-ip",
      24 +
        (hasIpSignal ? 25 : 0) +
        (hasEditableScript ? 18 : 0) +
        (hasSourceAnalysis ? 10 : 0) +
        (hasKnowledge ? 8 : 0) +
        (task.contentLanguage ? 5 : 0),
      "适合探店、观点、知识输出或账号人设型内容。",
      [
        hasIpSignal ? "" : "人设/语气/内容方向",
        hasEditableScript ? "" : "可编辑文案",
        hasSourceAnalysis || hasKnowledge ? "" : "参考资料或分析结果"
      ].filter(Boolean),
      `${hasIpSignal ? 1 : 0} 组人设 / ${knowledgeContextCounts.taskAssets} 个当前任务来源`
    ),
    makeRecommendation(
      "viral-remix",
      24 +
        (hasSourceAnalysis ? 22 : 0) +
        (hasReferenceCopy ? 16 : 0) +
        (hasStoryboard ? 16 : 0) +
        (hasEditableScript ? 10 : 0) +
        (knowledgeContextCounts.viralReferences > 0 ? 8 : 0),
      "适合先拉片分析，再保留结构与节奏，生成原创表达和故事板。",
      [
        hasSourceAnalysis ? "" : "原视频链接/素材/画面分析",
        hasReferenceCopy ? "" : "提取文案",
        hasStoryboard ? "" : "故事板或分镜提示词"
      ].filter(Boolean),
      `${sourceMaterialCount} 个源素材 / ${countAssets("visual-storyboard")} 个故事板产物`
    ),
    makeRecommendation(
      "mixed-cut",
      20 +
        (hasMixedCutSource ? 28 : 0) +
        Math.min(24, mixedCutVisualMaterialCount * 3) +
        (mixedCutPlan.targetCount > 1 ? 8 : 0) +
        (task.finalScript.trim() ? 8 : 0),
      "适合只做批量素材混剪，不承担二次去重。",
      [
        hasMixedCutSource ? "" : "混剪素材文件夹",
        mixedCutVisualMaterialCount >= 3 ? "" : "更多画面素材"
      ].filter(Boolean),
      `${mixedCutVisualMaterialCount} 个画面素材 / 预计 ${mixedCutPlan.targetCount} 条`
    ),
    makeRecommendation(
      "video-dedup",
      18 +
        (hasDedupSource ? 42 : 0) +
        (finishedOutputCount > 0 ? 14 : 0) +
        (hasAsset("dedup-report") ? 14 : 0) +
        (task.dedupTargetScore >= 80 ? 8 : 0),
      "适合对已有成片做二次处理和内部原创度评分。",
      [
        hasDedupSource ? "" : "待处理视频",
        task.dedupTargetScore >= 80 ? "" : "80+ 目标阈值",
        hasAsset("dedup-report") ? "" : "评分报告"
      ].filter(Boolean),
      `${finishedOutputCount} 个可处理成片 / 目标 ${task.dedupTargetScore} 分`
    )
  ].sort((left, right) => right.score - left.score);

  const primaryMode = recommendations[0]?.mode ?? task.generationMode;
  const primaryLabel = generationModeLabel(primaryMode);
  const primaryScore = recommendations[0]?.score ?? 0;
  const summary =
    primaryScore >= 70
      ? `当前任务资料更适合先走「${primaryLabel}」，生成时会优先调用本任务的分析结果、AI文案、图片和素材。`
      : `当前任务资料还不完整，建议先在分析中心补齐原视频/素材、文案、画面分析或知识资料，再进入「${primaryLabel}」。`;

  return {
    primaryMode,
    summary,
    recommendations
  };
}

function ModeRecommendationPanel({
  currentMode,
  isReady,
  onSelectMode,
  report
}: {
  currentMode: VideoGenerationMode;
  isReady: boolean;
  onSelectMode: (mode: VideoGenerationMode) => void;
  report: ModeRecommendationReport;
}) {
  const primary = report.recommendations[0];

  return (
    <section className="mode-recommendation-panel">
      {!isReady ? (
        <div className="mode-recommendation-empty">
          <small>模式推荐</small>
          <strong>等待提取文案或画面分析</strong>
          <p>
            先下载/上传原视频，再点击“提取文案”或“画面分析”。完成后这里会根据当前任务资料推荐适合的制作模式。
          </p>
        </div>
      ) : null}
      {isReady ? (
        <>
          <div className="mode-recommendation-summary">
            <div>
              <small>推荐模式</small>
              <strong>{generationModeLabel(report.primaryMode)}</strong>
            </div>
            <p>{report.summary}</p>
            {primary ? <span>{primary.score} 分</span> : null}
          </div>
          <div className="mode-recommendation-grid">
            {report.recommendations.map((item) => (
              <button
                className={item.mode === currentMode ? "active" : ""}
                key={item.mode}
                type="button"
                onClick={() => onSelectMode(item.mode)}
              >
                <span>
                  <strong>{generationModeLabel(item.mode)}</strong>
                  <em>{item.resourcePackLabel}</em>
                </span>
                <b>{item.score}</b>
                <small>{item.reason}</small>
                {item.missing.length > 0 ? (
                  <i>缺：{item.missing.join(" / ")}</i>
                ) : (
                  <i>资料较完整</i>
                )}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function TaskResourceLibrary({
  generatedPresenterCount,
  knowledgeCount,
  mixedCutOutputCount,
  mixedCutVisualMaterialCount,
  sourceMaterialCount,
  task,
  visualStoryboardCount
}: {
  generatedPresenterCount: number;
  knowledgeCount: number;
  mixedCutOutputCount: number;
  mixedCutVisualMaterialCount: number;
  sourceMaterialCount: number;
  task: VideoTask;
  visualStoryboardCount: number;
}) {
  const assets = getTaskScopedMediaAssets(task);
  const resources = [
    {
      label: "原视频/源素材",
      count: sourceMaterialCount + mixedCutVisualMaterialCount,
      detail: task.originalVideoUrl?.trim() ? "已填写原视频链接" : "可下载、上传或同步素材文件夹"
    },
    {
      label: "分析结果",
      count: assets.filter((asset) => asset.kind === "source-visual-analysis").length,
      detail: "拉片/画面分析结果会进入 AI 文案上下文"
    },
    {
      label: "任务补充资料",
      count: knowledgeCount,
      detail: "统一知识库全局调用；这里是当前任务额外上传的案例/资料"
    },
    {
      label: "AI 文案",
      count: task.finalScript.trim() ? 1 : 0,
      detail: task.finalScript.trim() ? "已生成或已手动编辑" : "可一键生成后再修改"
    },
    {
      label: "AI 图片/故事板",
      count: generatedPresenterCount + visualStoryboardCount,
      detail: "人物商品图、参考图、故事板都可在本任务内复用"
    },
    {
      label: "成片/后期产物",
      count:
        mixedCutOutputCount +
        task.outputVariants.filter((variant) => variant.finishedVideoPath).length,
      detail: "混剪、数字人、去重结果都归属当前任务"
    }
  ];

  return (
    <section className="task-resource-library">
      <div className="task-resource-heading">
        <strong>当前任务资料库</strong>
        <span>任务素材、分析结果、AI 文案和图片只归属当前任务；统一知识库全局复用</span>
      </div>
      <div className="task-resource-grid">
        {resources.map((resource) => (
          <div className={resource.count > 0 ? "ready" : ""} key={resource.label}>
            <small>{resource.label}</small>
            <strong>{resource.count}</strong>
            <span>{resource.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductionWorkflowPanel({ workflow }: { workflow: ProductionModeWorkflow }) {
  return (
    <section className="production-workflow-panel" aria-label="内置视频生产流程">
      <div className="production-workflow-heading">
        <div>
          <span>内置流程</span>
          <strong>{workflow.label}</strong>
        </div>
        <p>{workflow.summary}</p>
      </div>
      <div className="production-method-row">
        {workflow.builtInMethods.slice(0, 5).map((method) => (
          <span key={method}>{method}</span>
        ))}
      </div>
      <div className="production-inputs">
        <strong>默认输入</strong>
        <span>{workflow.defaultInputs.join(" / ")}</span>
      </div>
      <ol className="production-stage-list">
        {workflow.stages.map((stage, index) => (
          <li key={stage.id} title={stage.method}>
            <small>{String(index + 1).padStart(2, "0")}</small>
            <div>
              <strong>{stage.label}</strong>
              <span>{stage.goal}</span>
              <em>产物：{stage.outputs.join("、")}</em>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FlowApiGuide({
  configurations,
  hasGeneratedPresenterImages,
  selectedAvatarName,
  task
}: {
  configurations: ServiceConfiguration[];
  hasGeneratedPresenterImages: boolean;
  selectedAvatarName?: string;
  task: VideoTask;
}) {
  const items = buildFlowApiGuideItems({
    configurations,
    hasGeneratedPresenterImages,
    selectedAvatarName,
    task
  });

  return (
    <div className="flow-api-guide" aria-label="流程 API 与模型提示">
      <div className="flow-api-guide-title">
        <span>
          <KeyRound size={15} />
          流程 API / 模型提示
        </span>
        <small>只显示是否已配置，不显示 Key 内容</small>
      </div>
      <div className="flow-api-guide-grid">
        {items.map((item) => (
          <div className={item.active ? "flow-api-card active" : "flow-api-card"} key={item.title}>
            <div className="flow-api-card-heading">
              <strong>{item.title}</strong>
              <span>{item.active ? "本任务会用" : "可选/后续"}</span>
            </div>
            <p>{item.detail}</p>
            <dl>
              <div>
                <dt>服务</dt>
                <dd>{item.providerLabel}</dd>
              </div>
              <div>
                <dt>模型/ID</dt>
                <dd>{item.modelLabel}</dd>
              </div>
              <div>
                <dt>API Key</dt>
                <dd>
                  {item.providerId ? credentialStatus(configurations, item.providerId) : "不需要"}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrimaryPreview({
  frameTitleStyle,
  frameTitleText,
  presetId,
  videoUrl,
  imageUrl,
  subtitleStyle,
  subtitleText,
  variantStatus
}: {
  frameTitleStyle: FrameTitleStyle;
  frameTitleText: string;
  presetId: OutputPresetId | undefined;
  videoUrl: string;
  imageUrl: string;
  subtitleStyle: SubtitleStyle;
  subtitleText: string;
  variantStatus?: VideoTask["outputVariants"][number]["status"];
}) {
  const frameClassName = `media-stage ${presetId === "landscape-16-9" ? "landscape" : "portrait"}`;

  return (
    <div className={frameClassName} data-testid="release-media-stage">
      {videoUrl ? (
        <video controls src={videoUrl} />
      ) : imageUrl ? (
        <img alt="预览素材" src={imageUrl} />
      ) : (
        <div className="media-placeholder">
          <strong>{presetId ? presetLabel(presetId) : "视频预览"}</strong>
          <span>{variantStatus ? variantStatusLabel(variantStatus) : "等待生成"}</span>
        </div>
      )}
      {subtitleStyle.enabled ? (
        <div className="subtitle-preview" style={subtitlePreviewStyle(subtitleStyle)}>
          {subtitleText}
        </div>
      ) : null}
      {frameTitleStyle.enabled && frameTitleText ? (
        <div className="frame-title-preview" style={frameTitlePreviewStyle(frameTitleStyle)}>
          {frameTitleText}
        </div>
      ) : null}
    </div>
  );
}

function PreviewStyleControls({
  activePreviewMode,
  coverStyle,
  customFontEnabled,
  disabled,
  frameTitleStyle,
  onCoverStyleChange,
  onFrameTitleStyleChange,
  onSaveSettings,
  onSubtitleStyleChange,
  onUploadCustomFont,
  subtitleStyle
}: {
  activePreviewMode: PreviewMode;
  coverStyle: CoverStyle;
  customFontEnabled: boolean;
  disabled: boolean;
  frameTitleStyle: FrameTitleStyle;
  onCoverStyleChange: (patch: Partial<CoverStyle>) => void;
  onFrameTitleStyleChange: (patch: Partial<FrameTitleStyle>) => void;
  onSaveSettings: () => void;
  onSubtitleStyleChange: (patch: Partial<SubtitleStyle>) => void;
  onUploadCustomFont: () => void;
  subtitleStyle: SubtitleStyle;
}) {
  return (
    <div className="preview-style-panel">
      <div className="preview-style-header">
        <strong>{activePreviewMode === "finished" ? "成品样式" : "封面样式"}</strong>
        <span className="preview-style-actions">
          <button type="button" disabled={disabled} onClick={onSaveSettings}>
            <Save size={14} />
            保存设置
          </button>
          <button type="button" disabled={disabled} onClick={onUploadCustomFont}>
            <Upload size={14} />
            上传字体
          </button>
        </span>
      </div>

      {activePreviewMode === "finished" ? (
        <>
          <FrameTitleControls
            customFontEnabled={customFontEnabled}
            onChange={onFrameTitleStyleChange}
            style={frameTitleStyle}
          />
          <SubtitleControls
            customFontEnabled={customFontEnabled}
            onChange={onSubtitleStyleChange}
            style={subtitleStyle}
          />
        </>
      ) : (
        <CoverControls
          customFontEnabled={customFontEnabled}
          onChange={onCoverStyleChange}
          style={coverStyle}
        />
      )}
    </div>
  );
}

function FrameTitleControls({
  customFontEnabled,
  onChange,
  style
}: {
  customFontEnabled: boolean;
  onChange: (patch: Partial<FrameTitleStyle>) => void;
  style: FrameTitleStyle;
}) {
  return (
    <section className="style-control-panel">
      <h3>画面标题</h3>
      <div className="preview-control-grid">
        <label className="wide-control checkbox-row inline-toggle">
          <input
            type="checkbox"
            checked={style.enabled}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />
          显示画面标题
        </label>
        <label className="wide-control">
          标题文字
          <input
            type="text"
            value={style.text}
            placeholder="留空时自动取 AI 文案首句"
            onChange={(event) => onChange({ text: event.target.value })}
          />
        </label>
        <label className="range-control">
          位置 {style.verticalPercent}%
          <span className="range-row">
            <input
              type="range"
              min={5}
              max={92}
              value={style.verticalPercent}
              onInput={(event) =>
                onChange({ verticalPercent: Number((event.target as HTMLInputElement).value) })
              }
              onChange={(event) => onChange({ verticalPercent: Number(event.target.value) })}
            />
            <input
              type="number"
              min={5}
              max={92}
              value={style.verticalPercent}
              onChange={(event) => onChange({ verticalPercent: Number(event.target.value) })}
            />
          </span>
        </label>
        <label>
          字号
          <input
            type="number"
            min={24}
            max={84}
            value={style.fontSize}
            onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
          />
        </label>
        <FontSelect
          customFontEnabled={customFontEnabled}
          label="字体"
          value={style.fontFamily}
          onChange={(fontFamily) => onChange({ fontFamily })}
        />
        <label>
          字重
          <select
            value={style.fontWeight}
            onChange={(event) =>
              onChange({ fontWeight: event.target.value as FrameTitleStyle["fontWeight"] })
            }
          >
            <option value="bold">粗体</option>
            <option value="regular">常规</option>
          </select>
        </label>
        <ColorInput
          label="文字"
          value={style.textColor}
          onChange={(value) => onChange({ textColor: value })}
        />
        <ColorInput
          label="底色"
          value={style.backgroundColor}
          onChange={(value) => onChange({ backgroundColor: value })}
        />
      </div>
    </section>
  );
}

function SubtitleControls({
  customFontEnabled,
  onChange,
  style
}: {
  customFontEnabled: boolean;
  onChange: (patch: Partial<SubtitleStyle>) => void;
  style: SubtitleStyle;
}) {
  return (
    <section className="style-control-panel">
      <h3>字幕</h3>
      <div className="preview-control-grid">
        <label className="range-control">
          位置 {style.verticalPercent}%
          <span className="range-row">
            <input
              type="range"
              min={5}
              max={92}
              value={style.verticalPercent}
              onInput={(event) =>
                onChange({ verticalPercent: Number((event.target as HTMLInputElement).value) })
              }
              onChange={(event) => onChange({ verticalPercent: Number(event.target.value) })}
            />
            <input
              type="number"
              min={5}
              max={92}
              value={style.verticalPercent}
              onChange={(event) => onChange({ verticalPercent: Number(event.target.value) })}
            />
          </span>
        </label>
        <label>
          字号
          <input
            type="number"
            min={20}
            max={72}
            value={style.fontSize}
            onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
          />
        </label>
        <FontSelect
          customFontEnabled={customFontEnabled}
          label="字体"
          value={style.fontFamily}
          onChange={(fontFamily) => onChange({ fontFamily })}
        />
        <label>
          字重
          <select
            value={style.fontWeight}
            onChange={(event) =>
              onChange({ fontWeight: event.target.value as SubtitleStyle["fontWeight"] })
            }
          >
            <option value="bold">粗体</option>
            <option value="regular">常规</option>
          </select>
        </label>
        <ColorInput
          label="文字"
          value={style.textColor}
          onChange={(value) => onChange({ textColor: value })}
        />
        <ColorInput
          label="底色"
          value={style.backgroundColor}
          onChange={(value) => onChange({ backgroundColor: value })}
        />
      </div>
    </section>
  );
}

function CoverControls({
  customFontEnabled,
  onChange,
  style
}: {
  customFontEnabled: boolean;
  onChange: (patch: Partial<CoverStyle>) => void;
  style: CoverStyle;
}) {
  return (
    <section className="style-control-panel">
      <h3>封面</h3>
      <div className="preview-control-grid">
        <label className="wide-control">
          标题
          <input
            type="text"
            value={style.title}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </label>
        <label className="wide-control">
          副标题
          <input
            type="text"
            value={style.subtitle}
            onChange={(event) => onChange({ subtitle: event.target.value })}
          />
        </label>
        <label className="range-control">
          标题位置 {style.verticalPercent}%
          <span className="range-row">
            <input
              type="range"
              min={8}
              max={90}
              value={style.verticalPercent}
              onInput={(event) =>
                onChange({ verticalPercent: Number((event.target as HTMLInputElement).value) })
              }
              onChange={(event) => onChange({ verticalPercent: Number(event.target.value) })}
            />
            <input
              type="number"
              min={8}
              max={90}
              value={style.verticalPercent}
              onChange={(event) => onChange({ verticalPercent: Number(event.target.value) })}
            />
          </span>
        </label>
        <FontSelect
          customFontEnabled={customFontEnabled}
          label="字体"
          value={style.fontFamily}
          onChange={(fontFamily) => onChange({ fontFamily })}
        />
        <label>
          字号
          <input
            type="number"
            min={32}
            max={96}
            value={style.fontSize}
            onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
          />
        </label>
        <label>
          字重
          <select
            value={style.fontWeight}
            onChange={(event) =>
              onChange({ fontWeight: event.target.value as CoverStyle["fontWeight"] })
            }
          >
            <option value="bold">粗体</option>
            <option value="regular">常规</option>
          </select>
        </label>
        <ColorInput
          label="文字"
          value={style.textColor}
          onChange={(value) => onChange({ textColor: value })}
        />
        <ColorInput
          label="背景"
          value={style.backgroundColor}
          onChange={(value) => onChange({ backgroundColor: value })}
        />
        <ColorInput
          label="强调"
          value={style.accentColor}
          onChange={(value) => onChange({ accentColor: value })}
        />
      </div>
    </section>
  );
}

function FontSelect({
  customFontEnabled,
  label,
  onChange,
  value
}: {
  customFontEnabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="Microsoft YaHei">微软雅黑</option>
        <option value="SimHei">黑体</option>
        <option value="Arial">Arial</option>
        <option value="Georgia">Georgia</option>
        {customFontEnabled ? <option value="DHS Custom Font">自定义字体</option> : null}
      </select>
    </label>
  );
}

function CoverPreview({
  imageUrl,
  style,
  title,
  presetId
}: {
  imageUrl: string;
  style: CoverStyle;
  title: string;
  presetId: OutputPresetId | undefined;
}) {
  const isLandscape = presetId === "landscape-16-9";
  const titleFontSize = Math.min(
    32,
    Math.max(15, Math.round(style.fontSize * (isLandscape ? 0.3 : 0.24)))
  );
  const previewStyle: CSSProperties = {
    backgroundColor: style.backgroundColor,
    color: style.textColor,
    fontFamily: style.fontFamily
  };
  const coverTitleTransform =
    style.verticalPercent <= 18
      ? "translateY(0)"
      : style.verticalPercent >= 82
        ? "translateY(-100%)"
        : "translateY(-50%)";
  const titleBlockStyle: CSSProperties = {
    top: `${style.verticalPercent}%`,
    transform: coverTitleTransform
  };

  return (
    <div
      className={`cover-preview ${isLandscape ? "landscape" : "portrait"}`}
      data-testid="release-cover-preview"
      style={previewStyle}
    >
      {imageUrl ? <img className="cover-preview-image" alt="默认封面底图" src={imageUrl} /> : null}
      {imageUrl ? <span className="cover-preview-shade" /> : null}
      <span className="cover-accent" style={{ backgroundColor: style.accentColor }} />
      <div className="cover-title-block" style={titleBlockStyle}>
        <strong
          style={{
            fontSize: `${titleFontSize}px`,
            fontWeight: style.fontWeight === "bold" ? 700 : 400
          }}
        >
          {title}
        </strong>
        <small>{style.subtitle}</small>
        <i style={{ backgroundColor: style.accentColor }} />
      </div>
    </div>
  );
}

function ColorInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="color-control">
      {label}
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function subtitlePreviewStyle(style: SubtitleStyle): CSSProperties {
  return {
    color: style.textColor,
    backgroundColor: style.backgroundColor,
    fontFamily: style.fontFamily,
    fontSize: `${Math.max(12, Math.round(style.fontSize * 0.42))}px`,
    fontWeight: style.fontWeight === "bold" ? 700 : 400,
    top: `${style.verticalPercent}%`
  };
}

function frameTitlePreviewStyle(style: FrameTitleStyle): CSSProperties {
  return {
    color: style.textColor,
    backgroundColor: style.backgroundColor,
    fontFamily: style.fontFamily,
    fontSize: `${Math.max(14, Math.round(style.fontSize * 0.38))}px`,
    fontWeight: style.fontWeight === "bold" ? 700 : 400,
    top: `${style.verticalPercent}%`
  };
}

function createSubtitleSample(task: VideoTask): string {
  const line = (task.finalScript || task.sourceScript || "字幕预览")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean);
  if (!line) {
    return "字幕预览";
  }

  return line.length > 28 ? `${line.slice(0, 28)}...` : line;
}

function createFrameTitleText(task: VideoTask, coverStyle: CoverStyle): string {
  const explicitTitle = task.frameTitleStyle?.text.trim();
  if (explicitTitle) {
    return explicitTitle.length > 24 ? `${explicitTitle.slice(0, 24)}...` : explicitTitle;
  }

  const coverTitle = coverStyle.title.trim();
  if (coverTitle) {
    return coverTitle.length > 24 ? `${coverTitle.slice(0, 24)}...` : coverTitle;
  }

  const line =
    (task.finalScript || task.sourceScript || task.title)
      .split(/\r?\n/)
      .map((value) => value.trim())
      .find(Boolean) ?? task.title;

  return line.length > 24 ? `${line.slice(0, 24)}...` : line;
}

function createCoverTitle(task: VideoTask): string {
  const base =
    (task.finalScript || task.sourceScript || task.title)
      .split(/\r?\n/)
      .map((value) => value.trim())
      .find(Boolean) ?? task.title;
  return base.length > 22 ? `${base.slice(0, 22)}...` : base;
}

function presetLabel(presetId: OutputPresetId): string {
  return OUTPUT_PRESETS.find((preset) => preset.id === presetId)?.label ?? presetId;
}

function generationModeLabel(mode: VideoGenerationMode): string {
  const labels: Record<VideoGenerationMode, string> = {
    "preset-avatar": "预设数字人口播",
    "product-avatar": "商品/带货视频",
    "image-lipsync": "图片口型同步",
    "personal-ip": "个人IP视频",
    "viral-remix": "爆款视频复刻",
    "mixed-cut": "混剪视频",
    "video-dedup": "视频去重处理"
  };

  return labels[mode];
}

function modeNeedsEditableScript(mode: VideoGenerationMode): boolean {
  return mode !== "video-dedup";
}

function modeNeedsMotionPrompt(mode: VideoGenerationMode): boolean {
  return [
    "preset-avatar",
    "product-avatar",
    "image-lipsync",
    "personal-ip",
    "viral-remix"
  ].includes(mode);
}

function parseAvatarOptions(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(/[\s,，;；]+/)
        .map((avatarId) => avatarId.trim())
        .filter(Boolean)
    )
  );
}

function avatarLookMeta(look: HeyGenAvatarLook): string {
  const parts = [look.gender, look.orientation, look.avatarType, look.status].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : look.id;
}

function variantStatusLabel(status: VideoTask["outputVariants"][number]["status"]): string {
  const labels: Record<VideoTask["outputVariants"][number]["status"], string> = {
    waiting: "等待生成",
    rendering: "生成中",
    complete: "已生成",
    failed: "需要重试"
  };

  return labels[status];
}

function similarityRiskLabel(risk: VideoTask["similarityRisk"]): string {
  const labels: Record<VideoTask["similarityRisk"], string> = {
    unknown: "待生成",
    low: "低",
    medium: "中",
    high: "高"
  };

  return labels[risk];
}

function assetKindLabel(kind: MediaAsset["kind"]): string {
  if (kind === "visual-storyboard") {
    return "视觉故事板";
  }

  const labels: Partial<Record<MediaAsset["kind"], string>> = {
    "source-audio": "原音频",
    "source-video": "原视频",
    "source-transcript": "文案",
    "source-visual-analysis": "画面分析",
    "knowledge-document": "知识库",
    "viral-copy-reference": "爆款案例",
    "product-image": "商品图",
    "reference-image": "人物图",
    "mixed-cut-material": "混剪素材",
    "mixed-cut-video": "混剪基础视频",
    "dedup-source-video": "待去重视频",
    "dedup-processed-video": "去重处理视频",
    "dedup-report": "去重评分报告",
    "edit-decision-record": "剪辑记录",
    "custom-font": "字体",
    "generated-presenter-image": "人物商品图",
    "avatar-video": "数字人视频",
    "subtitle-file": "字幕",
    "background-music": "BGM",
    "cover-image": "封面",
    "finished-video": "成品视频",
    "publishing-package": "发布包"
  };

  return labels[kind] ?? kind;
}

function getTaskScopedMediaAssets(task: VideoTask): MediaAsset[] {
  return task.mediaAssets.filter((asset) => asset.taskId === task.id);
}

function hasAnalysisCenterResult(task: VideoTask): boolean {
  const assets = getTaskScopedMediaAssets(task);
  return (
    assets.some((asset) =>
      [
        "source-transcript",
        "source-visual-analysis",
        "story-script-options",
        "visual-storyboard"
      ].includes(asset.kind)
    ) ||
    Boolean(
      task.creativeWorkflow.referenceAnalysis.trim() ||
      task.creativeWorkflow.storyboard.trim() ||
      task.creativeWorkflow.mixedCutPlan.trim()
    )
  );
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function countKnowledgeContextSources(task: VideoTask): {
  builtIn: number;
  uploadedKnowledge: number;
  viralReferences: number;
  taskAssets: number;
} {
  const assets = getTaskScopedMediaAssets(task);
  const currentTaskAssetKinds = new Set<MediaAsset["kind"]>([
    "source-video",
    "source-audio",
    "source-transcript",
    "source-visual-analysis",
    "story-script-options",
    "visual-storyboard",
    "product-image",
    "reference-image",
    "mixed-cut-material",
    "mixed-cut-video",
    "dedup-source-video",
    "dedup-processed-video",
    "dedup-report",
    "edit-decision-record",
    "generated-presenter-image",
    "avatar-video",
    "subtitle-file"
  ]);
  const textSourceCount = [
    task.originalVideoUrl,
    task.sourceScript,
    task.finalScript,
    task.avatarDescriptionPrompt,
    task.motionPrompt,
    task.personalIpProfile.name ||
      task.personalIpProfile.persona ||
      task.personalIpProfile.tone ||
      task.personalIpProfile.catchphrases ||
      task.personalIpProfile.bannedWords,
    task.creativeWorkflow.referenceAnalysis ||
      task.creativeWorkflow.sellingPoints ||
      task.creativeWorkflow.storyboard ||
      task.creativeWorkflow.dailyPipeline ||
      task.creativeWorkflow.aiVideoPrompt ||
      task.creativeWorkflow.mixedCutPlan
  ].filter((value) => value?.trim()).length;

  return {
    builtIn: builtInKnowledgeCount(task.generationMode),
    uploadedKnowledge: assets.filter((asset) => asset.kind === "knowledge-document").length,
    viralReferences: assets.filter((asset) => asset.kind === "viral-copy-reference").length,
    taskAssets:
      assets.filter((asset) => currentTaskAssetKinds.has(asset.kind)).length + textSourceCount
  };
}

function builtInKnowledgeCount(mode: VideoGenerationMode): number {
  const counts: Record<VideoGenerationMode, number> = {
    "preset-avatar": 2,
    "product-avatar": 6,
    "image-lipsync": 5,
    "personal-ip": 3,
    "viral-remix": 4,
    "mixed-cut": 5,
    "video-dedup": 4
  };

  return counts[mode];
}

function clampUiNumber(value: string, min: number, max: number, fallback: number): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function getMixedCutBatchPlanForTask(task: VideoTask): MixedCutBatchPlan {
  return calculateMixedCutBatchPlan({
    materialCount: getTaskScopedMediaAssets(task).filter(
      (asset) => asset.kind === "mixed-cut-material" && isVisualMixedCutAsset(asset.relativePath)
    ).length,
    reuseRate: task.mixedCutReuseRate
  });
}

function mixedCutRecommendation(materialCount: number, plan: MixedCutBatchPlan): string {
  if (materialCount <= 0) {
    return "请先上传混剪素材";
  }

  if (materialCount < 3) {
    return "素材较少，建议先增加视频/图片";
  }

  return `按素材组合和 ${plan.reuseRate}% 重复率，预计可生成 ${plan.targetCount} 条`;
}

function mixedCutPlanDetail(plan: MixedCutBatchPlan): string {
  if (plan.materialCount <= 0) {
    return "选择素材文件夹后自动计算";
  }

  const combinationLabel =
    plan.combinationCount >= 10_000 ? "10000+" : String(plan.combinationCount);
  return `每条约 ${plan.materialsPerVideo} 个素材 · 组合 ${combinationLabel} · 重复率限制 ${plan.reuseLimitedCount} 条`;
}

function isVisualMixedCutAsset(relativePath: string): boolean {
  return /\.(mp4|mov|m4v|webm|mkv|avi|png|jpe?g|webp)$/i.test(relativePath);
}

function mixedCutChapterRows(
  visualMaterialCount: number,
  targetCount: number,
  chapterMode: VideoTask["mixedCutChapterMode"],
  reuseRate: number
): Array<{
  index: number;
  materialLabel: string;
  modeLabel: string;
  reuseRate: number;
}> {
  const rowCount = Math.min(8, Math.max(1, targetCount));
  const modeLabel = mixedCutChapterModeLabel(chapterMode);

  return Array.from({ length: rowCount }, (_value, index) => {
    const materialCount =
      visualMaterialCount > 0 ? Math.max(1, visualMaterialCount - (index % 3)) : 0;
    return {
      index: index + 1,
      materialLabel: materialCount > 0 ? `${materialCount} 个素材 · 导出时计算` : "未同步素材",
      modeLabel,
      reuseRate
    };
  });
}

function mixedCutChapterModeLabel(mode: VideoTask["mixedCutChapterMode"]): string {
  switch (mode) {
    case "fixed-material-count":
      return "固定素材数";
    case "minimum-duration":
      return "至少 X 秒";
    case "fill-with-bgm":
    default:
      return "为配音填充画面";
  }
}

function assetFileName(relativePath: string): string {
  return relativePath.split("/").filter(Boolean).pop() ?? relativePath;
}

function latestTaskAsset(task: VideoTask, kinds: MediaAsset["kind"][]): MediaAsset | undefined {
  const allowedKinds = new Set(kinds);
  return [...task.mediaAssets].reverse().find((asset) => allowedKinds.has(asset.kind));
}

function appPathSettingLabel(kind: AppPathSettingKind): string {
  switch (kind) {
    case "sourceDownloadDirectory":
      return "原视频下载目录";
    case "generatedImageDirectory":
      return "生成图片保存目录";
    case "generatedVideoDirectory":
      return "生成视频保存目录";
  }
}

function parseVisualStoryboardPanelCount(value: string): VisualStoryboardPanelCount {
  if (value === "6" || value === "8" || value === "9" || value === "12") {
    return Number(value) as VisualStoryboardPanelCount;
  }

  return "auto";
}

function buildFlowApiGuideItems(input: {
  configurations: ServiceConfiguration[];
  hasGeneratedPresenterImages: boolean;
  selectedAvatarName?: string;
  task: VideoTask;
}): FlowApiGuideItem[] {
  const { configurations, hasGeneratedPresenterImages, selectedAvatarName, task } = input;
  const needsImageGeneration =
    task.generationMode === "product-avatar" &&
    task.avatarMode === "image-presenter" &&
    !hasGeneratedPresenterImages;
  const hasSourceMedia = task.mediaAssets.some((asset) =>
    ["source-video", "source-audio", "source-transcript", "source-visual-analysis"].includes(
      asset.kind
    )
  );

  return [
    {
      title: "1. 提取文案/素材",
      providerId: "asr",
      providerLabel: "ASR 转写（OpenAI 兼容）",
      modelLabel: modelName(configurations, "asr"),
      detail: "原视频链接先作为入口；本地音/视频转文字、后续平台提取和字幕兜底会用 ASR。",
      active: Boolean(task.originalVideoUrl?.trim()) || hasSourceMedia
    },
    {
      title: "2. 分析并生成文案",
      providerId: "llm",
      providerLabel: "大模型（OpenAI 兼容）",
      modelLabel: modelName(configurations, "llm"),
      detail: "一键 AI 生成文案会先做拉片/原文案/商品/IP 分析，再生成可编辑脚本。",
      active: !task.finalScript.trim()
    },
    {
      title: "3. 生成商品人物图",
      providerId: "image",
      providerLabel: "图片生成（OpenAI 兼容）",
      modelLabel: modelName(configurations, "image"),
      detail: "商品/带货模式中，上传商品图后生成拿产品或换衣服的人物图。",
      active: needsImageGeneration
    },
    {
      title: "4. 故事板/生视频模型",
      providerId: "video",
      providerLabel: "生视频模型",
      modelLabel: modelName(configurations, "video"),
      detail:
        "爆款素材复刻、故事板生视频、图片生视频和去重的部分片段重构使用 Seedance、即梦、可灵等视频生成模型。",
      active:
        task.generationMode === "viral-remix" ||
        task.generationMode === "mixed-cut" ||
        task.generationMode === "video-dedup"
    },
    {
      title: "5. 生成口型视频",
      providerId: "heygen",
      providerLabel: "数字人模型（HeyGen）",
      modelLabel: heyGenRenderModelLabel(configurations, task, selectedAvatarName),
      detail: "每个输出比例都会向 HeyGen 生成原生比例视频，默认使用 HeyGen 内置语音。",
      active: true
    },
    {
      title: "6. 字幕兜底",
      providerId: "asr",
      providerLabel: "HeyGen 字幕优先；ASR 兜底",
      modelLabel: modelName(configurations, "asr"),
      detail: "优先使用 HeyGen 返回字幕；拿不到或下载失败时再用 ASR 生成 SRT。",
      active: true
    },
    {
      title: "7. 外部语音",
      providerId: "tts",
      providerLabel: "可选 TTS / 外部音频",
      modelLabel: modelName(configurations, "tts"),
      detail: "MVP 默认走 HeyGen 内置语音；高级外部音频模式后续接入。",
      active: false
    },
    {
      title: "8. 输出视频和封面",
      providerLabel: "本地导出",
      modelLabel: "不需要模型",
      detail: "使用已生成视频、字幕样式和封面样式，导出到你选择的保存目录。",
      active: true
    },
    {
      title: "9. 去重评分",
      providerLabel: "本地视频处理 + 内部风险评分",
      modelLabel: "默认不需要模型",
      detail:
        "视频去重处理会输出处理后 MP4 和内部原创度/重复风险报告，阈值默认 80+，不代表平台官方判定。",
      active: task.generationMode === "video-dedup"
    }
  ];
}

function modelName(configurations: ServiceConfiguration[], providerId: ProviderId): string {
  const configuration = providerConfiguration(configurations, providerId);

  if (providerId === "asr" && configuration?.settings.enabled === false) {
    const llmConfiguration = providerConfiguration(configurations, "llm");
    const llmModel =
      llmConfiguration?.settings.modelName || defaultServiceSettings("llm").modelName;
    return `复用大模型：${llmModel?.trim() || "未配置"}（需测试支持）`;
  }

  const model = configuration?.settings.modelName || defaultServiceSettings(providerId).modelName;

  if (providerId === "heygen") {
    return heyGenBaseSettingsLabel(configurations);
  }

  return model?.trim() || "不需要模型名";
}

function heyGenRenderModelLabel(
  configurations: ServiceConfiguration[],
  task: VideoTask,
  selectedAvatarName: string | undefined
): string {
  const configuration = providerConfiguration(configurations, "heygen");
  const voiceId = configuration?.settings.voiceId?.trim();
  const modeLabel =
    task.avatarMode === "image-presenter"
      ? "图片口型同步"
      : `Avatar: ${
          [selectedAvatarName, task.presetAvatarId || configuration?.settings.avatarId]
            .filter(Boolean)
            .join(" · ") || "未配置"
        }`;

  return `${modeLabel}；Voice: ${voiceId || "HeyGen 内置语音"}；${heyGenBaseSettingsLabel(configurations)}`;
}

function heyGenBaseSettingsLabel(configurations: ServiceConfiguration[]): string {
  const configuration = providerConfiguration(configurations, "heygen");
  const resolution =
    configuration?.settings.resolution || defaultServiceSettings("heygen").resolution;
  const authMode = configuration?.settings.authMode === "oauth-bearer" ? "会员 Bearer" : "API Key";
  const route = heyGenGenerationRouteLabel(configuration?.settings.generationRoute);
  return `${authMode}；${route}；分辨率 ${resolution ?? "720p"}`;
}

function heyGenGenerationRouteLabel(
  route: ServiceConfiguration["settings"]["generationRoute"]
): string {
  switch (route) {
    case "direct-video":
      return "Direct Video";
    case "video-agent":
      return "Video Agent";
    case "auto":
    default:
      return "自动路由";
  }
}

function credentialStatus(configurations: ServiceConfiguration[], providerId: ProviderId): string {
  if (providerId === "tts") {
    return "默认不需要";
  }

  const configuration = providerConfiguration(configurations, providerId);
  if (!configuration) {
    return "未读取配置";
  }

  if (providerId === "asr" && configuration.settings.enabled === false) {
    return "复用大模型配置";
  }

  if (configuration.settings.enabled === false) {
    return "已停用";
  }

  return configuration.credentialConfigured ? "已配置" : "未配置";
}

function providerConfiguration(
  configurations: ServiceConfiguration[],
  providerId: ProviderId
): ServiceConfiguration | undefined {
  return configurations.find((configuration) => configuration.providerId === providerId);
}

function providerLabel(configurations: ServiceConfiguration[], providerId: ProviderId): string {
  return providerConfiguration(configurations, providerId)?.label ?? providerId;
}

function providerSettingsHint(providerId: ProviderId): string {
  switch (providerId) {
    case "heygen":
      return "Base URL 填 https://api.heygen.com 即可；普通 API 账号选 API Key，会员/OAuth 通道选 Bearer Token。自动路由会在会员/Bearer 下优先走 Video Agent；保存或检查成功后会自动读取当前账号的预设数字人。";
    case "source-parser":
      return "用于下载原视频：Base URL 默认填 https://jiexi.hyjiexi.eu.org，API Key 放在本机安全存储。点击下载原视频时会创建解析任务、轮询完成并保存到当前任务素材。";
    case "asr":
      return "ASR 是可选兜底：关闭时会实际测试大模型是否支持 audio/transcriptions；不支持时请启用 ASR 并填写转写模型。";
    case "image":
      return "用于商品图生成人物拿产品图；模型名填写你的中转支持的图片模型。";
    case "video":
      return "用于故事板生视频、图片生视频等非数字人口播视频，例如 Seedance、即梦、可灵、Runway；可拉取 /models 并选择模型。";
    case "llm":
      return "用于分析原文案/拉片结果并生成可编辑脚本；模型名填写你的中转支持的聊天模型。";
    case "tts":
      return "MVP 默认走 HeyGen 内置语音；外部 TTS 后续接入。";
  }
}

function providerSidebarDescription(providerId: ProviderId): string {
  switch (providerId) {
    case "heygen":
      return "数字人口型同步";
    case "source-parser":
      return "抖音/TikTok/YouTube 下载";
    case "llm":
      return "文案分析与生成";
    case "image":
      return "人物商品图";
    case "video":
      return "Seedance/即梦/可灵";
    case "asr":
      return "转写与字幕兜底";
    case "tts":
      return "外部语音可选";
  }
}

function withApiTroubleshootingHint(message: string): string {
  const trimmed = message.trim() || "API 请求失败";
  return `${trimmed}。如果 API 不通，请打开设置，重新保存对应服务的 Base URL、模型名称和 API Key，并查看保存后的测试结果。`;
}

async function checkOutputServiceConfiguration(
  api: DigitalHumanStudioAPI,
  task: VideoTask
): Promise<string> {
  const providerIds: ProviderId[] =
    task.generationMode === "mixed-cut" || task.generationMode === "video-dedup" ? [] : ["heygen"];
  const configurations = await api.listServiceConfigurations();
  const heygenConfiguration = providerConfiguration(configurations, "heygen");

  if (
    providerIds.includes("heygen") &&
    task.avatarMode === "preset-avatar" &&
    !task.presetAvatarGroupId?.trim() &&
    !task.presetAvatarId?.trim() &&
    !heygenConfiguration?.settings.avatarId?.trim()
  ) {
    return "请先在预设数字人选择里刷新并选择一个 HeyGen 数字人。设置里的默认 Avatar ID 是可选项，不需要在配置 API 时填写。";
  }

  if (!task.finalScript.trim()) {
    providerIds.push("llm");
  }

  if (
    task.generationMode === "product-avatar" &&
    task.avatarMode === "image-presenter" &&
    !hasGeneratedPresenterImages(task)
  ) {
    providerIds.push("image");
  }

  const results = await Promise.all(
    providerIds.map((providerId) => api.testServiceConfiguration(providerId))
  );
  const failed = results.filter((result) => !result.ok);
  if (failed.length === 0) {
    return "";
  }

  return `生成前配置检查未通过：${failed.map((result) => result.message).join("；")}`;
}

function hasGeneratedPresenterImages(task: VideoTask): boolean {
  return task.selectedOutputPresets.every((presetId) => {
    const selectedAssetId = task.generatedPresenterImageSelections?.[presetId];
    if (selectedAssetId) {
      return task.mediaAssets.some(
        (asset) => asset.id === selectedAssetId && asset.kind === "generated-presenter-image"
      );
    }

    return task.mediaAssets.some(
      (asset) =>
        asset.kind === "generated-presenter-image" &&
        asset.relativePath.includes(`generated-presenter-${presetId}-`)
    );
  });
}

function formatTaskMeta(task: VideoTaskSummary): string {
  const presets = task.selectedOutputPresets
    .map((preset) => (preset === "portrait-9-16" ? "竖屏" : "横屏"))
    .join(" + ");

  return `${presets || "未选比例"} · ${generationModeLabel(task.generationMode)}`;
}

interface SettingsDraft extends ServiceConfigurationSettings {
  apiKey: string;
  enabled: boolean;
  resolution: NonNullable<ServiceConfigurationSettings["resolution"]>;
}

interface SettingsProviderStatus {
  label: string;
  tone: "ok" | "pending" | "neutral";
}

function createSettingsDraft(
  configurations: ServiceConfiguration[]
): Record<ProviderId, SettingsDraft> {
  return Object.fromEntries(
    configurations.map((configuration) => [
      configuration.providerId,
      {
        baseUrl: configuration.settings.baseUrl ?? "",
        modelName: configuration.settings.modelName ?? "",
        authMode: configuration.settings.authMode ?? "api-key",
        generationRoute: configuration.settings.generationRoute ?? "auto",
        asrMode: configuration.settings.asrMode ?? "audio-transcriptions",
        avatarId: configuration.settings.avatarId ?? "",
        voiceId: configuration.settings.voiceId ?? "",
        resolution: configuration.settings.resolution ?? "720p",
        enabled: configuration.settings.enabled ?? true,
        apiKey: ""
      }
    ])
  ) as Record<ProviderId, SettingsDraft>;
}

function updateDraft(
  current: Record<string, SettingsDraft>,
  providerId: ProviderId,
  patch: Partial<SettingsDraft>
): Record<string, SettingsDraft> {
  return {
    ...current,
    [providerId]: {
      ...(current[providerId] ?? createEmptySettingsDraft()),
      ...patch
    }
  };
}

function createEmptySettingsDraft(): SettingsDraft {
  return {
    baseUrl: "",
    modelName: "",
    authMode: "api-key",
    generationRoute: "auto",
    asrMode: "audio-transcriptions",
    avatarId: "",
    voiceId: "",
    resolution: "720p",
    enabled: true,
    apiKey: ""
  };
}

function canFetchServiceModels(providerId: ProviderId): boolean {
  if (providerId === "heygen" || providerId === "source-parser" || providerId === "tts") {
    return false;
  }

  return true;
}

function hasModelNameField(providerId: ProviderId): boolean {
  return !["heygen", "source-parser", "tts"].includes(providerId);
}

function needsServiceCredentialField(providerId: ProviderId): boolean {
  if (providerId === "tts") {
    return false;
  }

  return true;
}

function settingsProviderStatus(
  configuration: ServiceConfiguration,
  draft: SettingsDraft
): SettingsProviderStatus {
  if (configuration.providerId === "tts") {
    return { label: "可选", tone: "neutral" };
  }

  if (draft.enabled === false) {
    return { label: "已停用", tone: "neutral" };
  }

  return configuration.credentialConfigured
    ? { label: "已配置", tone: "ok" }
    : { label: "未配置", tone: "pending" };
}
