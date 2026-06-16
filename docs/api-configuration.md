# API Configuration

The desktop app stores service settings locally. API keys are saved in the encrypted local credential store, while Base URL, model name, Avatar ID, Voice ID, and resolution are saved as non-secret settings.

The credential store lives under the app data directory, for example `D:\Codex\2026-06-13\digital-human-studio\data\credentials`. This directory is ignored by Git. Keep it with your project backup if you want the configured accounts to keep working after moving the project to another machine; otherwise you can re-enter keys in the settings modal.

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

PowerShell setup example:

```powershell
$env:DHS_APP_DATA_DIR="D:\Codex\2026-06-13\digital-human-studio\data"
$env:OPENAI_COMPAT_BASE_URL="https://your-relay.example.com/v1"
$env:OPENAI_COMPAT_API_KEY="your-relay-key"
$env:LLM_MODEL="your-chat-model"
$env:IMAGE_MODEL="your-image-model"
$env:ASR_MODEL="your-transcription-model"
npm run configure:services
```

Provider-specific overrides are also supported:

- `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`
- `IMAGE_BASE_URL`, `IMAGE_MODEL`, `IMAGE_API_KEY`
- `ASR_BASE_URL`, `ASR_MODEL`, `ASR_API_KEY`

## HeyGen

HeyGen can be replaced directly from the settings modal:

- Enter a new HeyGen API Key and save to replace the previous key.
- Leave the API Key field empty and save to keep the previous key.
- When switching HeyGen accounts, also update Avatar ID and Voice ID because they are account-specific.

The MVP stores one active HeyGen configuration at a time.

PowerShell setup example:

```powershell
$env:DHS_APP_DATA_DIR="D:\Codex\2026-06-13\digital-human-studio\data"
$env:HEYGEN_API_KEY="your-heygen-key"
$env:HEYGEN_AVATAR_ID="your-avatar-id"
$env:HEYGEN_VOICE_ID="your-voice-id"
$env:HEYGEN_RESOLUTION="720p"
npm run configure:services
```
