# ADR 0031: Add Local HeyGen OAuth Callback

HeyGen member/subscription generation should not require users to paste callback URLs into the desktop app every time. Manual copy/paste also makes it easy to confuse an API key with an OAuth access token.

The desktop app now supports a local one-click OAuth flow for HeyGen member authorization. The main process starts a temporary HTTP server on the configured localhost Redirect URI, opens the HeyGen authorization URL, validates the returned `state`, exchanges the `code` for a token bundle, and stores that bundle in the encrypted credential store.

The default Redirect URI is:

```text
http://127.0.0.1:53682/heygen/oauth/callback
```

Users must register this exact Redirect URI in their HeyGen OAuth app. If the OAuth app does not allow a localhost redirect, the manual fallback remains available: open the authorization page, paste the callback URL or code, and complete authorization.

This keeps OAuth tokens out of the renderer, SQLite, Git, and logs. The renderer only receives the final connection test result.
