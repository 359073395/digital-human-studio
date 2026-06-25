const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, clipboard, ipcMain } = require("electron");
const {
  DEFAULT_PRIVATE_KEY_PATH,
  createLicenseCode,
  normalizeMachineCode,
  readPrivateKey
} = require("./license-utils");

const PRIVATE_KEY_PATH = resolvePrivateKeyPath();

function createWindow() {
  const window = new BrowserWindow({
    width: 760,
    height: 680,
    minWidth: 680,
    minHeight: 580,
    title:
      "\u8dd1\u91cf\u81ea\u5a92\u4f53\u89c6\u9891\u5de5\u4f5c\u53f0 - \u6388\u6743\u7801\u751f\u6210\u5668",
    icon:
      resolveAssetPath(["public", "app-logo.ico"]) || resolveAssetPath(["public", "app-logo.png"]),
    backgroundColor: "#efeae1",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  window.setMenu(null);
  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderHtml())}`);
}

ipcMain.handle("license-tool:generate", (_event, input) => {
  const privateKeyPem = readPrivateKey(PRIVATE_KEY_PATH);
  const result = createLicenseCode({
    machineCode: input.machineCode,
    holder: input.holder,
    days: Number(input.days || 90),
    privateKeyPem
  });
  return result;
});

ipcMain.handle("license-tool:copy", (_event, value) => {
  clipboard.writeText(String(value || ""));
  return true;
});

function renderHtml() {
  const logoDataUrl = createLogoDataUrl();
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>授权码生成器</title>
    <style>
      :root {
        color: #202b2c;
        background: #efeae1;
        font-family: "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          linear-gradient(135deg, rgba(255,255,255,.48), rgba(230,223,211,.8)),
          #efeae1;
      }
      main {
        display: grid;
        gap: 18px;
        width: min(680px, calc(100vw - 36px));
        margin: 26px auto;
      }
      header,
      section {
        border: 1px solid #d1c7b8;
        border-radius: 14px;
        background: rgba(255, 253, 248, .9);
        box-shadow: 0 18px 48px rgba(47, 51, 47, .12);
      }
      header {
        display: grid;
        grid-template-columns: 58px minmax(0, 1fr);
        gap: 14px;
        align-items: center;
        padding: 22px;
      }
      .logo {
        width: 58px;
        height: 58px;
        object-fit: contain;
        filter: drop-shadow(0 10px 22px rgba(166, 119, 36, .22));
      }
      h1 {
        margin: 0;
        color: #172425;
        font-size: 24px;
      }
      p {
        margin: 8px 0 0;
        color: #5f6c6a;
        line-height: 1.6;
      }
      form,
      section {
        display: grid;
        gap: 14px;
        padding: 18px;
      }
      label {
        display: grid;
        gap: 7px;
        color: #43514f;
        font-size: 14px;
        font-weight: 700;
      }
      input,
      textarea {
        width: 100%;
        border: 1px solid #d1c7b8;
        border-radius: 10px;
        background: #fffdf8;
        color: #172425;
        font: inherit;
      }
      input {
        height: 42px;
        padding: 0 12px;
      }
      textarea {
        min-height: 154px;
        padding: 12px;
        resize: vertical;
        line-height: 1.55;
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr 140px;
        gap: 12px;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      button {
        min-height: 40px;
        border: 1px solid #496d66;
        border-radius: 10px;
        background: #496d66;
        color: #fffaf1;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
        padding: 0 16px;
      }
      button.secondary {
        border-color: #d1c7b8;
        background: #fffdf8;
        color: #202b2c;
      }
      button:disabled {
        cursor: not-allowed;
        opacity: .62;
      }
      .message {
        min-height: 22px;
        color: #496d66;
        font-size: 13px;
        font-weight: 700;
      }
      .message.error {
        color: #9a5d4e;
      }
      small {
        color: #76837a;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <img class="logo" alt="" src="${logoDataUrl}" />
        <div>
          <h1>跑量自媒体视频工作台授权码生成器</h1>
          <p>输入试用电脑激活页显示的机器码，设置授权对象和有效天数，生成离线激活码。私钥只读取本机安全资源，不会联网。</p>
        </div>
      </header>
      <form id="form">
        <label>
          机器码
          <input id="machineCode" placeholder="例如 ABCD-1234-EFGH-5678" required />
          <small>用户打开软件激活页后复制给你。</small>
        </label>
        <div class="grid">
          <label>
            授权对象
            <input id="holder" placeholder="姓名 / 公司 / 内部账号" required />
          </label>
          <label>
            有效天数
            <input id="days" type="number" min="1" value="90" required />
          </label>
        </div>
        <div class="actions">
          <button id="generate" type="submit">生成激活码</button>
          <button class="secondary" id="copy" type="button" disabled>复制激活码</button>
        </div>
        <div id="message" class="message"></div>
      </form>
      <section>
        <label>
          激活码
          <textarea id="code" readonly placeholder="生成后会显示在这里"></textarea>
        </label>
      </section>
    </main>
    <script>
      const { ipcRenderer } = require("electron");
      const form = document.querySelector("#form");
      const code = document.querySelector("#code");
      const copy = document.querySelector("#copy");
      const message = document.querySelector("#message");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.className = "message";
        message.textContent = "正在生成...";
        try {
          const result = await ipcRenderer.invoke("license-tool:generate", {
            machineCode: document.querySelector("#machineCode").value,
            holder: document.querySelector("#holder").value,
            days: document.querySelector("#days").value
          });
          code.value = result.code;
          copy.disabled = false;
          message.textContent = "已生成，有效期至 " + new Date(result.payload.expiresAt).toLocaleDateString("zh-CN") + "。";
        } catch (error) {
          copy.disabled = true;
          code.value = "";
          message.className = "message error";
          message.textContent = error && error.message ? error.message : String(error);
        }
      });
      copy.addEventListener("click", async () => {
        await ipcRenderer.invoke("license-tool:copy", code.value);
        message.className = "message";
        message.textContent = "激活码已复制。";
      });
      document.querySelector("#machineCode").addEventListener("input", (event) => {
        event.target.value = ${normalizeMachineCode.toString()}(event.target.value);
      });
    </script>
  </body>
</html>`;
}

function resolvePrivateKeyPath() {
  const explicit = process.env.DHS_LICENSE_PRIVATE_KEY;
  const candidates = [
    explicit ? path.resolve(explicit) : "",
    path.join(process.resourcesPath || "", "license-private-key.pem"),
    path.resolve(DEFAULT_PRIVATE_KEY_PATH)
  ].filter(Boolean);
  return (
    candidates.find((candidate) => fs.existsSync(candidate)) ??
    path.resolve(DEFAULT_PRIVATE_KEY_PATH)
  );
}

function resolveAssetPath(segments) {
  const candidates = [
    path.resolve(...segments),
    path.join(__dirname, "..", ...segments),
    path.join(process.resourcesPath || "", "app", ...segments)
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function createLogoDataUrl() {
  const logoPath = resolveAssetPath(["public", "app-logo.png"]);
  if (!logoPath) {
    return "";
  }
  const data = fs.readFileSync(logoPath);
  return `data:image/png;base64,${data.toString("base64")}`;
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  app.quit();
});
