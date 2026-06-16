import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  Monitor,
  Play,
  Plus,
  RefreshCcw,
  Settings,
  Smartphone,
  Upload,
  WandSparkles
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CONTENT_LANGUAGES,
  OUTPUT_PRESETS,
  type GenerationStepId,
  type OutputPresetId,
  type VideoTask,
  type VideoTaskSummary
} from "../shared/domain";
import type {
  ProviderId,
  SaveServiceConfigurationInput,
  ServiceConfiguration,
  ServiceConfigurationSettings
} from "../shared/serviceConfig";
import { countCompleteSteps, isRetryable, type WorkbenchStep } from "../shared/workbench";

const now = new Date().toISOString();

const fallbackTask: VideoTask = {
  id: "preview-task",
  title: "护肤品口播样片",
  sourceScript: "如果你的内容一直有播放，却始终带不动成交，问题可能不在流量。",
  finalScript: "播放量不差却没有订单时，先别急着加预算。真正要改的，往往是前三秒给用户的购买理由。",
  similarityRisk: "low",
  scriptGenerationNotes: "本地预览 mock 脚本。",
  contentLanguage: "zh-CN",
  avatarMode: "preset-avatar",
  avatarDescriptionPrompt: "",
  motionPrompt: "",
  selectedOutputPresets: ["portrait-9-16"],
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
  const steps = selectedTask.steps;
  const completeCount = useMemo(() => countCompleteSteps(steps), [steps]);
  const primaryVariant = selectedTask.outputVariants[0];
  const visibleAssets = selectedTask.mediaAssets.slice(-6).reverse();
  const productImageAsset = selectedTask.mediaAssets.find(
    (asset) => asset.id === selectedTask.productImageAssetId
  );
  const generatedPresenterAsset = selectedTask.mediaAssets.find(
    (asset) => asset.id === selectedTask.generatedPresenterImageAssetId
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

  useEffect(() => {
    if (!window.digitalHumanStudio) {
      return;
    }

    window.digitalHumanStudio
      .getAppInfo()
      .then((info) => setAppVersion(`${info.name} ${info.version}`))
      .catch(() => setAppVersion("Digital Human Studio"));
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

  async function updateCurrentTask(
    patch: Partial<
      Pick<
        VideoTask,
        | "title"
        | "sourceScript"
        | "contentLanguage"
        | "avatarMode"
        | "avatarDescriptionPrompt"
        | "motionPrompt"
        | "selectedOutputPresets"
      >
    >
  ) {
    if (!window.digitalHumanStudio) {
      return;
    }

    const task = await window.digitalHumanStudio.updateTask({
      taskId: selectedTask.id,
      ...patch
    });
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

  async function generateMockScript() {
    const api = requireDesktopRuntime("生成脚本");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在生成脚本...");

    try {
      await api.updateTask({
        taskId: selectedTask.id,
        sourceScript: selectedTask.sourceScript,
        contentLanguage: selectedTask.contentLanguage,
        avatarMode: selectedTask.avatarMode,
        avatarDescriptionPrompt: selectedTask.avatarDescriptionPrompt,
        motionPrompt: selectedTask.motionPrompt,
        selectedOutputPresets: selectedTask.selectedOutputPresets
      });
      const task = await api.generateScript(selectedTask.id);
      setActionMessage("脚本已生成");
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "脚本生成失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function transcribeSource() {
    const api = requireDesktopRuntime("源素材转写");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在 mock 转写源素材...");

    try {
      const result = await api.transcribeSource(selectedTask.id);
      const task = await api.getTask(selectedTask.id);
      setActionMessage(result.notes);
      if (task) {
        await refreshTaskState(task.id, task);
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "源素材转写失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function runMockWorkflow() {
    const api = requireDesktopRuntime("运行 Mock 检查");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在运行 mock 占位检查...");

    try {
      await api.updateTask({
        taskId: selectedTask.id,
        sourceScript: selectedTask.sourceScript,
        contentLanguage: selectedTask.contentLanguage,
        avatarMode: selectedTask.avatarMode,
        avatarDescriptionPrompt: selectedTask.avatarDescriptionPrompt,
        motionPrompt: selectedTask.motionPrompt,
        selectedOutputPresets: selectedTask.selectedOutputPresets
      });
      const task = await api.runMockWorkflow(selectedTask.id);
      setActionMessage("Mock 检查已完成；这只会生成占位文件，不是可发布视频。");
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Mock 检查运行失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function runRealWorkflow() {
    const api = requireDesktopRuntime("完整生成视频");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在运行真实 API 全流程：脚本、人物图、HeyGen、导出...");

    try {
      await api.updateTask({
        taskId: selectedTask.id,
        sourceScript: selectedTask.sourceScript,
        contentLanguage: selectedTask.contentLanguage,
        avatarMode: selectedTask.avatarMode,
        avatarDescriptionPrompt: selectedTask.avatarDescriptionPrompt,
        motionPrompt: selectedTask.motionPrompt,
        selectedOutputPresets: selectedTask.selectedOutputPresets
      });
      const task = await api.runRealWorkflow(selectedTask.id);
      const failedStep = task.steps.find(
        (step) => step.status === "retry-ready" || step.status === "failed"
      );
      setActionMessage(
        failedStep
          ? failedStep.errorMessage || `${failedStep.label}未完成`
          : "真实 API 全流程已完成，最终视频已导出"
      );
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "完整生成视频失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function renderHeyGenAvatar() {
    const api = requireDesktopRuntime("生成 HeyGen 数字人");
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage("正在生成 HeyGen 数字人视频...");

    try {
      await api.updateTask({
        taskId: selectedTask.id,
        sourceScript: selectedTask.sourceScript,
        contentLanguage: selectedTask.contentLanguage,
        avatarMode: selectedTask.avatarMode,
        avatarDescriptionPrompt: selectedTask.avatarDescriptionPrompt,
        motionPrompt: selectedTask.motionPrompt,
        selectedOutputPresets: selectedTask.selectedOutputPresets
      });
      const task = await api.renderHeyGenAvatar(selectedTask.id);
      const avatarStep = task.steps.find((step) => step.id === "avatar");
      setActionMessage(
        avatarStep?.status === "complete"
          ? "HeyGen 数字人视频已生成"
          : avatarStep?.errorMessage || "HeyGen 数字人生成未完成"
      );
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "HeyGen 数字人生成失败");
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
        task.productImageAssetId ? "商品图片已导入" : "未选择商品图片，任务保持不变"
      );
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "商品图片导入失败");
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
        avatarMode: "image-presenter",
        avatarDescriptionPrompt: selectedTask.avatarDescriptionPrompt,
        motionPrompt: selectedTask.motionPrompt,
        selectedOutputPresets: selectedTask.selectedOutputPresets
      });
      const task = await api.generatePresenterImages(selectedTask.id);
      const avatarStep = task.steps.find((step) => step.id === "avatar");
      setActionMessage(
        avatarStep?.status === "retry-ready"
          ? avatarStep.errorMessage || "人物商品图生成失败"
          : "人物商品图已生成"
      );
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "人物商品图生成失败");
    } finally {
      setIsWorkflowRunning(false);
    }
  }

  async function retryWorkflowStep(stepId: GenerationStepId) {
    const api = requireDesktopRuntime(`重试${stepLabel(stepId)}`);
    if (!api) {
      return;
    }

    setIsWorkflowRunning(true);
    setActionMessage(`正在重试：${stepLabel(stepId)}...`);

    try {
      const task = await api.retryMockWorkflowStep({
        taskId: selectedTask.id,
        stepId
      });
      setActionMessage(`${stepLabel(stepId)}已重试`);
      await refreshTaskState(task.id, task);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "单步重试失败");
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
          <nav className="flow-tabs" aria-label="任务流程">
            {["源文案", "原创脚本", "数字人", "后期", "导出"].map((tab, index) => (
              <button className={index === 1 ? "selected" : ""} key={tab} type="button">
                {tab}
              </button>
            ))}
          </nav>

          <div className="script-grid">
            <section className="field-block">
              <div className="section-title">
                <Upload size={16} />
                <h2>源文案 / 转写</h2>
              </div>
              <textarea
                value={selectedTask.sourceScript}
                aria-label="源文案"
                onBlur={() => void updateCurrentTask({ sourceScript: selectedTask.sourceScript })}
                onChange={(event) =>
                  setSelectedTask((current) => ({
                    ...current,
                    sourceScript: event.target.value
                  }))
                }
              />
              <div className="button-row">
                <button
                  type="button"
                  disabled={isWorkflowRunning}
                  onClick={() => void transcribeSource()}
                >
                  <Upload size={16} />
                  Mock 转写
                </button>
                <button type="button" disabled>
                  <WandSparkles size={16} />
                  分析结构
                </button>
              </div>
            </section>

            <section className="field-block">
              <div className="section-title">
                <WandSparkles size={16} />
                <h2>原创脚本</h2>
              </div>
              <textarea
                value={selectedTask.finalScript || "等待生成原创脚本"}
                readOnly
                aria-label="原创脚本"
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

          <div className="settings-grid">
            <section className="compact-block avatar-settings-block">
              <h3>数字人</h3>
              <div className="avatar-settings-grid">
                <label>
                  模式
                  <select
                    value={selectedTask.avatarMode}
                    onChange={(event) =>
                      void updateCurrentTask({
                        avatarMode: event.target.value as VideoTask["avatarMode"]
                      })
                    }
                  >
                    <option value="preset-avatar">HeyGen 预设数字人</option>
                    <option value="image-presenter">AI 商品图数字人</option>
                  </select>
                </label>
                <label>
                  Avatar
                  <select defaultValue="business-host">
                    <option value="business-host">商务主持人</option>
                    <option value="creator">创作者口播</option>
                  </select>
                </label>
                <label>
                  Voice
                  <select defaultValue="heygen-default">
                    <option value="heygen-default">HeyGen 内置语音</option>
                    <option value="external">外部音频</option>
                  </select>
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
              </div>
              {selectedTask.avatarMode === "image-presenter" ? (
                <>
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
                  <div className="asset-chip-grid">
                    <div className="asset-chip">
                      <span>商品图</span>
                      <strong>{productImageAsset?.relativePath ?? "未上传"}</strong>
                    </div>
                    <div className="asset-chip">
                      <span>人物商品图</span>
                      <strong>{generatedPresenterAsset?.relativePath ?? "未生成"}</strong>
                    </div>
                  </div>
                  <div className="button-row">
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
                </>
              ) : null}
              <label className="motion-prompt-field">
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
            </section>

            <section className="compact-block publishing-settings-block">
              <h3>发布设置</h3>
              <div className="publishing-options">
                <div className="publish-option-group">
                  <span className="publish-option-title">输出预设</span>
                  <div className="option-row-list">
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
                  </div>
                </div>
                <div className="publish-option-group">
                  <span className="publish-option-title">后期资产</span>
                  <div className="option-row-list">
                    <label className="checkbox-row compact-checkbox">
                      <input type="checkbox" defaultChecked />
                      字幕
                    </label>
                    <label className="checkbox-row compact-checkbox">
                      <input type="checkbox" />
                      本地 BGM
                    </label>
                    <label className="checkbox-row compact-checkbox">
                      <input type="checkbox" defaultChecked />
                      封面
                    </label>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="primary-actions">
            {actionMessage ? <span className="action-message">{actionMessage}</span> : null}
            <button
              type="button"
              disabled={isWorkflowRunning}
              onClick={() => void generateMockScript()}
            >
              <WandSparkles size={17} />
              生成脚本
            </button>
            <button
              type="button"
              className="primary"
              disabled={isWorkflowRunning}
              onClick={() => void runRealWorkflow()}
            >
              <Play size={17} />
              完整生成视频
            </button>
            <button
              type="button"
              disabled={isWorkflowRunning}
              onClick={() => void renderHeyGenAvatar()}
            >
              <Play size={17} />
              生成 HeyGen 数字人
            </button>
            <button
              type="button"
              disabled={isWorkflowRunning}
              onClick={() => void runMockWorkflow()}
            >
              <Play size={17} />
              Mock 检查
            </button>
            <button type="button" onClick={() => void openTaskExports()}>
              <FolderOpen size={17} />
              打开导出
            </button>
          </div>
        </section>

        <aside className="preview-pane">
          <div className="preview-box">
            <div className="phone-frame">
              <div className="avatar-placeholder">
                <strong>
                  {primaryVariant ? presetLabel(primaryVariant.presetId) : "视频预览"}
                </strong>
                <span>
                  {primaryVariant ? variantStatusLabel(primaryVariant.status) : "等待生成"}
                </span>
              </div>
            </div>
          </div>

          <section className="status-block">
            <div className="pane-heading">
              <span>步骤状态</span>
              <small>
                {completeCount}/{steps.length}
              </small>
            </div>
            <div className="step-list">
              {steps.map((step) => (
                <div className="step-row" key={step.id}>
                  <span className={`status-light ${step.status}`} />
                  <span>{step.label}</span>
                  {isRetryable(step.status) ? (
                    <button
                      className="icon-button tiny"
                      title="重试"
                      disabled={isWorkflowRunning}
                      onClick={() => void retryWorkflowStep(step.id)}
                    >
                      <RefreshCcw size={14} />
                    </button>
                  ) : (
                    <small>{statusLabel(step.status)}</small>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="export-block">
            <div>
              <strong>发布资料包</strong>
              <span>{selectedTask.publishingPackage.title || "等待合成完成"}</span>
            </div>
            <AlertCircle size={18} />
          </section>

          <section className="artifact-block">
            <div className="pane-heading">
              <span>Mock 产物</span>
              <small>{selectedTask.mediaAssets.length}</small>
            </div>
            <div className="asset-list">
              {visibleAssets.length > 0 ? (
                visibleAssets.map((asset) => (
                  <div className="asset-row" key={asset.id}>
                    <strong>{assetKindLabel(asset.kind)}</strong>
                    <span>{asset.relativePath}</span>
                  </div>
                ))
              ) : (
                <p>运行 mock 流程后显示生成的占位文件。</p>
              )}
            </div>
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

function stepLabel(stepId: GenerationStepId): string {
  const labels: Record<GenerationStepId, string> = {
    source: "源文案",
    script: "原创脚本",
    avatar: "数字人",
    subtitles: "字幕",
    "post-production": "合成",
    export: "导出"
  };

  return labels[stepId];
}

function presetLabel(presetId: OutputPresetId): string {
  return OUTPUT_PRESETS.find((preset) => preset.id === presetId)?.label ?? presetId;
}

function variantStatusLabel(status: VideoTask["outputVariants"][number]["status"]): string {
  const labels: Record<VideoTask["outputVariants"][number]["status"], string> = {
    waiting: "等待后续步骤",
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

function assetKindLabel(kind: VideoTask["mediaAssets"][number]["kind"]): string {
  const labels: Record<VideoTask["mediaAssets"][number]["kind"], string> = {
    "source-audio": "源音频",
    "source-video": "源视频",
    "source-transcript": "源转写",
    "product-image": "商品图",
    "generated-presenter-image": "人物商品图",
    "avatar-video": "数字人视频",
    "subtitle-file": "字幕",
    "background-music": "BGM",
    "cover-image": "封面",
    "finished-video": "成片",
    "publishing-package": "发布包"
  };

  return labels[kind];
}

function formatTaskMeta(task: VideoTaskSummary): string {
  const presets = task.selectedOutputPresets
    .map((preset) => (preset === "portrait-9-16" ? "竖屏" : "横屏"))
    .join(" + ");

  return `${presets || "未选比例"} · ${task.activeStepLabel}`;
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
