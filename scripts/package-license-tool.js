const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const packageJson = require("../package.json");

const APP_NAME = "跑量授权码生成器";
const PACKAGE_DIR_NAME = "license-generator-win-x64";
const EXE_FILE_NAME = "PaoliangLicenseGenerator.exe";
const electronExePath = require("electron");
const electronDist = path.dirname(electronExePath);
const outputRoot = path.resolve("release", "license-tool");
const packageDir = path.join(outputRoot, PACKAGE_DIR_NAME);
const exePath = path.join(packageDir, EXE_FILE_NAME);
const privateKeyPath = path.resolve("data", "license", "private-key.pem");
const zipPath = path.resolve(
  "release",
  `${APP_NAME}-${packageJson.version || "1.0.0"}-win-x64.zip`
);

function main() {
  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(
      `没有找到授权私钥：${privateKeyPath}。请先运行 npm run license:keygen，或恢复你的私钥备份。`
    );
  }

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.cpSync(electronDist, packageDir, { recursive: true });

  const originalExePath = path.join(packageDir, "electron.exe");
  if (fs.existsSync(originalExePath)) {
    fs.renameSync(originalExePath, exePath);
  }

  const appDir = path.join(packageDir, "resources", "app");
  fs.rmSync(appDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(appDir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(appDir, "public"), { recursive: true });

  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify(
      {
        name: "paoliang-license-tool",
        version: packageJson.version || "1.0.0",
        main: "scripts/license-tool.js"
      },
      null,
      2
    ),
    "utf8"
  );
  copyRequiredFile("scripts/license-tool.js", path.join(appDir, "scripts", "license-tool.js"));
  copyRequiredFile("scripts/license-utils.js", path.join(appDir, "scripts", "license-utils.js"));
  copyRequiredFile("public/app-logo.png", path.join(appDir, "public", "app-logo.png"));
  copyRequiredFile("public/app-logo.ico", path.join(appDir, "public", "app-logo.ico"));
  copyRequiredFile(privateKeyPath, path.join(packageDir, "resources", "license-private-key.pem"));

  fs.writeFileSync(path.join(packageDir, "install-desktop-shortcut.cmd"), shortcutScript(), "utf8");
  fs.writeFileSync(path.join(packageDir, "README.txt"), packageReadme(), "utf8");

  fs.rmSync(zipPath, { force: true });
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Compress-Archive -LiteralPath ${quotePowerShell(packageDir)} -DestinationPath ${quotePowerShell(
        zipPath
      )} -Force`
    ],
    {
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
      timeout: 5 * 60 * 1000
    }
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "授权码生成器压缩包创建失败。");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        packageDir,
        exePath,
        zipPath,
        warning: "这个包包含授权私钥，只能你自己保管，不能发给普通试用用户。"
      },
      null,
      2
    )
  );
}

function copyRequiredFile(source, target) {
  if (!fs.existsSync(source)) {
    throw new Error(`缺少打包文件：${source}`);
  }
  fs.copyFileSync(source, target);
}

function quotePowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function shortcutScript() {
  return `@echo off
chcp 65001 >nul
set "APP_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\\\\跑量授权码生成器.lnk'); $s.TargetPath='%APP_DIR%${EXE_FILE_NAME}'; $s.WorkingDirectory='%APP_DIR%'; $s.Save()"
echo 已在桌面创建快捷方式：跑量授权码生成器
pause
`;
}

function packageReadme() {
  return `跑量授权码生成器

使用方法：
1. 双击 ${EXE_FILE_NAME} 打开授权码生成器。
2. 输入用户激活页复制出来的机器码。
3. 填写授权对象和有效天数，点击生成激活码。
4. 可运行 install-desktop-shortcut.cmd 在桌面创建快捷方式。

重要安全提醒：
- 这个包内置授权私钥，只有你本人或授权管理员能使用。
- 不要把这个包发给普通试用用户。
- 如果这个包泄露，别人可以给任意电脑签发激活码。
`;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
