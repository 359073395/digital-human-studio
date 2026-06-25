# 跑量自媒体视频工作台

一个面向 Windows 桌面端的 AI 短视频制作工作台。当前目标是用 API 优先的方式，把原视频分析、AI 文案、数字人口播、商品带货、图片口型同步、个人 IP、爆款复刻、混剪视频和视频去重处理逐步整合到同一个本地软件中。

## 项目地址

```bash
git clone https://github.com/359073395/digital-human-studio.git
cd digital-human-studio
```

## 开发环境

```bash
npm install
npm run dev
```

常用检查命令：

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run release:check
npm run release:ui
```

## 新电脑继续开发

在任何新电脑或新的 Codex 会话中，先告诉 Codex：

```text
继续维护这个项目：https://github.com/359073395/digital-human-studio
请先阅读 AGENTS.md、CONTEXT.md、docs/adr/ 和 README.md。
```

然后按上面的命令安装依赖并启动。API Key、Bearer Token、HeyGen OAuth token bundle、本地任务数据库、生成视频和本地缓存不会保存在 GitHub，需要在新电脑的软件设置里重新配置或重新授权。

## GitHub 同步规则

用户确认过的功能改动、Bug 修复、UI 调整、流程规则、内置知识和说明文档，都要提交并推送到 GitHub。

每次更新 GitHub 前必须注意：

- 不提交 API Key、Bearer Token、账号信息、SQLite 数据库、生成视频、本地缓存和大体积原始素材。
- 上传资料里的可复用经验，要整理成脱敏 Markdown、内置规则、分析报告或提示词模板后再提交。
- 如果软件行为、启动方式、API 配置方式、数据目录、知识库规则发生变化，要同步更新 `README.md`、`AGENTS.md`、`CONTEXT.md` 或 `docs/adr/`。
- 推送前至少运行与改动范围匹配的检查；发布相关改动优先运行 `npm run release:check` 和 `npm run release:ui`。

## 当前主要功能模块

- 桌面体验：Windows 桌面版默认隐藏 Electron 系统菜单栏，不显示无关的 `File / Edit / View / Window`。
- 自动性能调度：启动时按 CPU、内存和磁盘空间自动进入低配模式、标准模式或批量模式；混剪/去重会自动限制 FFmpeg 线程并清理中间文件。
- 视频分析中心：原视频链接、下载/上传、提取文案、画面分析、模式推荐。
- 预设数字人口播：HeyGen Avatar + AI 文案 + 输出比例。
- HeyGen 会员授权：设置页支持 OAuth Client ID + Redirect URI 的 PKCE 授权，成功后本地加密保存 token bundle，生成时可优先走 Video Agent 会员路由。
- 商品/带货视频：商品资料、人物商品图、可选数字人口播。
- 图片口型同步：参考人物图或人物商品图 + 口播脚本。
- 个人 IP 视频：探店、知识输出、观点、人设内容。
- 爆款视频复刻：拉片分析、结构改写、故事板和分镜提示。
- 混剪视频：选择素材文件夹，按素材数量、组合和重复率自动估算批量生成数量。
- 视频去重处理：独立模式，输出内部原创度评分和处理报告。

## 重要文档

- `AGENTS.md`：Codex 接手项目时必须遵守的规则。
- `CONTEXT.md`：产品语言、边界和术语。
- `docs/adr/`：重要架构和产品决策记录。
- `docs/api-configuration.md`：API 配置说明。
- `docs/license-activation.md`：离线激活码、授权码生成器和私钥备份说明。
- `docs/release-small-scope-validation.md`：小范围交付版验收标准。

## 安全原则

GitHub 只保存代码、文档、脱敏知识和可复用规则。真实 API 凭据、本地数据、用户账号、生成视频和未脱敏素材只保存在本机，不进入仓库。

## Windows 内部试用安装包

主软件安装包使用 `electron-builder` 生成，兼容 Windows 10/11 x64：

```bash
npm run package:win
```

输出文件：

- `release/app/PaoliangVideoWorkbench-Setup-1.0.0-win-x64.exe`
- `release/app/win-unpacked/`

安装包只发给试用同事；授权码生成器和授权私钥只由管理员保管。详细流程见 `docs/windows-internal-test-package.md`。
