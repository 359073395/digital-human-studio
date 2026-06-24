# API Configuration

The desktop app stores service settings locally. API keys are saved in the encrypted local credential store, while Base URL, model name, optional default Avatar ID, Voice ID, and resolution are saved as non-secret settings.

The credential store lives under the app data directory, for example `D:\Codex\2026-06-13\digital-human-studio\data\credentials`. This directory is ignored by Git. Keep it with your project backup if you want the configured accounts to keep working after moving the project to another machine; otherwise you can re-enter keys in the settings modal.

## Workflow Stage Requirements

The generation screen shows a compact flow guide for the active task. It lists whether each stage will use a service, which model or ID is configured, and whether the API Key is present. It never displays the API Key value.

| Stage                                 | Service                             | Required setting                                                                                                                |
| ------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Source download                       | Source parser API                   | Base URL, API Key                                                                                                               |
| Source extraction/material extraction | ASR, OpenAI-compatible              | Base URL, ASR model, API Key when transcription is needed                                                                       |
| Analysis and script generation        | LLM, OpenAI-compatible              | Base URL, chat model, API Key                                                                                                   |
| Product presenter image generation    | Image generation, OpenAI-compatible | Base URL, image model, API Key                                                                                                  |
| Lip-synced avatar video               | HeyGen                              | Base URL, auth mode, generation route, task-selected preset avatar or optional default Avatar ID, optional Voice ID, resolution |
| Subtitle fallback                     | ASR or reusable LLM audio support   | Real `audio/transcriptions` support, only when HeyGen subtitles are unavailable                                                 |
| External audio                        | Optional TTS or uploaded audio      | Not required for the default MVP path                                                                                           |
| Export                                | Local desktop app                   | Save directory, no API Key                                                                                                      |

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

## Source Parser API

The `原视频解析下载` provider is used by the `下载原视频` button. When it is enabled and has a saved API Key, the app calls:

1. `POST /api/v1/jobs` with `X-API-Key`.
2. `GET /api/v1/jobs/{job_id}` until the job is completed.
3. `GET /api/v1/jobs/{job_id}/download` and stores the media under the current task's `source/` folder.

If this provider is disabled, the app falls back to direct media URL download.

Default Base URL:

```text
https://jiexi.hyjiexi.eu.org
```

PowerShell setup example:

```powershell
$env:DHS_APP_DATA_DIR="D:\Codex\2026-06-13\digital-human-studio\data"
$env:SOURCE_PARSER_BASE_URL="https://jiexi.hyjiexi.eu.org"
$env:SOURCE_PARSER_API_KEY="your-source-parser-key"
npm run configure:services
```

## HeyGen

HeyGen can be replaced directly from the settings modal:

- Base URL should normally be `https://api.heygen.com`. If the user enters `/v1`, `/v2`, or `/v3`, the app normalizes it back to the HeyGen API root before calling v3 endpoints.
- Choose the auth mode:
  - `API Key` sends `X-Api-Key` and is the right choice for accounts with HeyGen API credits.
  - `会员/OAuth Token` sends `Authorization: Bearer ...` and is intended for a real HeyGen OAuth access token. A value starting with `sk_` may still be an API Key, even if HeyGen accepts it for account reads.
- Choose the generation route:
  - `自动` uses Video Agent first when the auth mode is `会员/OAuth Token`; otherwise it uses Direct Video and falls back to Video Agent only when Direct Video reports API credits are required.
  - `Direct Video` calls `POST /v3/videos` and is the most deterministic script-to-lip-sync path, but HeyGen may require API credits.
  - `Video Agent` calls `POST /v3/video-agents` and is the route that best matches HeyGen's member/OAuth flow.
- For member/OAuth mode, enter the HeyGen OAuth Client ID and the Redirect URI that has been approved in HeyGen. The app uses the official PKCE flow:
  1. Click `打开 HeyGen 授权页`.
  2. Complete the browser authorization.
  3. Paste the final callback URL or only the `code` value into the callback field.
  4. Click `完成会员授权`.
- A successful OAuth authorization stores an encrypted local token bundle containing the access token, refresh token, and expiration time. The renderer never receives the token value, and the bundle is not stored in SQLite.
- When the OAuth access token is near expiration, the main process uses the saved refresh token to obtain a fresh access token before calling HeyGen.
- Enter a new HeyGen API Key or Bearer token and save to replace the previous credential.
- Leave the API Key field empty and save to keep the previous key.
- Saving or checking a valid HeyGen API Key automatically reads the account's preset avatar list. Choose the avatar in the video task.
- The settings Avatar ID is only an optional default fallback. You do not need to fill it when configuring the API.
- When switching HeyGen accounts, refresh the preset avatar list and update Voice ID if you use a specific voice.

The MVP stores one active HeyGen configuration at a time.

`一键输出视频和封面` runs the real API workflow. Direct Video may require HeyGen API credits; Video Agent with a true member/OAuth token should use the member/OAuth route. For product/commerce mode, it may also require the image-generation provider before HeyGen rendering starts.

PowerShell setup example:

```powershell
$env:DHS_APP_DATA_DIR="D:\Codex\2026-06-13\digital-human-studio\data"
$env:HEYGEN_API_KEY="your-heygen-key"
$env:HEYGEN_AUTH_MODE="api-key"
$env:HEYGEN_GENERATION_ROUTE="auto"
$env:HEYGEN_AVATAR_ID="optional-default-avatar-id"
$env:HEYGEN_VOICE_ID="your-voice-id"
$env:HEYGEN_RESOLUTION="720p"
npm run configure:services
```

Optional HeyGen OAuth setup fields for scripted configuration:

```powershell
$env:HEYGEN_AUTH_MODE="oauth-bearer"
$env:HEYGEN_GENERATION_ROUTE="auto"
$env:HEYGEN_OAUTH_CLIENT_ID="your-oauth-client-id"
$env:HEYGEN_OAUTH_REDIRECT_URI="your-approved-redirect-uri"
$env:HEYGEN_OAUTH_AUTHORIZE_URL="https://app.heygen.com/oauth/authorize"
$env:HEYGEN_OAUTH_TOKEN_URL="https://api2.heygen.com/v1/oauth/token"
$env:HEYGEN_OAUTH_REFRESH_TOKEN_URL="https://api2.heygen.com/v1/oauth/refresh_token"
npm run configure:services
```
