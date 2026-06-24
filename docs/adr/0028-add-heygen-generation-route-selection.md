# Add HeyGen Generation Route Selection

The app must distinguish HeyGen account authentication from HeyGen video-generation entitlement. A HeyGen account can have subscription credits that work through the HeyGen MCP/OAuth member flow, while a plain API Key direct REST call can still fail with an API-credits error.

We now store a non-secret `generationRoute` setting for HeyGen:

- `auto`
- `direct-video`
- `video-agent`

`direct-video` uses `POST /v3/videos` for deterministic script-to-lip-sync rendering. `video-agent` uses `POST /v3/video-agents`, then polls the Video Agent session and the final video. In `auto`, member/Bearer authentication prefers Video Agent; API Key authentication starts with Direct Video and falls back to Video Agent only when Direct Video reports that API credits are required.

The settings test remains a connection and catalog-read test. It can confirm the account and avatar list, and it now explains when the saved credential looks like an API Key even though the UI is set to member/Bearer mode. It does not silently claim that every generation route has enough credits, because that would require consuming video-generation credits during configuration.

The renderer only sees the route label, credential-present status, Avatar IDs, Voice ID, and resolution. Secret API Keys and Bearer tokens remain in the local encrypted credential store.
