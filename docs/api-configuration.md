# API Configuration

The desktop app stores service settings locally. API keys are saved in the encrypted local credential store, while Base URL, model name, optional default Avatar ID, Voice ID, and resolution are saved as non-secret settings.

The credential store lives under the app data directory, for example `D:\Codex\2026-06-13\digital-human-studio\data\credentials`. This directory is ignored by Git. Keep it with your project backup if you want the configured accounts to keep working after moving the project to another machine; otherwise you can re-enter keys in the settings modal.

## Workflow Stage Requirements

The generation screen shows a compact flow guide for the active task. It lists whether each stage will use a service, which model or ID is configured, and whether the API Key is present. It never displays the API Key value.

| Stage                                 | Service                             | Required setting                                                                                            |
| ------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Source extraction/material extraction | ASR, OpenAI-compatible              | Base URL, ASR model, API Key when transcription is needed                                                   |
| Analysis and script generation        | LLM, OpenAI-compatible              | Base URL, chat model, API Key                                                                               |
| Product presenter image generation    | Image generation, OpenAI-compatible | Base URL, image model, API Key                                                                              |
| Lip-synced avatar video               | HeyGen                              | Base URL, API Key, task-selected preset avatar or optional default Avatar ID, optional Voice ID, resolution |
| Subtitle fallback                     | ASR or reusable LLM audio support   | Real `audio/transcriptions` support, only when HeyGen subtitles are unavailable                             |
| External audio                        | Optional TTS or uploaded audio      | Not required for the default MVP path                                                                       |
| Export                                | Local desktop app                   | Save directory, no API Key                                                                                  |

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
  - Model name: transcription model supported by the relay. ASR is optional in the MVP; leave it disabled if you want the app to test whether the LLM model can also handle audio transcription.
  - API Key: relay key.

When ASR is disabled, the settings test does not guess from the model name. It reuses the saved LLM Base URL, model, and API Key, sends a tiny generated WAV file to `/audio/transcriptions`, and only reports success if the request works. If the LLM model cannot transcribe audio, enable `ASR 转写（OpenAI 兼容）` and enter a model that your relay exposes for audio transcription.

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

- Base URL should normally be `https://api.heygen.com`. If the user enters `/v1`, `/v2`, or `/v3`, the app normalizes it back to the HeyGen API root before calling v3 endpoints.
- Enter a new HeyGen API Key and save to replace the previous key.
- Leave the API Key field empty and save to keep the previous key.
- Saving or checking a valid HeyGen API Key automatically reads the account's preset avatar list. Choose the avatar in the video task.
- The settings Avatar ID is only an optional default fallback. You do not need to fill it when configuring the API.
- When switching HeyGen accounts, refresh the preset avatar list and update Voice ID if you use a specific voice.

The MVP stores one active HeyGen configuration at a time.

`一键输出视频和封面` runs the real API workflow and requires a HeyGen account with API credits. For product/commerce mode, it may also require the image-generation provider before HeyGen rendering starts.

PowerShell setup example:

```powershell
$env:DHS_APP_DATA_DIR="D:\Codex\2026-06-13\digital-human-studio\data"
$env:HEYGEN_API_KEY="your-heygen-key"
$env:HEYGEN_AVATAR_ID="optional-default-avatar-id"
$env:HEYGEN_VOICE_ID="your-voice-id"
$env:HEYGEN_RESOLUTION="720p"
npm run configure:services
```
