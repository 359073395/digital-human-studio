export type ProviderId = "heygen" | "source-parser" | "llm" | "image" | "video" | "asr" | "tts";

export type HeyGenAuthMode = "api-key" | "oauth-bearer";

export type ProviderKind =
  | "avatar"
  | "source-parser"
  | "language-model"
  | "image-generation"
  | "video-generation"
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
  authMode?: HeyGenAuthMode;
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

export interface ListServiceModelsInput {
  providerId: ProviderId;
  settings: ServiceConfigurationSettings;
  apiKey?: string;
}

export interface ServiceConnectionCheck {
  providerId: ProviderId;
  ok: boolean;
  message: string;
}

export interface ServiceModelList {
  providerId: ProviderId;
  ok: boolean;
  models: string[];
  message: string;
}

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "heygen",
    kind: "avatar",
    label: "数字人模型（HeyGen）",
    description: "数字人口型同步视频服务",
    requiresCredential: true
  },
  {
    id: "source-parser",
    kind: "source-parser",
    label: "原视频解析下载",
    description: "通过影链工坊 API 解析并下载抖音、TikTok、YouTube 等原视频素材",
    requiresCredential: true
  },
  {
    id: "llm",
    kind: "language-model",
    label: "大模型（OpenAI 兼容）",
    description: "文案结构分析与原创脚本生成，支持 OpenAI 兼容中转",
    requiresCredential: true
  },
  {
    id: "image",
    kind: "image-generation",
    label: "图片生成（OpenAI 兼容）",
    description: "人物商品图生成与商品图编辑，支持 OpenAI 兼容中转",
    requiresCredential: true
  },
  {
    id: "video",
    kind: "video-generation",
    label: "生视频模型（OpenAI 兼容）",
    description: "故事板生视频、图片生视频等服务，例如 Seedance、即梦、可灵、Runway",
    requiresCredential: true
  },
  {
    id: "asr",
    kind: "speech-to-text",
    label: "ASR 转写（OpenAI 兼容）",
    description: "源音视频转写和字幕兜底，支持 OpenAI 兼容中转",
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
      return {
        baseUrl: "https://api.heygen.com",
        authMode: "api-key",
        resolution: "720p",
        enabled: true
      };
    case "source-parser":
      return { baseUrl: "https://jiexi.hyjiexi.eu.org", enabled: false };
    case "llm":
      return { baseUrl: "https://api.openai.com/v1", modelName: "gpt-4.1-mini", enabled: true };
    case "image":
      return { baseUrl: "https://api.openai.com/v1", modelName: "gpt-image-2", enabled: true };
    case "video":
      return {
        baseUrl: "",
        modelName: "",
        enabled: false
      };
    case "asr":
      return { baseUrl: "https://api.openai.com/v1", modelName: "", enabled: false };
    case "tts":
      return { baseUrl: "", modelName: "", enabled: false };
  }
}
