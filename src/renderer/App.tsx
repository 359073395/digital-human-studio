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
import { countCompleteSteps, isRetryable, type WorkbenchStep } from "../shared/workbench";

type TaskTone = "当前" | "历史" | "失败";

interface TaskListItem {
  id: string;
  name: string;
  meta: string;
  tone: TaskTone;
}

const tasks: TaskListItem[] = [
  { id: "task-001", name: "护肤品口播样片", meta: "竖屏 + 横屏", tone: "当前" },
  { id: "task-002", name: "课程引流脚本", meta: "竖屏", tone: "历史" },
  { id: "task-003", name: "电商直播预热", meta: "数字人失败", tone: "失败" }
];

const steps: WorkbenchStep[] = [
  { id: "source", label: "源文案", status: "complete" },
  { id: "script", label: "原创脚本", status: "complete" },
  { id: "avatar", label: "数字人", status: "running" },
  { id: "subtitle", label: "字幕", status: "waiting" },
  { id: "render", label: "合成", status: "waiting" },
  { id: "export", label: "导出", status: "waiting" }
];

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appVersion, setAppVersion] = useState("Digital Human Studio 本地预览");
  const completeCount = useMemo(() => countCompleteSteps(steps), []);

  useEffect(() => {
    if (!window.digitalHumanStudio) {
      return;
    }

    window.digitalHumanStudio
      .getAppInfo()
      .then((info) => setAppVersion(`${info.name} ${info.version}`))
      .catch(() => setAppVersion("Digital Human Studio"));
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>数字人口播工作台</h1>
          <p>{appVersion || "Digital Human Studio"}</p>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" title="设置" onClick={() => setSettingsOpen(true)}>
            <Settings size={18} />
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="task-pane">
          <div className="pane-heading">
            <span>任务列表</span>
            <button className="icon-button small" title="新建任务">
              <Plus size={16} />
            </button>
          </div>

          <div className="task-list">
            {tasks.map((task) => (
              <button
                key={task.id}
                className={`task-row ${task.tone === "当前" ? "active" : ""}`}
                type="button"
              >
                <span className={`task-dot ${task.tone}`} />
                <span>
                  <strong>{task.name}</strong>
                  <small>{task.meta}</small>
                </span>
              </button>
            ))}
          </div>
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
                defaultValue={"如果你的内容一直有播放，却始终带不动成交，问题可能不在流量。"}
                aria-label="源文案"
              />
              <div className="button-row">
                <button type="button">
                  <Upload size={16} />
                  上传音视频
                </button>
                <button type="button">
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
                defaultValue={
                  "播放量不差却没有订单时，先别急着加预算。真正要改的，往往是前三秒给用户的购买理由。"
                }
                aria-label="原创脚本"
              />
              <div className="risk-row">
                <CheckCircle2 size={16} />
                <span>相似风险：低</span>
              </div>
            </section>
          </div>

          <div className="settings-grid">
            <section className="compact-block">
              <h3>数字人</h3>
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
            </section>

            <section className="compact-block">
              <h3>输出预设</h3>
              <label className="checkbox-row">
                <input type="checkbox" defaultChecked />
                <Smartphone size={16} />
                竖屏 9:16
              </label>
              <label className="checkbox-row">
                <input type="checkbox" />
                <Monitor size={16} />
                横屏 16:9
              </label>
            </section>

            <section className="compact-block">
              <h3>后期资产</h3>
              <label className="checkbox-row">
                <input type="checkbox" defaultChecked />
                字幕
              </label>
              <label className="checkbox-row">
                <input type="checkbox" />
                本地 BGM
              </label>
              <label className="checkbox-row">
                <input type="checkbox" defaultChecked />
                封面
              </label>
            </section>
          </div>

          <div className="primary-actions">
            <button type="button">
              <WandSparkles size={17} />
              生成脚本
            </button>
            <button type="button" className="primary">
              <Play size={17} />
              生成数字人
            </button>
            <button type="button">
              <FolderOpen size={17} />
              打开导出
            </button>
          </div>
        </section>

        <aside className="preview-pane">
          <div className="preview-box">
            <div className="phone-frame">
              <div className="avatar-placeholder">视频预览</div>
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
                    <button className="icon-button tiny" title="重试">
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
              <span>等待合成完成</span>
            </div>
            <AlertCircle size={18} />
          </section>
        </aside>
      </main>

      {settingsOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-label="设置">
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
            <label>
              HeyGen API Key
              <input type="password" placeholder="保存在本机安全存储" />
            </label>
            <label>
              大模型 Base URL
              <input type="text" placeholder="https://api.openai.com/v1" />
            </label>
            <label>
              模型名
              <input type="text" placeholder="gpt-4.1-mini" />
            </label>
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
