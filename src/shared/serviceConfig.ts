export type ProviderId = "heygen" | "llm" | "image" | "asr" | "tts";

export type ProviderKind =
  | "avatar"
  | "language-model"
  | "image-generation"
  | "speech-to-text"
  | "text-to-speech";

export interface ProviderDefinition {
  id: ProviderId;
  kind: ProviderKind;
  label: string;
  description: string;
  requiresCredential: boolean;
}

export interface ServiceConfigurationSettings {
  baseUrl?: string;
  modelName?: string;
  avatarId?: string;
  voiceId?: string;
  resolution?: "720p" | "1080p" | "4k";
  enabled?: boolean;
}

export interface ServiceConfiguration {
  providerId: ProviderId;
  label: string;
  kind: ProviderKind;
  settings: ServiceConfigurationSettings;
  credentialConfigured: boolean;
  updatedAt: string;
}

export interface SaveServiceConfigurationInput {
  providerId: ProviderId;
  settings: ServiceConfigurationSettings;
  apiKey?: string;
}

export interface ServiceConnectionCheck {
  providerId: ProviderId;
  ok: boolean;
  message: string;
}

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "heygen",
    kind: "avatar",
    label: "HeyGen",
    description: "数字人口型同步视频服务",
    requiresCredential: true
  },
  {
    id: "llm",
    kind: "language-model",
    label: "大模型",
    description: "文案结构分析与原创脚本生成",
    requiresCredential: true
  },
  {
    id: "image",
    kind: "image-generation",
    label: "OpenAI 图片",
    description: "人物商品图生成与商品图编辑",
    requiresCredential: true
  },
  {
    id: "asr",
    kind: "speech-to-text",
    label: "ASR 转写",
    description: "源音视频转写和字幕兜底",
    requiresCredential: true
  },
  {
    id: "tts",
    kind: "text-to-speech",
    label: "可选 TTS",
    description: "外部音频路径的语音生成",
    requiresCredential: false
  }
];

export function getProviderDefinition(providerId: ProviderId): ProviderDefinition {
  const definition = PROVIDER_DEFINITIONS.find((provider) => provider.id === providerId);
  if (!definition) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return definition;
}

export function defaultServiceSettings(providerId: ProviderId): ServiceConfigurationSettings {
  switch (providerId) {
    case "heygen":
      return { baseUrl: "https://api.heygen.com", resolution: "720p", enabled: true };
    case "llm":
      return { baseUrl: "https://api.openai.com/v1", modelName: "gpt-4.1-mini", enabled: true };
    case "image":
      return { baseUrl: "https://api.openai.com/v1", modelName: "gpt-image-2", enabled: true };
    case "asr":
      return { baseUrl: "", modelName: "", enabled: true };
    case "tts":
      return { baseUrl: "", modelName: "", enabled: false };
  }
}
