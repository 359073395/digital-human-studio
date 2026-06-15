import {
  PROVIDER_DEFINITIONS,
  defaultServiceSettings,
  getProviderDefinition,
  type ProviderId,
  type SaveServiceConfigurationInput,
  type ServiceConfiguration,
  type ServiceConfigurationSettings,
  type ServiceConnectionCheck
} from "../../shared/serviceConfig";
import type { CredentialStore } from "./credentialStore";
import type { TaskDatabase } from "./database";

interface ServiceConfigurationRow {
  provider_id: ProviderId;
  settings_json: string;
  updated_at: string;
}

export class ServiceConfigurationRepository {
  constructor(
    private readonly database: TaskDatabase,
    private readonly credentialStore: CredentialStore
  ) {}

  listConfigurations(): ServiceConfiguration[] {
    return PROVIDER_DEFINITIONS.map((definition) => this.getConfiguration(definition.id));
  }

  getConfiguration(providerId: ProviderId): ServiceConfiguration {
    const definition = getProviderDefinition(providerId);
    const row = this.database
      .prepare("SELECT * FROM service_configurations WHERE provider_id = ?")
      .get(providerId) as unknown as ServiceConfigurationRow | undefined;
    const settings = row
      ? (JSON.parse(row.settings_json) as ServiceConfigurationSettings)
      : defaultServiceSettings(providerId);

    return {
      providerId,
      label: definition.label,
      kind: definition.kind,
      settings,
      credentialConfigured: this.credentialStore.hasCredential(providerId),
      updatedAt: row?.updated_at ?? new Date(0).toISOString()
    };
  }

  async saveConfiguration(input: SaveServiceConfigurationInput): Promise<ServiceConfiguration> {
    const definition = getProviderDefinition(input.providerId);
    const now = new Date().toISOString();
    const settings = {
      ...defaultServiceSettings(input.providerId),
      ...sanitizeSettings(input.settings)
    };

    this.database
      .prepare(
        `INSERT INTO service_configurations (provider_id, settings_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(provider_id) DO UPDATE SET
           settings_json = excluded.settings_json,
           updated_at = excluded.updated_at`
      )
      .run(input.providerId, JSON.stringify(settings), now);

    if (input.apiKey !== undefined && definition.requiresCredential) {
      await this.credentialStore.saveCredential(input.providerId, input.apiKey);
    }

    return this.getConfiguration(input.providerId);
  }

  async clearCredential(providerId: ProviderId): Promise<ServiceConfiguration> {
    await this.credentialStore.clearCredential(providerId);
    return this.getConfiguration(providerId);
  }

  testConfiguration(providerId: ProviderId): ServiceConnectionCheck {
    const configuration = this.getConfiguration(providerId);
    const definition = getProviderDefinition(providerId);

    if (definition.requiresCredential && !configuration.credentialConfigured) {
      return {
        providerId,
        ok: false,
        message: `${definition.label} API Key 尚未配置`
      };
    }

    if (configuration.settings.enabled === false) {
      return {
        providerId,
        ok: false,
        message: `${definition.label} 当前未启用`
      };
    }

    if (providerId === "heygen" && !configuration.settings.avatarId?.trim()) {
      return {
        providerId,
        ok: false,
        message: "HeyGen Avatar ID 尚未配置"
      };
    }

    return {
      providerId,
      ok: true,
      message: `${definition.label} 本地配置检查通过`
    };
  }
}

function sanitizeSettings(settings: ServiceConfigurationSettings): ServiceConfigurationSettings {
  const sanitized: ServiceConfigurationSettings = {};

  if (settings.baseUrl !== undefined) {
    sanitized.baseUrl = settings.baseUrl.trim();
  }

  if (settings.modelName !== undefined) {
    sanitized.modelName = settings.modelName.trim();
  }

  if (settings.avatarId !== undefined) {
    sanitized.avatarId = settings.avatarId.trim();
  }

  if (settings.voiceId !== undefined) {
    sanitized.voiceId = settings.voiceId.trim();
  }

  if (settings.resolution !== undefined) {
    sanitized.resolution = sanitizeResolution(settings.resolution);
  }

  if (settings.enabled !== undefined) {
    sanitized.enabled = settings.enabled;
  }

  return sanitized;
}

function sanitizeResolution(
  resolution: ServiceConfigurationSettings["resolution"]
): ServiceConfigurationSettings["resolution"] {
  return resolution === "720p" || resolution === "1080p" || resolution === "4k"
    ? resolution
    : undefined;
}
