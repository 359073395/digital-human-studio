const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { createLicenseCode, readPrivateKey } = require("./license-utils");

const DEBUG_PORT = Number(process.env.RELEASE_UI_DEBUG_PORT || 9333);

function getElectronPath() {
  const electronModule = require("electron");
  return typeof electronModule === "string" ? electronModule : electronModule.default;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(2000, () => {
      request.destroy(new Error(`Timed out: ${url}`));
    });
  });
}

async function waitForPage() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const pages = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const page = pages.find(
        (candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl
      );
      if (page) {
        return page;
      }
    } catch {
      // Electron may still be booting.
    }
    await wait(500);
  }

  throw new Error("桌面 UI 验收无法连接 Electron 调试页面。");
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("CDP WebSocket 连接超时。")), 10_000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      this.socket.addEventListener("error", reject);
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (!message.id) {
          return;
        }
        const pending = this.pending.get(message.id);
        if (!pending) {
          return;
        }
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      });
    });
  }

  call(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async evaluate(expression) {
    const result = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "页面脚本执行失败。");
    }
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function main() {
  const appDataDir = path.join(os.tmpdir(), `dhs-release-ui-${Date.now()}`);
  const electronPath = getElectronPath();
  const child = spawn(electronPath, [".", `--remote-debugging-port=${DEBUG_PORT}`], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      DHS_APP_DATA_DIR: appDataDir,
      DHS_LICENSE_TEST_BYPASS: "1",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  let client;
  try {
    const page = await waitForPage();
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.open();
    await client.call("Runtime.enable");
    const machineCode = await client.evaluate(`
      (async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        for (let i = 0; i < 100; i += 1) {
          const element = document.querySelector('[data-testid="release-license-machine-code"]');
          const value = element?.textContent?.trim() || '';
          if (/^[A-Z0-9]{4}-[A-Z0-9]{4}/.test(value)) {
            return value;
          }
          await wait(100);
        }
        return '';
      })()
    `);

    if (machineCode) {
      const privateKeyPem = readPrivateKey();
      const activation = createLicenseCode({
        machineCode,
        holder: "发布UI验收",
        days: 7,
        privateKeyPem
      });
      await client.evaluate(`
        (async () => {
          const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const input = document.querySelector('[data-testid="release-license-code-input"]');
          if (!input) return;
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
          setter.call(input, ${JSON.stringify(activation.code)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          document.querySelector('[data-testid="release-license-submit"]').click();
          for (let i = 0; i < 100; i += 1) {
            if (!document.querySelector('[data-testid="release-license-code-input"]')) return;
            await wait(100);
          }
          throw new Error('自动激活后仍停留在激活页。');
        })()
      `);
    }

    await client.evaluate(`
      (async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const assert = (condition, message) => {
          if (!condition) throw new Error(message);
        };
        const q = (selector) => document.querySelector(selector);
        const qa = (selector) => Array.from(document.querySelectorAll(selector));
        const waitFor = async (selector) => {
          for (let i = 0; i < 80; i += 1) {
            const element = q(selector);
            if (element) return element;
            await wait(100);
          }
          throw new Error('找不到元素：' + selector);
        };
        const waitForText = async (text) => {
          for (let i = 0; i < 100; i += 1) {
            if (document.body.textContent.includes(text)) return;
            await wait(100);
          }
          throw new Error(
            '页面未出现文本：' + text + '；当前文本：' + document.body.textContent.slice(0, 200)
          );
        };
        const setInputValue = (input, value) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const click = async (selector) => {
          const element = await waitFor(selector);
          element.click();
          await wait(250);
          return element;
        };
        const submitTaskName = async (name) => {
          await waitFor('[data-testid="release-task-dialog"]');
          setInputValue(q('[data-testid="release-task-name-input"]'), name);
          q('[data-testid="release-task-dialog-submit"]').click();
          await wait(600);
        };

        await waitForText('跑量自媒体视频工作台');
        const brandLogo = await waitFor('.brand-logo');
        assert(brandLogo.naturalWidth > 0, '软件 Logo 未正确加载。');

        await click('[data-testid="release-new-task"]');
        await submitTaskName('UI验收任务');
        assert(qa('[data-testid="release-task-row"]').length === 1, '新建任务失败。');

        q('[data-testid="release-task-row"] .task-main').dispatchEvent(
          new MouseEvent('dblclick', { bubbles: true })
        );
        await submitTaskName('UI验收任务-重命名');
        assert(q('[data-testid="release-task-row"]').textContent.includes('UI验收任务-重命名'), '重命名失败。');

        await click('[data-testid="release-open-settings"]');
        const modal = await waitFor('[data-testid="release-settings-modal"]');
        const modalRect = modal.getBoundingClientRect();
        assert(modalRect.width > 500 && modalRect.height > 300, '设置弹窗尺寸异常。');
        assert(modalRect.right <= window.innerWidth + 1, '设置弹窗横向溢出。');
        assert(qa('[data-testid="release-settings-provider-tab"]').length >= 6, '设置服务列表不完整。');
        q('.modal-backdrop').click();
        await wait(300);
        assert(!q('[data-testid="release-settings-modal"]'), '设置弹窗无法关闭。');

        const stage = await waitFor('[data-testid="release-media-stage"]');
        const stageRect = stage.getBoundingClientRect();
        const portraitRatio = stageRect.width / stageRect.height;
        assert(Math.abs(portraitRatio - 9 / 16) < 0.01, '成品预览竖屏比例错误：' + portraitRatio);

        await click('[data-testid="release-preview-cover-tab"]');
        const cover = await waitFor('[data-testid="release-cover-preview"]');
        const coverRect = cover.getBoundingClientRect();
        const coverRatio = coverRect.width / coverRect.height;
        assert(Math.abs(coverRatio - 9 / 16) < 0.01, '封面预览竖屏比例错误：' + coverRatio);

        await click('[data-testid="release-delete-task"]');
        await click('[data-testid="release-confirm-delete"]');
        await wait(500);
        assert(qa('[data-testid="release-task-row"]').length === 0, '删除任务失败。');

        await click('[data-testid="release-new-task"]');
        await submitTaskName('UI持久化任务');
        assert(qa('[data-testid="release-task-row"]').length === 1, '删除后重新新建任务失败。');

        return {
          ok: true,
          taskCount: qa('[data-testid="release-task-row"]').length,
          portraitRatio,
          coverRatio
        };
      })()
    `);

    console.log(JSON.stringify({ ok: true, appDataDir }, null, 2));
  } finally {
    if (client) {
      client.close();
    }
    await stopChild(child);
    removeDirectoryWithRetry(appDataDir);
  }

  if (child.exitCode && child.exitCode !== 0) {
    console.error(stderr);
  }
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill();
  const exited = await waitForExit(child, 5000);
  if (!exited && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await waitForExit(child, 5000);
  }
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true;
  }

  const timeout = Symbol("timeout");
  const result = await Promise.race([once(child, "exit"), wait(timeoutMs).then(() => timeout)]);
  return result !== timeout;
}

function removeDirectoryWithRetry(directory) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
      return;
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
