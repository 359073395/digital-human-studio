import { defaultServiceSettings, type ServiceConfiguration } from "../../shared/serviceConfig";

export function buildHeyGenAuthHeaders(
  configuration: ServiceConfiguration,
  credential: string
): Record<string, string> {
  const authMode = configuration.settings.authMode ?? defaultServiceSettings("heygen").authMode;
  if (authMode === "oauth-bearer") {
    return {
      authorization: `Bearer ${credential}`
    };
  }

  return {
    "x-api-key": credential
  };
}

export function heyGenCredentialLabel(configuration: ServiceConfiguration): string {
  return (configuration.settings.authMode ?? defaultServiceSettings("heygen").authMode) ===
    "oauth-bearer"
    ? "HeyGen OAuth/Bearer Token"
    : "HeyGen API Key";
}
