import {
  CheckCircle2,
  FolderOpen,
  Monitor,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Smartphone,
  Upload,
  UserRound,
  WandSparkles
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  CONTENT_LANGUAGES,
  DEFAULT_COVER_STYLE,
  DEFAULT_PERSONAL_IP_PROFILE,
  DEFAULT_SUBTITLE_STYLE,
  OUTPUT_PRESETS,
  type CoverStyle,
  type OutputPresetId,
  type PersonalIpProfile,
  type SubtitleStyle,
  type VideoGenerationMode,
  type VideoTask,
  type VideoTaskSummary
} from "../shared/domain";
import type { HeyGenAvatarLook, UpdateTaskInput } from "../shared/ipc";
import type {
  ProviderId,
  SaveServiceConfigurationInput,
  ServiceConfiguration,
  ServiceConfigurationSettings
} from "../shared/serviceConfig";
import { countCompleteSteps, type WorkbenchStep } from "../shared/workbench";

const now = new Date().toISOString();

const fallbackTask: VideoTask = {
  id: "preview-task",
  title: "护肤品口播样片",
  originalVideoUrl: "",
  sourceScript: "如果你的内容一直有播放，却始终带不动成交，问题可能不在流量。",
  finalScript: "播放量不差却没有订单时，先别急着加预算。真正要改的，往往是前三秒给用户的购买理由。",
  similarityRisk: "low",
  scriptGenerationNotes: "本地预览脚本。",
  contentLanguage: "zh-CN",
  generationMode: "preset-avatar",
  avatarMode: "preset-avatar",
  presetAvatarId: "",
  avatarDescriptionPrompt: "",
  motionPrompt: "",
  customFontFamily: "",
  selectedOutputPresets: ["portrait-9-16"],
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
  coverStyle: DEFAULT_COVER_STYLE,
  personalIpProfile: DEFAULT_PERSONAL_IP_PROFILE,
  publishingPackage: {
    title: "",
    description: "",
    tags: [],
    notes: ""
  },
  steps: [
    { id: "source", label: "源文案", status: "complete", updatedAt: now },
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
    | "sourceScript"
    | "finalScript"
    | "contentLanguage"
    | "generationMode"
    | "avatarMode"
    | "presetAvatarId"
    | "avatarDescriptionPrompt"
    | "motionPrompt"
    | "selectedOutputPresets"
    | "subtitleStyle"
    | "coverStyle"
    | "customFontFamily"
    | "personalIpProfile"
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
    label: "商品带货数字人",
    description: "商品图 + 人物商品图"
  },
  {
    id: "image-lipsync",
    label: "图片口型同步",
    description: "人物图 + 对口型"
  },
  {
    id: "personal-ip",
    label: "个人IP视频",
    description: "固定人设和语气"
  },
  {
    id: "viral-remix",
    label: "爆款视频复刻",
    description: "复刻结构，原创表达"
  },
  {
    id: "mixed-cut",
    label: "混剪视频",
    description: "后续加入素材混剪",
    disabled: true
  }
];

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appVersion, setAppVersion] = useState("Digital Human Studio 本地预览");
  const [taskSummaries, setTaskSummaries] = useState<VideoTaskSummary[]>(fallbackTasks);
  const [selectedTaskId, setSelectedTaskId] = useState(fallbackTask.id);
  const [selectedTask, setSelectedTask] = useState<VideoTask>(fallbackTask);
  const [taskError, setTaskError] = useState("");
  const [serviceConfigurations, setServiceConfigurations] = useState<ServiceConfiguration[]>([]);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, SettingsDraft>>({});
  const [settingsMessage, setSettingsMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [isWorkflowRunning, setIsWorkflowRunning] = useState(false);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [avatarLooks, setAvatarLooks] = useState<HeyGenAvatarLook[]>([]);
  const [avatarLookMessage, setAvatarLookMessage] = useState("");
  const [isAvatarLookLoading, setIsAvatarLookLoading] = useState(false);

  const steps = selectedTask.steps;
  const completeCount = useMemo(() => countCompleteSteps(steps), [steps]);
  const subtitleStyle = selectedTask.subtitleStyle ?? DEFAULT_SUBTITLE_STYLE;
  const coverStyle = selectedTask.coverStyle ?? DEFAULT_COVER_STYLE;
  const sourceScriptLabel =
    selectedTask.generationMode === "viral-remix" ? "爆款参考文案" : "参考文案";
  const primaryVariant =
    selectedTask.outputVariants.find((variant) =>
      selectedTask.selectedOutputPresets.includes(variant.presetId)
    ) ?? selectedTask.outputVariants[0];
  const productImageAsset = selectedTask.mediaAssets.find(
    (asset) => asset.id === selectedTask.productImageAssetId
  );
  const customFontAsset =
    selectedTask.mediaAssets.find((asset) => asset.id === selectedTask.customFontAssetId) ??
    selectedTask.mediaAssets.find((asset) => asset.kind === "custom-font");
  const referenceImageAsset =
    selectedTask.mediaAssets.find((asset) => asset.id === selectedTask.referenceImageAssetId) ??
    selectedTask.mediaAssets.find((asset) => asset.kind === "reference-image");
  const generatedPresenterAsset =
    selectedTask.mediaAssets.find(
      (asset) =>
        asset.kind === "generated-presenter-image" &&
        primaryVariant &&
        asset.relativePath.includes(primaryVariant.presetId)
    ) ??
    selectedTask.mediaAssets.find(
      (asset) => asset.id === selectedTask.generatedPresenterImageAssetId
    );
  const previewRelativePaths = useMemo(
    () =>
      Array.from(
        new Set(
          [
            productImageAsset?.relativePath,
            customFontAsset?.relativePath,
            referenceImageAsset?.relativePath,
            generatedPresenterAsset?.relativePath,
            ...selectedTask.outputVariants.flatMap((variant) => [
              variant.finishedVideoPath,
              variant.coverImagePath
            ])
          ].filter((path): path is string => Boolean(path))
        )
      ),
    [
      generatedPresenterAsset?.relativePath,
      customFontAsset?.relativePath,
      productImageAsset?.relativePath,
      referenceImageAsset?.relativePath,
      selectedTask
    ]
  );
  const previewPathSignature = previewRelativePaths.join("|");
  const finishedVideoUrl = primaryVariant?.finishedVideoPath
    ? assetUrls[primaryVariant.finishedVideoPath]
    : "";
  const coverAssetUrl = primaryVariant?.coverImagePath
    ? assetUrls[primaryVariant.coverImagePath]
    : "";
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
  const selectedAvatarLook = avatarLooks.find((look) => look.id === selectedTask.presetAvatarId);

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

  useEffect(() => {
    if (!window.digitalHumanStudio) {
      return;
    }

    window.digitalHumanStudio
      .getAppInfo()
      .then((info) => setAppVersion(`${info.name} ${info.version}`))
      .catch(() => setAppVersion("Digital Human Studio"));
    void loadServiceConfigurations();
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

  async function createTask() {
    const api = requireDesktopRuntime("新建任务");
    if (!api) {
      return;
    }

    const task = await api.createTask({
      title: "新建视频任务"
    });
    const summaries = await api.listTasks();
    setTaskSummaries(summaries);
    setSelectedTaskId(task.id);
    setSelectedTask(task);
  }

  async function runRealWorkflow() {
    const api = requireDesktopRuntime("一键生成视频");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在一键生成视频：脚本、数字人、字幕、封面和导出...");

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
        avatarDescriptionPrompt: selectedTask.avatarDescriptionPrompt,
        motionPrompt: selectedTask.motionPrompt,
        selectedOutputPresets: selectedTask.selectedOutputPresets,
        subtitleStyle,
        coverStyle,
        personalIpProfile: selectedTask.personalIpProfile
      });
      const task = await api.runRealWorkflow(selectedTask.id);
      const failedStep = task.steps.find(
        (step) => step.status === "retry-ready" || step.status === "failed"
      );
      setActionMessage(
        failedStep
          ? failedStep.errorMessage || `${failedStep.label}未完成`
          : "视频已生成，成片和封面可在右侧预览"
      );
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "一键生成视频失败");
    } finally {
      setIsWorkflowRunning(false);
    }
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
        avatarDescriptionPrompt: selectedTask.avatarDescriptionPrompt,
        motionPrompt: selectedTask.motionPrompt,
        selectedOutputPresets: selectedTask.selectedOutputPresets,
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

  async function generatePresenterImages() {
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
        subtitleStyle,
        coverStyle
      });
      const task = await api.generatePresenterImages(selectedTask.id);
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

  async function toggleOutputPreset(presetId: OutputPresetId, checked: boolean) {
    const nextPresets = checked
      ? Array.from(new Set([...selectedTask.selectedOutputPresets, presetId]))
      : selectedTask.selectedOutputPresets.filter((candidate) => candidate !== presetId);

    await updateCurrentTask({
      selectedOutputPresets: nextPresets.length > 0 ? nextPresets : ["portrait-9-16"]
    });
  }

  async function changeGenerationMode(mode: VideoGenerationMode) {
    if (mode === "mixed-cut") {
      setActionMessage("混剪视频会在后续版本加入。");
      return;
    }

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
      presetAvatarId: look.id
    }));
    await updateCurrentTask({ presetAvatarId: look.id });
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
    await loadServiceConfigurations();
  }

  async function loadServiceConfigurations() {
    if (!window.digitalHumanStudio) {
      setServiceConfigurations([]);
      setSettingsMessage("当前窗口没有连接到桌面本机服务，服务配置请在桌面版窗口中操作。");
      return;
    }

    const configurations = await window.digitalHumanStudio.listServiceConfigurations();
    setServiceConfigurations(configurations);
    setSettingsDraft(createSettingsDraft(configurations));
  }

  async function saveServiceConfiguration(providerId: ProviderId) {
    const draft = settingsDraft[providerId];
    if (!window.digitalHumanStudio || !draft) {
      return;
    }

    const input: SaveServiceConfigurationInput = {
      providerId,
      settings: {
        baseUrl: draft.baseUrl,
        modelName: draft.modelName,
        avatarId: draft.avatarId,
        voiceId: draft.voiceId,
        resolution: draft.resolution,
        enabled: draft.enabled
      },
      apiKey: draft.apiKey || undefined
    };
    await window.digitalHumanStudio.saveServiceConfiguration(input);
    setSettingsMessage("配置已保存到本机");
    await loadServiceConfigurations();
  }

  async function clearServiceCredential(providerId: ProviderId) {
    if (!window.digitalHumanStudio) {
      return;
    }

    await window.digitalHumanStudio.clearServiceCredential(providerId);
    setSettingsMessage("凭据已清除");
    await loadServiceConfigurations();
  }

  async function testServiceConfiguration(providerId: ProviderId) {
    if (!window.digitalHumanStudio) {
      setSettingsMessage("本地预览模式无法检查服务配置");
      return;
    }

    const result = await window.digitalHumanStudio.testServiceConfiguration(providerId);
    setSettingsMessage(result.message);
  }

  return (
    <div className="app-shell">
      {customFontUrl ? (
        <style>{`@font-face { font-family: "DHS Custom Font"; src: url("${customFontUrl}"); font-display: swap; }`}</style>
      ) : null}
      <header className="topbar">
        <div>
          <h1>数字人口播工作台</h1>
          <p>{appVersion || "Digital Human Studio"}</p>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" title="设置" onClick={() => void openSettingsModal()}>
            <Settings size={18} />
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="task-pane">
          <div className="pane-heading">
            <span>任务列表</span>
            <button
              className="icon-button small"
              title="新建任务"
              onClick={() => void createTask()}
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="task-list">
            {taskSummaries.map((task) => (
              <button
                key={task.id}
                className={`task-row ${task.id === selectedTaskId ? "active" : ""}`}
                type="button"
                onClick={() => void selectTask(task.id)}
              >
                <span className={`task-dot ${task.status}`} />
                <span>
                  <strong>{task.title}</strong>
                  <small>{formatTaskMeta(task)}</small>
                </span>
              </button>
            ))}
          </div>
          {taskError ? <p className="task-error">{taskError}</p> : null}
        </aside>

        <section className="editor-pane">
          <nav className="mode-tabs" aria-label="视频生成类别">
            {GENERATION_MODE_TABS.map((mode) => (
              <button
                className={selectedTask.generationMode === mode.id ? "active" : ""}
                disabled={Boolean(mode.disabled)}
                key={mode.id}
                type="button"
                onClick={() => void changeGenerationMode(mode.id)}
                title={mode.description}
              >
                <strong>{mode.label}</strong>
                <span>{mode.description}</span>
              </button>
            ))}
          </nav>

          <div className="script-grid">
            <section className="field-block">
              <div className="section-title">
                <Upload size={16} />
                <h2>{sourceScriptLabel}</h2>
              </div>
              <p className="field-hint">可粘贴原视频文案，后续会接入从链接一键提取和爆款分析。</p>
              <textarea
                value={selectedTask.sourceScript}
                aria-label={sourceScriptLabel}
                onBlur={() => void updateCurrentTask({ sourceScript: selectedTask.sourceScript })}
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
              <textarea
                value={selectedTask.finalScript}
                placeholder="点击一键AI生成文案，或直接手动输入最终口播文案"
                aria-label="AI生成文案"
                onBlur={() => void updateCurrentTask({ finalScript: selectedTask.finalScript })}
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

          <section className="compact-block generation-settings-block">
            <h3>{generationModeLabel(selectedTask.generationMode)}资料</h3>
            <div className="control-grid">
              <label>
                原视频链接
                <input
                  type="url"
                  value={selectedTask.originalVideoUrl ?? ""}
                  placeholder="粘贴 TikTok / 抖音 / Reels / Shorts 链接"
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
              </label>
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

            <div className="prompt-grid">
              {selectedTask.generationMode === "preset-avatar" ? (
                <div className="avatar-picker-block">
                  <div className="avatar-picker-header">
                    <span>预设数字人选择</span>
                    <button
                      type="button"
                      disabled={isAvatarLookLoading}
                      onClick={() => void refreshHeyGenAvatarLooks()}
                    >
                      <RefreshCw size={15} />
                      {isAvatarLookLoading ? "读取中" : "刷新"}
                    </button>
                  </div>
                  {selectedAvatarLook ? (
                    <p className="selected-avatar-summary">
                      当前：{selectedAvatarLook.name} · {selectedAvatarLook.id}
                    </p>
                  ) : null}
                  {avatarLooks.length > 0 ? (
                    <div className="avatar-look-grid" aria-label="HeyGen 预设数字人">
                      {avatarLooks.map((look) => (
                        <button
                          className={
                            selectedTask.presetAvatarId === look.id
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
                      点击刷新读取当前 HeyGen 账号可用数字人；读取失败时仍可手动输入 Avatar ID。
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
                          presetAvatarId: selectedTask.presetAvatarId ?? ""
                        })
                      }
                      onChange={(event) =>
                        setSelectedTask((current) => ({
                          ...current,
                          presetAvatarId: event.target.value
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
              {selectedTask.generationMode === "product-avatar" ? (
                <label>
                  数字人描述提示词
                  <textarea
                    className="compact-textarea"
                    value={selectedTask.avatarDescriptionPrompt}
                    aria-label="数字人描述提示词"
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
              <label>
                动作提示词
                <textarea
                  className="compact-textarea"
                  value={selectedTask.motionPrompt}
                  aria-label="动作提示词"
                  onBlur={() => void updateCurrentTask({ motionPrompt: selectedTask.motionPrompt })}
                  onChange={(event) =>
                    setSelectedTask((current) => ({
                      ...current,
                      motionPrompt: event.target.value
                    }))
                  }
                />
              </label>
            </div>

            {selectedTask.generationMode === "product-avatar" ? (
              <div className="image-action-row">
                <AssetPreview title="商品图" url={productImageUrl} emptyLabel="未上传" />
                <AssetPreview title="人物商品图" url={generatedPresenterUrl} emptyLabel="未生成" />
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
                </div>
              </div>
            ) : null}
            {selectedTask.generationMode === "image-lipsync" ? (
              <div className="image-action-row single">
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
          </section>

          <div className="primary-actions">
            {actionMessage ? <span className="action-message">{actionMessage}</span> : null}
            <button
              type="button"
              className="primary"
              disabled={isWorkflowRunning}
              onClick={() => void runRealWorkflow()}
            >
              <Play size={18} />
              一键生成视频
            </button>
          </div>
        </section>

        <aside className="preview-pane">
          <section className="preview-card">
            <div className="pane-heading">
              <span>成片预览</span>
              <button type="button" onClick={() => void openTaskExports()}>
                <FolderOpen size={16} />
                打开导出
              </button>
            </div>
            <PrimaryPreview
              presetId={previewPresetId}
              videoUrl={finishedVideoUrl}
              imageUrl={generatedPresenterUrl || referenceImageUrl || productImageUrl}
              subtitleStyle={subtitleStyle}
              subtitleText={createSubtitleSample(selectedTask)}
              variantStatus={primaryVariant?.status}
            />
            <PreviewStyleControls
              coverStyle={coverStyle}
              customFontEnabled={Boolean(customFontUrl)}
              disabled={isWorkflowRunning}
              onCoverStyleChange={(patch) => void updateCoverStyle(patch)}
              onSubtitleStyleChange={(patch) => void updateSubtitleStyle(patch)}
              onUploadCustomFont={() => void uploadCustomFont()}
              subtitleStyle={subtitleStyle}
            />
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

          <div className="preview-asset-grid">
            <AssetPreview title="商品图" url={productImageUrl} emptyLabel="未上传" />
            <AssetPreview title="人物图" url={referenceImageUrl} emptyLabel="未上传" />
            <AssetPreview title="人物商品图" url={generatedPresenterUrl} emptyLabel="未生成" />
          </div>

          <section className="preview-card">
            <div className="pane-heading">
              <span>封面预览</span>
              <small>{coverAssetUrl ? "已生成" : "编辑中"}</small>
            </div>
            <CoverPreview
              style={coverStyle}
              title={coverStyle.title || createCoverTitle(selectedTask)}
              presetId={previewPresetId}
            />
          </section>
        </aside>
      </main>

      {settingsOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}>
          <section
            className="settings-modal"
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
            <div className="provider-list">
              {serviceConfigurations.map((configuration) => {
                const draft = settingsDraft[configuration.providerId] ?? {
                  baseUrl: "",
                  modelName: "",
                  avatarId: "",
                  voiceId: "",
                  resolution: "720p",
                  apiKey: "",
                  enabled: true
                };

                return (
                  <section className="provider-card" key={configuration.providerId}>
                    <div className="provider-heading">
                      <strong>{configuration.label}</strong>
                      <span>
                        {configuration.credentialConfigured ? "已配置凭据" : "未配置凭据"}
                      </span>
                    </div>
                    <label>
                      Base URL
                      <input
                        type="text"
                        value={draft.baseUrl}
                        placeholder="服务地址"
                        onChange={(event) =>
                          setSettingsDraft((current) =>
                            updateDraft(current, configuration.providerId, {
                              baseUrl: event.target.value
                            })
                          )
                        }
                      />
                    </label>
                    {configuration.providerId !== "heygen" ? (
                      <label>
                        模型名
                        <input
                          type="text"
                          value={draft.modelName}
                          placeholder="可选"
                          onChange={(event) =>
                            setSettingsDraft((current) =>
                              updateDraft(current, configuration.providerId, {
                                modelName: event.target.value
                              })
                            )
                          }
                        />
                      </label>
                    ) : null}
                    {configuration.providerId === "heygen" ? (
                      <>
                        <label>
                          Avatar ID
                          <input
                            type="text"
                            value={draft.avatarId ?? ""}
                            placeholder="当前 HeyGen 账号可用的 Avatar ID"
                            onChange={(event) =>
                              setSettingsDraft((current) =>
                                updateDraft(current, configuration.providerId, {
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
                            value={draft.voiceId ?? ""}
                            placeholder="当前 HeyGen 账号可用的 Voice ID，可留空"
                            onChange={(event) =>
                              setSettingsDraft((current) =>
                                updateDraft(current, configuration.providerId, {
                                  voiceId: event.target.value
                                })
                              )
                            }
                          />
                        </label>
                        <label>
                          分辨率
                          <select
                            value={draft.resolution ?? "720p"}
                            onChange={(event) =>
                              setSettingsDraft((current) =>
                                updateDraft(current, configuration.providerId, {
                                  resolution: event.target.value as SettingsDraft["resolution"]
                                })
                              )
                            }
                          >
                            <option value="720p">720p</option>
                            <option value="1080p">1080p</option>
                          </select>
                        </label>
                      </>
                    ) : null}
                    <label>
                      API Key（填新值会替换）
                      <input
                        type="password"
                        value={draft.apiKey}
                        placeholder={
                          configuration.credentialConfigured
                            ? "已保存；输入新 Key 后保存会替换"
                            : "输入后保存"
                        }
                        onChange={(event) =>
                          setSettingsDraft((current) =>
                            updateDraft(current, configuration.providerId, {
                              apiKey: event.target.value
                            })
                          )
                        }
                      />
                    </label>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={draft.enabled}
                        onChange={(event) =>
                          setSettingsDraft((current) =>
                            updateDraft(current, configuration.providerId, {
                              enabled: event.target.checked
                            })
                          )
                        }
                      />
                      启用
                    </label>
                    <div className="provider-actions">
                      <button
                        type="button"
                        onClick={() => void saveServiceConfiguration(configuration.providerId)}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => void testServiceConfiguration(configuration.providerId)}
                      >
                        检查
                      </button>
                      <button
                        type="button"
                        onClick={() => void clearServiceCredential(configuration.providerId)}
                      >
                        清除凭据
                      </button>
                    </div>
                  </section>
                );
              })}
            </div>
            {settingsMessage ? <p className="settings-message">{settingsMessage}</p> : null}
          </section>
        </div>
      ) : null}
    </div>
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

function PrimaryPreview({
  presetId,
  videoUrl,
  imageUrl,
  subtitleStyle,
  subtitleText,
  variantStatus
}: {
  presetId: OutputPresetId | undefined;
  videoUrl: string;
  imageUrl: string;
  subtitleStyle: SubtitleStyle;
  subtitleText: string;
  variantStatus?: VideoTask["outputVariants"][number]["status"];
}) {
  const frameClassName = `media-stage ${presetId === "landscape-16-9" ? "landscape" : "portrait"}`;

  return (
    <div className={frameClassName}>
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
    </div>
  );
}

function PreviewStyleControls({
  coverStyle,
  customFontEnabled,
  disabled,
  onCoverStyleChange,
  onSubtitleStyleChange,
  onUploadCustomFont,
  subtitleStyle
}: {
  coverStyle: CoverStyle;
  customFontEnabled: boolean;
  disabled: boolean;
  onCoverStyleChange: (patch: Partial<CoverStyle>) => void;
  onSubtitleStyleChange: (patch: Partial<SubtitleStyle>) => void;
  onUploadCustomFont: () => void;
  subtitleStyle: SubtitleStyle;
}) {
  return (
    <div className="preview-style-panel">
      <div className="preview-style-header">
        <strong>字幕和封面样式</strong>
        <button type="button" disabled={disabled} onClick={onUploadCustomFont}>
          <Upload size={14} />
          上传字体
        </button>
      </div>

      <section className="style-control-panel">
        <h3>字幕</h3>
        <div className="preview-control-grid">
          <label className="range-control">
            位置 {subtitleStyle.verticalPercent}%
            <span className="range-row">
              <input
                type="range"
                min={5}
                max={92}
                value={subtitleStyle.verticalPercent}
                onInput={(event) =>
                  onSubtitleStyleChange({
                    verticalPercent: Number((event.target as HTMLInputElement).value)
                  })
                }
                onChange={(event) =>
                  onSubtitleStyleChange({ verticalPercent: Number(event.target.value) })
                }
              />
              <input
                type="number"
                min={5}
                max={92}
                value={subtitleStyle.verticalPercent}
                onChange={(event) =>
                  onSubtitleStyleChange({ verticalPercent: Number(event.target.value) })
                }
              />
            </span>
          </label>
          <label>
            字号
            <input
              type="number"
              min={20}
              max={72}
              value={subtitleStyle.fontSize}
              onChange={(event) => onSubtitleStyleChange({ fontSize: Number(event.target.value) })}
            />
          </label>
          <FontSelect
            customFontEnabled={customFontEnabled}
            label="字体"
            value={subtitleStyle.fontFamily}
            onChange={(fontFamily) => onSubtitleStyleChange({ fontFamily })}
          />
          <label>
            字重
            <select
              value={subtitleStyle.fontWeight}
              onChange={(event) =>
                onSubtitleStyleChange({
                  fontWeight: event.target.value as SubtitleStyle["fontWeight"]
                })
              }
            >
              <option value="bold">粗体</option>
              <option value="regular">常规</option>
            </select>
          </label>
          <ColorInput
            label="文字"
            value={subtitleStyle.textColor}
            onChange={(value) => onSubtitleStyleChange({ textColor: value })}
          />
          <ColorInput
            label="底色"
            value={subtitleStyle.backgroundColor}
            onChange={(value) => onSubtitleStyleChange({ backgroundColor: value })}
          />
        </div>
      </section>

      <section className="style-control-panel">
        <h3>封面</h3>
        <div className="preview-control-grid">
          <label className="wide-control">
            标题
            <input
              type="text"
              value={coverStyle.title}
              onChange={(event) => onCoverStyleChange({ title: event.target.value })}
            />
          </label>
          <label className="wide-control">
            副标题
            <input
              type="text"
              value={coverStyle.subtitle}
              onChange={(event) => onCoverStyleChange({ subtitle: event.target.value })}
            />
          </label>
          <FontSelect
            customFontEnabled={customFontEnabled}
            label="字体"
            value={coverStyle.fontFamily}
            onChange={(fontFamily) => onCoverStyleChange({ fontFamily })}
          />
          <label>
            字号
            <input
              type="number"
              min={32}
              max={96}
              value={coverStyle.fontSize}
              onChange={(event) => onCoverStyleChange({ fontSize: Number(event.target.value) })}
            />
          </label>
          <label>
            字重
            <select
              value={coverStyle.fontWeight}
              onChange={(event) =>
                onCoverStyleChange({
                  fontWeight: event.target.value as CoverStyle["fontWeight"]
                })
              }
            >
              <option value="bold">粗体</option>
              <option value="regular">常规</option>
            </select>
          </label>
          <ColorInput
            label="文字"
            value={coverStyle.textColor}
            onChange={(value) => onCoverStyleChange({ textColor: value })}
          />
          <ColorInput
            label="背景"
            value={coverStyle.backgroundColor}
            onChange={(value) => onCoverStyleChange({ backgroundColor: value })}
          />
          <ColorInput
            label="强调"
            value={coverStyle.accentColor}
            onChange={(value) => onCoverStyleChange({ accentColor: value })}
          />
        </div>
      </section>
    </div>
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
  style,
  title,
  presetId
}: {
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

  return (
    <div className={`cover-preview ${isLandscape ? "landscape" : "portrait"}`} style={previewStyle}>
      <span className="cover-accent" style={{ backgroundColor: style.accentColor }} />
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

function createCoverTitle(task: VideoTask): string {
  const base =
    (task.finalScript || task.sourceScript || task.title)
      .split(/\r?\n/)
      .map((value) => value.trim())
      .find(Boolean) ?? task.title;
  return base.length > 22 ? `${base.slice(0, 22)}...` : base;
}

function statusLabel(status: WorkbenchStep["status"]): string {
  const labels: Record<WorkbenchStep["status"], string> = {
    waiting: "等待",
    running: "运行中",
    complete: "完成",
    failed: "失败",
    "retry-ready": "可重试"
  };

  return labels[status];
}

function presetLabel(presetId: OutputPresetId): string {
  return OUTPUT_PRESETS.find((preset) => preset.id === presetId)?.label ?? presetId;
}

function generationModeLabel(mode: VideoGenerationMode): string {
  const labels: Record<VideoGenerationMode, string> = {
    "preset-avatar": "预设数字人口播",
    "product-avatar": "商品带货数字人",
    "image-lipsync": "图片口型同步",
    "personal-ip": "个人IP视频",
    "viral-remix": "爆款视频复刻",
    "mixed-cut": "混剪视频"
  };

  return labels[mode];
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
  const parts = [look.gender, look.status].filter(Boolean);
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

function formatTaskMeta(task: VideoTaskSummary): string {
  const presets = task.selectedOutputPresets
    .map((preset) => (preset === "portrait-9-16" ? "竖屏" : "横屏"))
    .join(" + ");

  return `${presets || "未选比例"} · ${statusLabel(task.status)}`;
}

interface SettingsDraft extends ServiceConfigurationSettings {
  apiKey: string;
  enabled: boolean;
  resolution: NonNullable<ServiceConfigurationSettings["resolution"]>;
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
      ...(current[providerId] ?? {
        baseUrl: "",
        modelName: "",
        avatarId: "",
        voiceId: "",
        resolution: "720p",
        enabled: true,
        apiKey: ""
      }),
      ...patch
    }
  };
}
