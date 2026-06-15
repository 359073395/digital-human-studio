const path = require("node:path");
const { app } = require("electron");
const { createAppPaths, ensureAppPaths } = require("../dist-electron/main/storage/appPaths");
const {
  CredentialStore,
  createCredentialFilePath
} = require("../dist-electron/main/storage/credentialStore");
const { openTaskDatabase, runMigrations } = require("../dist-electron/main/storage/database");
const { SafeStorageCipher } = require("../dist-electron/main/storage/safeStorageCipher");
const {
  ServiceConfigurationRepository
} = require("../dist-electron/main/storage/serviceConfigurationRepository");

function env(name) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function mergeSettings(current, patch) {
  return {
    ...current,
    ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
  };
}

async function saveProvider(repository, providerId, settingsPatch, apiKey) {
  const current = repository.getConfiguration(providerId);
  return repository.saveConfiguration({
    providerId,
    settings: mergeSettings(current.settings, settingsPatch),
    apiKey
  });
}

async function main() {
  await app.whenReady();

  const appDataDir = env("DHS_APP_DATA_DIR") || path.join(process.cwd(), "data");
  const paths = createAppPaths(appDataDir);
  ensureAppPaths(paths);

  const database = openTaskDatabase(paths.databasePath);
  runMigrations(database);

  const credentialStore = new CredentialStore(
    createCredentialFilePath(appDataDir),
    new SafeStorageCipher()
  );
  const repository = new ServiceConfigurationRepository(database, credentialStore);

  const openAiBaseUrl = env("OPENAI_COMPAT_BASE_URL");
  const openAiApiKey = env("OPENAI_COMPAT_API_KEY");

  const saved = [];
  saved.push(
    await saveProvider(
      repository,
      "heygen",
      {
        baseUrl: env("HEYGEN_BASE_URL"),
        avatarId: env("HEYGEN_AVATAR_ID"),
        voiceId: env("HEYGEN_VOICE_ID"),
        resolution: env("HEYGEN_RESOLUTION"),
        enabled: true
      },
      env("HEYGEN_API_KEY")
    )
  );
  saved.push(
    await saveProvider(
      repository,
      "llm",
      {
        baseUrl: env("LLM_BASE_URL") || openAiBaseUrl,
        modelName: env("LLM_MODEL"),
        enabled: true
      },
      env("LLM_API_KEY") || openAiApiKey
    )
  );
  saved.push(
    await saveProvider(
      repository,
      "image",
      {
        baseUrl: env("IMAGE_BASE_URL") || openAiBaseUrl,
        modelName: env("IMAGE_MODEL"),
        enabled: true
      },
      env("IMAGE_API_KEY") || openAiApiKey
    )
  );
  saved.push(
    await saveProvider(
      repository,
      "asr",
      {
        baseUrl: env("ASR_BASE_URL") || openAiBaseUrl,
        modelName: env("ASR_MODEL"),
        enabled: true
      },
      env("ASR_API_KEY") || openAiApiKey
    )
  );

  const summary = saved.map((configuration) => ({
    providerId: configuration.providerId,
    credentialConfigured: configuration.credentialConfigured,
    settings: configuration.settings
  }));

  database.close();
  console.log(JSON.stringify({ appDataDir, providers: summary }, null, 2));
  app.quit();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  app.exit(1);
});
