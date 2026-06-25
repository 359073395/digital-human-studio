const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ffmpegStaticPath = require("ffmpeg-static");

const {
  createAppPaths,
  ensureAppPaths,
  getTaskDirectory
} = require("../dist-electron/main/storage/appPaths");
const {
  CredentialStore,
  createCredentialFilePath
} = require("../dist-electron/main/storage/credentialStore");
const { openTaskDatabase, runMigrations } = require("../dist-electron/main/storage/database");
const { SafeStorageCipher } = require("../dist-electron/main/storage/safeStorageCipher");
const {
  ServiceConfigurationRepository
} = require("../dist-electron/main/storage/serviceConfigurationRepository");
const { TaskRepository } = require("../dist-electron/main/storage/taskRepository");
const {
  OpenAiCompatibleScriptProvider
} = require("../dist-electron/main/script/openAiCompatibleScriptProvider");
const {
  OpenAiCompatibleSourceTranscriptionProvider
} = require("../dist-electron/main/media/sourceTranscriptionProvider");
const {
  OpenAiCompatibleVisualAnalysisProvider
} = require("../dist-electron/main/media/visualAnalysisProvider");
const { ScriptWorkflowService } = require("../dist-electron/main/script/scriptWorkflowService");
const { OpenAiImageProvider } = require("../dist-electron/main/image/openAiImageProvider");
const {
  PresenterImageWorkflowService
} = require("../dist-electron/main/image/presenterImageWorkflowService");
const { HeyGenAvatarCatalog } = require("../dist-electron/main/avatar/heyGenAvatarCatalog");
const { HeyGenAvatarProvider } = require("../dist-electron/main/avatar/heyGenAvatarProvider");
const { AvatarWorkflowService } = require("../dist-electron/main/avatar/avatarWorkflowService");
const {
  OpenAiAsrSubtitleProvider
} = require("../dist-electron/main/subtitles/openAiAsrSubtitleProvider");
const { ExportWorkflowService } = require("../dist-electron/main/workflow/exportWorkflowService");
const { RealWorkflowRunner } = require("../dist-electron/main/workflow/realWorkflowRunner");
const {
  MixedCutWorkflowService
} = require("../dist-electron/main/workflow/mixedCutWorkflowService");
const {
  VideoDedupWorkflowService
} = require("../dist-electron/main/workflow/videoDedupWorkflowService");
const { SourceAssetService } = require("../dist-electron/main/source/sourceAssetService");
const {
  OpenAiCompatibleStoryboardProvider
} = require("../dist-electron/main/storyboard/openAiCompatibleStoryboardProvider");
const {
  StoryboardWorkflowService
} = require("../dist-electron/main/storyboard/storyboardWorkflowService");

const PROVIDERS = ["heygen", "source-parser", "llm", "image", "video", "asr", "tts"];
const OUTPUT_PRESETS = ["portrait-9-16", "landscape-16-9"];

const MATERIALS = {
  productImage: {
    label: "Wikimedia Commons cosmetics sample",
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Cosmetics.JPG?width=1024",
    fileName: "cosmetics.jpg"
  },
  referenceImage: {
    label: "Wikimedia Commons portrait sample",
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/1839%20Self-portrait%20by%20Robert%20Cornelius%20(cropped).jpg?width=1024",
    fileName: "portrait.jpg"
  },
  sampleVideo: {
    label: "Generated speech sample video",
    url: "local://generated-speech-sample.mp4",
    fileName: "speech-sample.mp4"
  }
};

function env(name) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function heyGenEnvAuthMode() {
  const value = env("HEYGEN_AUTH_MODE")?.toLowerCase();
  if (!value) {
    return undefined;
  }
  if (["oauth", "bearer", "oauth-bearer", "oauth_bearer"].includes(value)) {
    return "oauth-bearer";
  }
  if (["api-key", "api_key", "apikey"].includes(value)) {
    return "api-key";
  }
  throw new Error("HEYGEN_AUTH_MODE only supports api-key or oauth-bearer.");
}

function heyGenEnvGenerationRoute() {
  const value = env("HEYGEN_GENERATION_ROUTE")?.toLowerCase();
  if (!value) {
    return undefined;
  }
  if (
    [
      "auto",
      "direct-video",
      "direct_video",
      "direct",
      "video-agent",
      "video_agent",
      "agent"
    ].includes(value)
  ) {
    return value.startsWith("direct")
      ? "direct-video"
      : value.includes("agent")
        ? "video-agent"
        : "auto";
  }
  throw new Error("HEYGEN_GENERATION_ROUTE only supports auto, direct-video, or video-agent.");
}

function heyGenEnvCredential() {
  return env("HEYGEN_BEARER_TOKEN") || env("HEYGEN_TOKEN") || env("HEYGEN_API_KEY");
}

function hasHeyGenEnvConfiguration() {
  return Boolean(
    env("HEYGEN_BASE_URL") ||
    env("HEYGEN_AVATAR_ID") ||
    env("HEYGEN_VOICE_ID") ||
    env("HEYGEN_RESOLUTION") ||
    heyGenEnvAuthMode() ||
    heyGenEnvGenerationRoute() ||
    heyGenEnvCredential()
  );
}

function nowStamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function defaultSourceAppDataDir() {
  return (
    env("DHS_SOURCE_APP_DATA_DIR") ||
    path.join(process.env.APPDATA || os.homedir(), "自媒体视频工作台")
  );
}

function createRuntime(appDataDir) {
  const appPaths = createAppPaths(appDataDir);
  ensureAppPaths(appPaths);
  const database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  const credentialStore = new CredentialStore(
    createCredentialFilePath(appDataDir),
    new SafeStorageCipher(appDataDir)
  );
  const serviceRepository = new ServiceConfigurationRepository(database, credentialStore);
  const taskRepository = new TaskRepository(database, appPaths);
  return { appPaths, database, credentialStore, serviceRepository, taskRepository };
}

function closeRuntime(runtime) {
  runtime.database.close();
}

async function copyServiceConfiguration({ source, target, providerId }) {
  const current = source.serviceRepository.getConfiguration(providerId);
  let apiKey;
  try {
    apiKey = await source.credentialStore.readCredential(providerId);
  } catch {
    apiKey = undefined;
  }

  const envSettings = providerEnvOverrides(providerId);
  const envApiKey = providerEnvApiKey(providerId);
  return target.serviceRepository.saveConfiguration({
    providerId,
    settings: {
      ...current.settings,
      ...envSettings
    },
    apiKey: envApiKey ?? apiKey ?? undefined
  });
}

function providerEnvOverrides(providerId) {
  const settings = providerEnvSettings(providerId);
  return Object.fromEntries(
    Object.entries(settings).filter(
      ([key, value]) => value !== undefined && !(key === "enabled" && value === false)
    )
  );
}

function providerEnvSettings(providerId) {
  const openAiBaseUrl = env("OPENAI_COMPAT_BASE_URL");
  if (providerId === "heygen") {
    return {
      baseUrl: env("HEYGEN_BASE_URL"),
      authMode: heyGenEnvAuthMode(),
      generationRoute: heyGenEnvGenerationRoute(),
      avatarId: env("HEYGEN_AVATAR_ID"),
      voiceId: env("HEYGEN_VOICE_ID"),
      resolution: env("HEYGEN_RESOLUTION"),
      enabled: hasHeyGenEnvConfiguration()
    };
  }

  if (providerId === "llm") {
    return {
      baseUrl: env("LLM_BASE_URL") || openAiBaseUrl,
      modelName: env("LLM_MODEL"),
      enabled: Boolean(
        env("LLM_BASE_URL") || openAiBaseUrl || env("LLM_MODEL") || env("LLM_API_KEY")
      )
    };
  }

  if (providerId === "source-parser") {
    return {
      baseUrl: env("SOURCE_PARSER_BASE_URL") || env("VIDEO_PARSER_BASE_URL"),
      enabled: Boolean(
        env("SOURCE_PARSER_BASE_URL") ||
        env("VIDEO_PARSER_BASE_URL") ||
        env("SOURCE_PARSER_API_KEY") ||
        env("VIDEO_PARSER_API_KEY")
      )
    };
  }

  if (providerId === "image") {
    return {
      baseUrl: env("IMAGE_BASE_URL") || openAiBaseUrl,
      modelName: env("IMAGE_MODEL"),
      enabled: Boolean(
        env("IMAGE_BASE_URL") || openAiBaseUrl || env("IMAGE_MODEL") || env("IMAGE_API_KEY")
      )
    };
  }

  if (providerId === "video") {
    return {
      baseUrl: env("VIDEO_BASE_URL"),
      modelName: env("VIDEO_MODEL"),
      enabled: Boolean(env("VIDEO_BASE_URL") || env("VIDEO_MODEL"))
    };
  }

  if (providerId === "asr") {
    return {
      baseUrl: env("ASR_BASE_URL") || openAiBaseUrl,
      modelName: env("ASR_MODEL"),
      asrMode: env("ASR_MODE"),
      enabled: Boolean(env("ASR_MODEL"))
    };
  }

  return {
    enabled: false
  };
}

function providerEnvApiKey(providerId) {
  if (providerId === "heygen") {
    return heyGenEnvCredential();
  }

  if (providerId === "llm") {
    return env("LLM_API_KEY") || env("OPENAI_COMPAT_API_KEY");
  }

  if (providerId === "source-parser") {
    return env("SOURCE_PARSER_API_KEY") || env("VIDEO_PARSER_API_KEY");
  }

  if (providerId === "image") {
    return env("IMAGE_API_KEY") || env("OPENAI_COMPAT_API_KEY");
  }

  if (providerId === "video") {
    return env("VIDEO_API_KEY") || env("OPENAI_COMPAT_API_KEY");
  }

  if (providerId === "asr") {
    return env("ASR_API_KEY") || env("OPENAI_COMPAT_API_KEY");
  }

  return undefined;
}

async function prepareConfigurations(sourceAppDataDir, target, cases) {
  if (!fs.existsSync(sourceAppDataDir) && !heyGenEnvCredential()) {
    throw new Error(
      `没有找到源配置目录：${sourceAppDataDir}。请先在桌面版保存 API，或通过 HEYGEN_API_KEY / HEYGEN_BEARER_TOKEN 提供凭据。`
    );
  }

  let source;
  if (fs.existsSync(sourceAppDataDir)) {
    source = createRuntime(sourceAppDataDir);
  }

  try {
    for (const providerId of providersForSelectedCases(cases)) {
      if (source) {
        await copyServiceConfiguration({ source, target, providerId });
      } else {
        await target.serviceRepository.saveConfiguration({
          providerId,
          settings: providerEnvSettings(providerId),
          apiKey: providerEnvApiKey(providerId)
        });
      }
    }
  } finally {
    if (source) {
      closeRuntime(source);
    }
  }
}

async function ensureReleaseAsrConfiguration(runtime, cases) {
  if (!cases.some((mode) => mode.importSourceVideo)) {
    return;
  }

  if (env("ASR_BASE_URL") || env("ASR_MODEL") || env("ASR_MODE") || env("ASR_API_KEY")) {
    return;
  }

  const currentCheck = await runtime.serviceRepository.testConfiguration("asr");
  if (currentCheck.ok) {
    return;
  }

  const current = runtime.serviceRepository.getConfiguration("asr");
  const asrCredential = await readOptionalCredential(runtime, "asr");
  const llmCredential = await readOptionalCredential(runtime, "llm");
  await runtime.serviceRepository.saveConfiguration({
    providerId: "asr",
    settings: {
      ...current.settings,
      baseUrl: "https://api.hyjiexi.eu.org/v1",
      modelName: "gemini-3.1-flash-lite",
      asrMode: "chat-audio",
      enabled: true
    },
    apiKey: asrCredential || llmCredential || undefined
  });
}

async function readOptionalCredential(runtime, providerId) {
  try {
    return (await runtime.credentialStore.readCredential(providerId)) || undefined;
  } catch {
    return undefined;
  }
}

async function downloadMaterial(materialRoot, material) {
  const filePath = path.join(materialRoot, material.fileName);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
    return filePath;
  }

  const response = await fetch(material.url);
  if (!response.ok) {
    throw new Error(`${material.label} 下载失败 (${response.status})`);
  }

  fs.mkdirSync(materialRoot, { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
  return filePath;
}

async function prepareMaterials(testRoot) {
  const materialRoot = path.join(testRoot, "materials");
  const productImage = await downloadMaterial(materialRoot, MATERIALS.productImage);
  const referenceImage = await downloadMaterial(materialRoot, MATERIALS.referenceImage);
  const sampleVideo = createSpeechSampleVideo(materialRoot, MATERIALS.sampleVideo.fileName);
  return {
    productImage,
    referenceImage,
    sampleVideo,
    mixedCutRoot: createGroupedMixedCutMaterials(materialRoot, sampleVideo, productImage)
  };
}

function createGroupedMixedCutMaterials(materialRoot, sampleVideo, productImage) {
  const mixedCutRoot = path.join(materialRoot, "mixed-cut-groups");
  fs.rmSync(mixedCutRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(mixedCutRoot, "1"), { recursive: true });
  fs.mkdirSync(path.join(mixedCutRoot, "2"), { recursive: true });
  fs.mkdirSync(path.join(mixedCutRoot, "3"), { recursive: true });
  fs.copyFileSync(sampleVideo, path.join(mixedCutRoot, "1", "hook-a.mp4"));
  fs.copyFileSync(sampleVideo, path.join(mixedCutRoot, "1", "hook-b.mp4"));
  fs.copyFileSync(productImage, path.join(mixedCutRoot, "2", "proof.jpg"));
  fs.copyFileSync(sampleVideo, path.join(mixedCutRoot, "3", "cta.mp4"));
  return mixedCutRoot;
}

function createSpeechSampleVideo(materialRoot, fileName) {
  const videoPath = path.join(materialRoot, fileName);
  if (fs.existsSync(videoPath) && fs.statSync(videoPath).size > 0) {
    return videoPath;
  }

  fs.mkdirSync(materialRoot, { recursive: true });
  const speechPath = path.join(materialRoot, "speech-sample.wav");
  createSpeechWav(
    speechPath,
    "Hello world. This is a release test for source transcription. The video shows a creator workflow with a simple product demonstration."
  );

  const ffmpegPath = requireFfmpegPath();
  const result = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1280x720:rate=30:duration=8",
      "-i",
      speechPath,
      "-shortest",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "21",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      videoPath
    ],
    {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 5 * 60 * 1000
    }
  );

  if (result.error) {
    throw new Error(`发布验收语音样片生成失败：${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `发布验收语音样片生成失败：${(result.stderr || result.stdout || "").slice(-1200)}`
    );
  }
  if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size === 0) {
    throw new Error("发布验收语音样片生成完成但文件为空。");
  }

  return videoPath;
}

function createSpeechWav(outputPath, text) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Speech",
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    `$s.SetOutputToWaveFile(${powershellString(outputPath)})`,
    `$s.Speak(${powershellString(text)})`,
    "$s.Dispose()"
  ].join("; ");
  const result = spawnSync("powershell", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    timeout: 2 * 60 * 1000,
    maxBuffer: 1024 * 1024
  });

  if (result.error) {
    throw new Error(`发布验收语音生成失败：${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`发布验收语音生成失败：${(result.stderr || result.stdout || "").slice(-1200)}`);
  }
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error("发布验收语音生成完成但文件为空。");
  }
}

function powershellString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function requireFfmpegPath() {
  if (!ffmpegStaticPath) {
    throw new Error("未找到 ffmpeg-static，无法生成发布验收语音样片。");
  }
  return ffmpegStaticPath;
}

function createServices(runtime) {
  const scriptWorkflowService = new ScriptWorkflowService(
    runtime.taskRepository,
    runtime.appPaths,
    new OpenAiCompatibleScriptProvider(runtime.serviceRepository, runtime.credentialStore),
    new OpenAiCompatibleSourceTranscriptionProvider(
      runtime.serviceRepository,
      runtime.credentialStore
    )
  );
  const imageProvider = new OpenAiImageProvider(runtime.serviceRepository, runtime.credentialStore);
  const presenterImageWorkflowService = new PresenterImageWorkflowService(
    runtime.taskRepository,
    runtime.appPaths,
    imageProvider
  );
  const avatarWorkflowService = new AvatarWorkflowService(
    runtime.taskRepository,
    runtime.appPaths,
    new HeyGenAvatarProvider(runtime.serviceRepository, runtime.credentialStore),
    new OpenAiAsrSubtitleProvider(runtime.serviceRepository, runtime.credentialStore)
  );
  const exportWorkflowService = new ExportWorkflowService(runtime.taskRepository, runtime.appPaths);
  const mixedCutWorkflowService = new MixedCutWorkflowService(
    runtime.taskRepository,
    runtime.appPaths
  );
  const videoDedupWorkflowService = new VideoDedupWorkflowService(
    runtime.taskRepository,
    runtime.appPaths
  );
  const sourceAssetService = new SourceAssetService(
    runtime.taskRepository,
    runtime.appPaths,
    fetch,
    runtime.serviceRepository,
    runtime.credentialStore,
    undefined,
    new OpenAiCompatibleVisualAnalysisProvider(runtime.serviceRepository, runtime.credentialStore)
  );
  const storyboardWorkflowService = new StoryboardWorkflowService(
    runtime.taskRepository,
    runtime.appPaths,
    new OpenAiCompatibleStoryboardProvider(runtime.serviceRepository, runtime.credentialStore),
    imageProvider
  );

  return {
    scriptWorkflowService,
    presenterImageWorkflowService,
    avatarWorkflowService,
    exportWorkflowService,
    mixedCutWorkflowService,
    videoDedupWorkflowService,
    sourceAssetService,
    storyboardWorkflowService,
    realWorkflowRunner: new RealWorkflowRunner(
      runtime.taskRepository,
      scriptWorkflowService,
      presenterImageWorkflowService,
      avatarWorkflowService,
      exportWorkflowService,
      mixedCutWorkflowService,
      videoDedupWorkflowService
    ),
    avatarCatalog: new HeyGenAvatarCatalog(runtime.serviceRepository, runtime.credentialStore)
  };
}

function requiredProvidersForCases(cases) {
  const providers = new Set(["llm"]);

  for (const mode of cases) {
    if (requiresHeyGen(mode)) {
      providers.add("heygen");
    }
    if (mode.importProductImage || mode.storyboard) {
      providers.add("image");
    }
    if (mode.importSourceVideo) {
      providers.add("asr");
    }
  }

  return providers;
}

function providersForSelectedCases(cases) {
  const providers = requiredProvidersForCases(cases);

  for (const mode of cases) {
    if (mode.originalVideoUrl && !mode.originalVideoUrl.startsWith("local://")) {
      providers.add("source-parser");
    }
  }

  return PROVIDERS.filter((providerId) => providers.has(providerId));
}

function requiresHeyGen(mode) {
  return mode.generationMode !== "mixed-cut" && mode.generationMode !== "video-dedup";
}

async function runServiceChecks(runtime, cases) {
  const checks = [];
  const requiredProviders = requiredProvidersForCases(cases);
  for (const providerId of providersForSelectedCases(cases)) {
    const result = await runtime.serviceRepository.testConfiguration(providerId);
    checks.push(result);
  }

  const requiredFailures = checks.filter(
    (result) => requiredProviders.has(result.providerId) && !result.ok
  );
  if (requiredFailures.length > 0) {
    throw new Error(
      requiredFailures
        .map((result) => `${result.providerId} 发布验收必需服务不可用：${result.message}`)
        .join("；")
    );
  }

  return checks;
}

async function selectAvatar(runtime, services) {
  const looks = await services.avatarCatalog.listAvatarLooks();
  if (looks.length === 0) {
    throw new Error("HeyGen API 可连接，但没有读取到可用 Avatar。");
  }

  const selected = looks.find((look) => look.defaultVoiceId) ?? looks[0];
  const configuration = runtime.serviceRepository.getConfiguration("heygen");
  await runtime.serviceRepository.saveConfiguration({
    providerId: "heygen",
    settings: {
      ...configuration.settings,
      avatarId: selected.id,
      voiceId: configuration.settings.voiceId || selected.defaultVoiceId || "",
      enabled: true
    }
  });

  return { looks, selected };
}

async function generateScriptThenShorten(runtime, services, taskId, script) {
  const scripted = await services.scriptWorkflowService.generateScript(taskId);
  const scriptStep = scripted.steps.find((step) => step.id === "script");
  if (scriptStep?.status !== "complete") {
    throw new Error(scriptStep?.errorMessage || "脚本生成未完成。");
  }

  return runtime.taskRepository.updateFinalScript(taskId, script);
}

function createTask(runtime, input) {
  const task = runtime.taskRepository.createTask({
    title: input.title,
    sourceScript: input.sourceScript
  });
  return runtime.taskRepository.updateTask({
    taskId: task.id,
    contentLanguage: input.contentLanguage,
    generationMode: input.generationMode,
    avatarMode: input.avatarMode,
    presetAvatarId: input.presetAvatarId,
    presetAvatarGroupId: input.presetAvatarGroupId || "",
    originalVideoUrl: input.originalVideoUrl || "",
    exportDirectory: input.exportDirectory,
    selectedOutputPresets: OUTPUT_PRESETS,
    avatarDescriptionPrompt: input.avatarDescriptionPrompt || "",
    motionPrompt: input.motionPrompt || "",
    frameTitleStyle: {
      ...task.frameTitleStyle,
      enabled: true,
      text: input.frameTitle || input.title,
      verticalPercent: input.frameTitlePercent || 18
    },
    subtitleStyle: {
      ...task.subtitleStyle,
      enabled: true,
      verticalPercent: input.subtitlePercent || 82
    },
    coverStyle: {
      ...task.coverStyle,
      title: input.coverTitle || input.title,
      subtitle: input.coverSubtitle || "发布验收样片"
    },
    personalIpProfile: input.personalIpProfile || task.personalIpProfile
  });
}

async function runMode(runtime, services, materials, exportRoot, avatarLook, mode) {
  const task = createTask(runtime, {
    ...mode,
    presetAvatarId: avatarLook.id,
    presetAvatarGroupId: avatarLook.groupId || mode.presetAvatarGroupId,
    exportDirectory: exportRoot
  });

  if (mode.importProductImage) {
    services.presenterImageWorkflowService.importProductImage(task.id, materials.productImage);
  }
  if (mode.importReferenceImage) {
    services.presenterImageWorkflowService.importReferenceImage(task.id, materials.referenceImage);
  }
  if (mode.importSourceVideo) {
    services.sourceAssetService.importSourceVideo(task.id, materials.sampleVideo);
    await services.scriptWorkflowService.transcribeSource(task.id);
    await services.sourceAssetService.analyzeSourceVisuals(task.id);
  }
  if (mode.importMixedMaterials) {
    services.sourceAssetService.importMixedCutMaterialDirectory(task.id, materials.mixedCutRoot);
    await services.sourceAssetService.analyzeSourceVisuals(task.id);
  }
  if (mode.importDedupSourceVideo) {
    services.videoDedupWorkflowService.importSourceVideo(task.id, materials.sampleVideo);
  }
  if (mode.storyboard) {
    const storyTask = await services.storyboardWorkflowService.generateStoryScriptOptions(task.id);
    assertStepComplete(storyTask, "script", "剧情脚本方案");
    const boardTask = await services.storyboardWorkflowService.generateVisualStoryboard(task.id, 9);
    assertStepComplete(boardTask, "script", "视觉故事板");
  }

  await generateScriptThenShorten(runtime, services, task.id, mode.shortScript);
  const completed = await services.realWorkflowRunner.runTask(task.id);
  return validateCompletedTask(runtime, completed);
}

function assertStepComplete(task, stepId, label) {
  const step = task.steps.find((candidate) => candidate.id === stepId);
  if (step?.status !== "complete") {
    throw new Error(`${label}失败：${step?.errorMessage || step?.status || "未知状态"}`);
  }
}

function validateCompletedTask(runtime, task) {
  const taskDirectory = getTaskDirectory(runtime.appPaths, task.id);
  const failedStep = task.steps.find(
    (step) => step.status === "failed" || step.status === "retry-ready"
  );
  if (failedStep) {
    throw new Error(
      `${task.title} ${failedStep.label}未完成：${failedStep.errorMessage || failedStep.status}`
    );
  }

  const exportStep = task.steps.find((step) => step.id === "export");
  if (exportStep?.status !== "complete") {
    throw new Error(`${task.title} 未完成导出：${exportStep?.errorMessage || exportStep?.status}`);
  }

  const variants = task.outputVariants.filter((variant) =>
    task.selectedOutputPresets.includes(variant.presetId)
  );
  if (variants.length !== task.selectedOutputPresets.length) {
    throw new Error(`${task.title} 输出变体数量不完整。`);
  }

  const variantResults = variants.map((variant) => {
    const videoPath = variant.finishedVideoPath
      ? path.join(taskDirectory, ...variant.finishedVideoPath.split("/"))
      : "";
    const coverPath = variant.coverImagePath
      ? path.join(taskDirectory, ...variant.coverImagePath.split("/"))
      : "";
    const subtitleAssets = task.mediaAssets.filter(
      (asset) => asset.kind === "subtitle-file" && asset.relativePath.includes(variant.presetId)
    );
    if (variant.status !== "complete") {
      throw new Error(`${task.title} ${variant.presetId} 状态不是 complete。`);
    }
    if (!videoPath || !fs.existsSync(videoPath) || fs.statSync(videoPath).size === 0) {
      throw new Error(`${task.title} ${variant.presetId} 缺少成片 MP4。`);
    }
    if (!coverPath || !fs.existsSync(coverPath) || fs.statSync(coverPath).size === 0) {
      throw new Error(`${task.title} ${variant.presetId} 缺少封面。`);
    }
    if (subtitleAssets.length === 0) {
      throw new Error(`${task.title} ${variant.presetId} 缺少字幕文件。`);
    }

    return {
      presetId: variant.presetId,
      finishedVideoPath: videoPath,
      finishedVideoBytes: fs.statSync(videoPath).size,
      coverPath,
      subtitleFiles: subtitleAssets.map((asset) =>
        path.join(taskDirectory, ...asset.relativePath.split("/"))
      )
    };
  });

  if (
    !task.publishingPackage.exportDirectory ||
    !fs.existsSync(task.publishingPackage.exportDirectory)
  ) {
    throw new Error(`${task.title} 缺少外部发布资料包目录。`);
  }

  return {
    ok: true,
    taskId: task.id,
    title: task.title,
    mode: task.generationMode,
    language: task.contentLanguage,
    variants: variantResults,
    publishingPackageDirectory: task.publishingPackage.exportDirectory,
    sourceProcessing: validateSourceProcessing(runtime, task),
    mediaAssets: task.mediaAssets.map((asset) => ({
      kind: asset.kind,
      relativePath: asset.relativePath
    })),
    steps: task.steps
  };
}

function validateSourceProcessing(runtime, task) {
  const taskDirectory = getTaskDirectory(runtime.appPaths, task.id);
  const requiresTranscript = task.generationMode === "viral-remix";
  const requiresVisualAnalysis =
    task.generationMode === "viral-remix" || task.generationMode === "mixed-cut";
  const result = {
    transcript: undefined,
    visualAnalysis: undefined
  };

  if (requiresTranscript) {
    const transcriptAsset = [...task.mediaAssets]
      .reverse()
      .find((asset) => asset.kind === "source-transcript");
    if (!transcriptAsset) {
      throw new Error(`${task.title} 缺少真实提取文案产物。`);
    }
    const transcriptPath = path.join(taskDirectory, ...transcriptAsset.relativePath.split("/"));
    if (!fs.existsSync(transcriptPath) || !fs.readFileSync(transcriptPath, "utf8").trim()) {
      throw new Error(`${task.title} 提取文案文件为空。`);
    }
    const sourceSubtitlePath = path.join(taskDirectory, "subtitles", "source-transcript.srt");
    if (
      !fs.existsSync(sourceSubtitlePath) ||
      !fs.readFileSync(sourceSubtitlePath, "utf8").includes("-->")
    ) {
      throw new Error(`${task.title} 提取文案缺少真实时间轴 SRT。`);
    }
    result.transcript = {
      relativePath: transcriptAsset.relativePath,
      bytes: fs.statSync(transcriptPath).size,
      subtitleRelativePath: "subtitles/source-transcript.srt"
    };
  }

  if (requiresVisualAnalysis) {
    const visualAsset = [...task.mediaAssets]
      .reverse()
      .find((asset) => asset.kind === "source-visual-analysis");
    if (!visualAsset) {
      throw new Error(`${task.title} 缺少真实画面分析产物。`);
    }
    const visualPath = path.join(taskDirectory, ...visualAsset.relativePath.split("/"));
    if (!fs.existsSync(visualPath)) {
      throw new Error(`${task.title} 画面分析文件不存在。`);
    }
    const content = fs.readFileSync(visualPath, "utf8");
    if (!content.includes("#") || !/画面|visual|镜头|storyboard/i.test(content)) {
      throw new Error(`${task.title} 画面分析内容不像有效分析结果。`);
    }
    result.visualAnalysis = {
      relativePath: visualAsset.relativePath,
      bytes: fs.statSync(visualPath).size
    };
  }

  return result;
}

function modeCases() {
  return [
    {
      generationMode: "preset-avatar",
      avatarMode: "preset-avatar",
      title: "发布验收-预设数字人口播",
      contentLanguage: "zh-CN",
      sourceScript: "用一句强钩子介绍一款适合短视频创作者的自媒体视频工作台。",
      shortScript:
        "如果你每天都要做短视频，这套工作台可以把文案、数字人、字幕和封面放进一条流程里。",
      coverTitle: "数字人口播验收"
    },
    {
      generationMode: "product-avatar",
      avatarMode: "image-presenter",
      title: "发布验收-商品带货视频",
      contentLanguage: "id-ID",
      sourceScript: "Buat video pendek yang menjelaskan produk skincare dengan hook kuat.",
      shortScript:
        "Produk ini cocok untuk konten demo singkat. Tampilkan manfaat utama dengan jelas dan ajak penonton mencoba.",
      importProductImage: true,
      avatarDescriptionPrompt:
        "A friendly Indonesian presenter holding the product toward camera, clean studio light, mouth clearly visible.",
      motionPrompt: "Presenter smiles, nods, and gently raises the product toward the camera.",
      coverTitle: "Produk Demo"
    },
    {
      generationMode: "image-lipsync",
      avatarMode: "image-presenter",
      title: "发布验收-图片口型同步",
      contentLanguage: "en-US",
      sourceScript: "Create a short talking head script about a creator workflow tool.",
      shortScript:
        "This workflow keeps your script, avatar video, subtitles, and cover in one place so every video is easier to finish.",
      importReferenceImage: true,
      coverTitle: "Image Lip Sync"
    },
    {
      generationMode: "personal-ip",
      avatarMode: "preset-avatar",
      title: "发布验收-个人IP视频",
      contentLanguage: "zh-CN",
      sourceScript: "以知识博主口吻讲一个短视频生产效率观点。",
      shortScript: "做个人IP最怕流程断掉。把选题、脚本、口播和封面固定下来，稳定输出才会变得容易。",
      personalIpProfile: {
        name: "发布验收知识博主",
        persona: "理性、直接、重视效率",
        tone: "像朋友一样解释复杂工具",
        catchphrases: "先跑通，再优化",
        bannedWords: "绝对, 保证"
      },
      coverTitle: "个人IP验收"
    },
    {
      generationMode: "viral-remix",
      avatarMode: "preset-avatar",
      title: "发布验收-爆款视频复刻",
      contentLanguage: "zh-CN",
      originalVideoUrl: MATERIALS.sampleVideo.url,
      sourceScript: "参考视频先用强画面吸引注意，再给出步骤和结果，最后引导保存。",
      shortScript: "先提取参考视频的结构，再换成自己的表达。这样既能保留节奏，也能避免照搬内容。",
      importSourceVideo: true,
      storyboard: true,
      coverTitle: "爆款复刻验收"
    },
    {
      generationMode: "mixed-cut",
      avatarMode: "preset-avatar",
      title: "发布验收-混剪视频",
      contentLanguage: "zh-CN",
      sourceScript: "用素材混剪方式展示一个创作者工具的生产流程。",
      shortScript:
        "先放素材，再配上清晰字幕。混剪视频不一定要真人出镜，重点是节奏、证明和信息密度。",
      importMixedMaterials: true,
      coverTitle: "混剪验收"
    },
    {
      generationMode: "video-dedup",
      avatarMode: "preset-avatar",
      title: "发布验收-视频去重处理",
      contentLanguage: "zh-CN",
      sourceScript: "对一段已有视频做内容级重构，输出原创度评分报告。",
      shortScript:
        "视频去重不是简单加滤镜。要重新组织画面、节奏、字幕和封面，用原创度评分判断是否达到内部阈值。",
      importDedupSourceVideo: true,
      coverTitle: "去重验收"
    }
  ];
}

function selectedModeCases() {
  const selectedModes = env("RELEASE_E2E_MODES")
    ?.split(",")
    .map((mode) => mode.trim())
    .filter(Boolean);
  const cases = modeCases();
  if (!selectedModes || selectedModes.length === 0) {
    return cases;
  }

  const selected = cases.filter((mode) => selectedModes.includes(mode.generationMode));
  if (selected.length === 0) {
    throw new Error(`RELEASE_E2E_MODES 没有匹配到可执行模式：${selectedModes.join(", ")}`);
  }
  return selected;
}

async function main() {
  const startedAt = new Date().toISOString();
  const testRoot = path.resolve(
    env("RELEASE_E2E_ROOT") || path.join("tmp", `release-e2e-real-${nowStamp()}`)
  );
  const appDataDir = path.join(testRoot, "app-data");
  const exportRoot = path.join(testRoot, "exports");
  const sourceAppDataDir = defaultSourceAppDataDir();
  const cases = selectedModeCases();
  fs.mkdirSync(testRoot, { recursive: true });
  fs.mkdirSync(exportRoot, { recursive: true });

  const runtime = createRuntime(appDataDir);
  const report = {
    startedAt,
    testRoot,
    appDataDir,
    sourceAppDataDir,
    exportRoot,
    selectedGenerationModes: cases.map((mode) => mode.generationMode),
    heyGenAuthMode: undefined,
    serviceChecks: [],
    avatarCatalog: undefined,
    modes: [],
    failures: []
  };

  try {
    await prepareConfigurations(sourceAppDataDir, runtime, cases);
    await ensureReleaseAsrConfiguration(runtime, cases);
    report.heyGenAuthMode =
      runtime.serviceRepository.getConfiguration("heygen").settings.authMode || "api-key";
    report.heyGenGenerationRoute =
      runtime.serviceRepository.getConfiguration("heygen").settings.generationRoute || "auto";
    const services = createServices(runtime);
    report.serviceChecks = await runServiceChecks(runtime, cases);
    const needsHeyGen = cases.some(requiresHeyGen);
    const avatarCatalog = needsHeyGen
      ? await selectAvatar(runtime, services)
      : { looks: [], selected: { id: "", groupId: "", name: "" } };
    report.avatarCatalog = needsHeyGen
      ? {
          count: avatarCatalog.looks.length,
          selected: {
            id: avatarCatalog.selected.id,
            groupId: avatarCatalog.selected.groupId,
            name: avatarCatalog.selected.name,
            hasPreviewImage: Boolean(avatarCatalog.selected.previewImageUrl),
            hasPreviewVideo: Boolean(avatarCatalog.selected.previewVideoUrl),
            hasDefaultVoice: Boolean(avatarCatalog.selected.defaultVoiceId)
          }
        }
      : {
          count: 0,
          skipped: "selected modes do not require HeyGen"
        };
    const materials = await prepareMaterials(testRoot);

    for (const mode of cases) {
      const modeStartedAt = new Date().toISOString();
      try {
        const result = await runMode(
          runtime,
          services,
          materials,
          exportRoot,
          avatarCatalog.selected,
          mode
        );
        report.modes.push({
          ...result,
          startedAt: modeStartedAt,
          finishedAt: new Date().toISOString()
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failure = {
          mode: mode.generationMode,
          title: mode.title,
          startedAt: modeStartedAt,
          failedAt: new Date().toISOString(),
          message,
          externalAccountBlocker: classifyExternalBlocker(message)
        };
        report.failures.push(failure);
        report.modes.push({ ok: false, ...failure });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.failures.push({
      stage: "setup",
      failedAt: new Date().toISOString(),
      message,
      externalAccountBlocker: classifyExternalBlocker(message)
    });
  } finally {
    report.finishedAt = new Date().toISOString();
    report.ok = report.failures.length === 0 && report.modes.length === cases.length;
    const reportPath = path.join(testRoot, "release-e2e-real-report.json");
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    closeRuntime(runtime);
    console.log(JSON.stringify({ ok: report.ok, reportPath, failures: report.failures }, null, 2));
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

function classifyExternalBlocker(message) {
  if (/insufficient credit|api credits|requires 'api' credits/i.test(message)) {
    return "heygen-api-credits";
  }
  if (/unauthorized|forbidden|invalid api key|invalid token/i.test(message)) {
    return "credential-auth";
  }
  if (/quota|rate limit|billing/i.test(message)) {
    return "provider-quota-or-billing";
  }
  return undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
