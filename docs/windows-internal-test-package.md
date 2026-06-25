# Windows 内部试用安装包说明

本文档用于打包和分发“跑量自媒体视频工作台”的 Windows 内部试用版。

## 兼容范围

- Windows 10 x64
- Windows 11 x64
- 建议内存：8GB 起步。软件会自动识别低配模式、标准模式、批量模式，并限制混剪/去重的 FFmpeg 并发和线程数。
- 需要网络访问 HeyGen、OpenAI 兼容接口、视频下载接口等外部服务。

## 生成安装包

在项目根目录执行：

```bash
npm install
npm run package:win
```

输出目录：

- 安装包：`release/app/PaoliangVideoWorkbench-Setup-1.0.0-win-x64.exe`
- 免安装检查目录：`release/app/win-unpacked/`

安装包文件名使用英文，避免部分 Windows 环境或压缩软件出现中文路径乱码；安装后的软件名和快捷方式仍显示为“跑量自媒体视频工作台”。

## 分发给同事

只发这个文件：

```text
release/app/PaoliangVideoWorkbench-Setup-1.0.0-win-x64.exe
```

不要发送以下内容：

- `data/license/private-key.pem`
- `release/license-tool/`
- `跑量授权码生成器`
- 本机数据库、API Key、生成视频、任务素材、测试报告

授权码生成器只给软件管理员使用，不能发给普通试用用户。

## 同事首次使用流程

1. 同事运行安装包并打开软件。
2. 未激活时，软件只显示“激活软件”页面。
3. 同事复制页面里的机器码发给管理员。
4. 管理员用“跑量授权码生成器”生成激活码。
5. 同事粘贴激活码并激活。
6. 激活后进入工作台，再到设置里填写自己的 HeyGen、OpenAI 兼容接口、下载接口等 API 配置。

## 本机数据位置

软件默认数据目录：

```text
%APPDATA%\自媒体视频工作台
```

这里会保存本机任务、加密凭据、生成素材索引、授权状态等。卸载软件不等于自动删除这些数据；如果需要彻底清理，需要手动删除该目录。

## 打包前检查

建议每次分发前至少执行：

```bash
npm run release:check
npm run release:ui
npm run package:win
```

如果涉及真实 API、HeyGen、混剪、去重或导出链路修改，还需要执行真实全流程验收。

## GitHub 同步规则

安装包配置、说明文档和代码修改要提交到 GitHub；生成出来的安装包、授权码生成器、私钥、数据库和素材文件不提交。
