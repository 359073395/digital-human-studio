# ADR 0030: Reject API Key In HeyGen OAuth Mode

HeyGen API keys and HeyGen member OAuth tokens are different credentials. An API key can read account data but still require separate API credits for video generation. A member OAuth access token is the intended credential for the member/subscription route.

The app now rejects a `sk_`-looking value when HeyGen is configured as `会员/OAuth Token`. It also refuses to treat an already-saved `sk_` value as a successful OAuth credential during connection testing.

This keeps settings honest:

- API-credit accounts should use `API Key`.
- Member/subscription accounts should complete OAuth authorization or paste a real Bearer token.
- A settings test must not show a false connected state that later fails during generation with `insufficient API credits`.

Local cleanup performed for development data: the stale HeyGen API-key-like credential was cleared from the local encrypted credential store, while OAuth endpoint defaults and existing non-secret Avatar/Voice defaults were preserved.
