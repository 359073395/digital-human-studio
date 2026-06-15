# API Configuration

The desktop app stores service settings locally. API keys are saved in the local credential store, while Base URL, model name, Avatar ID, Voice ID, and resolution are saved as non-secret settings.

## OpenAI-Compatible Relay

Use the same relay API key for any OpenAI-compatible services your relay supports.

Configure these providers in the app settings:

- `大模型（OpenAI 兼容）`
  - Base URL: relay address, usually ending in `/v1`.
  - Model name: chat model supported by the relay.
  - API Key: relay key.
- `图片生成（OpenAI 兼容）`
  - Base URL: relay address, usually ending in `/v1`.
  - Model name: image model supported by the relay.
  - API Key: relay key.
- `ASR 转写（OpenAI 兼容）`
  - Base URL: relay address, usually ending in `/v1`.
  - Model name: transcription model supported by the relay.
  - API Key: relay key.

If the relay uses different keys for chat, image, or ASR, save each provider with its own key.

## HeyGen

HeyGen can be replaced directly from the settings modal:

- Enter a new HeyGen API Key and save to replace the previous key.
- Leave the API Key field empty and save to keep the previous key.
- When switching HeyGen accounts, also update Avatar ID and Voice ID because they are account-specific.

The MVP stores one active HeyGen configuration at a time.
