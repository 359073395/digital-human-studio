# ADR 0023: Save And Test Service Configurations

## Status

Accepted

## Context

Users configure several API-backed services in the desktop settings modal. A local-only configuration check was not enough because users need immediate feedback after entering a Base URL, model name, and API Key.

## Decision

Saving a service configuration now immediately runs the same connection test as the manual check button and displays the result in that provider card.

The LLM provider uses the same `POST /chat/completions` endpoint that script generation uses, with a tiny `ping` request. This avoids false failures from relays that can generate chat completions but do not expose `GET /models`.

Image generation does not run full generation during settings checks because that can consume credits. It still tries a lightweight `GET /models` request to catch obvious auth or network failures, but a missing/unsupported models endpoint is treated as an informational result instead of a hard failure.

ASR checks must judge actual transcription support. When standalone ASR is enabled, the app sends a tiny generated WAV file to `POST /audio/transcriptions` with the configured ASR model. When standalone ASR is disabled, the app reuses the saved LLM Base URL, model, and API Key for the same tiny transcription probe. A model is only reported as reusable for ASR after that request succeeds.

HeyGen uses the existing `GET /v3/avatars/looks?limit=1` path. The app normalizes HeyGen Base URLs by stripping accidental `/v1`, `/v2`, or `/v3` suffixes before calling v3 endpoints. If the API is reachable but no task-ready Avatar ID is configured, the result reports that separately so generation preflight can still block incomplete HeyGen setup.

All returned error bodies are truncated and passed through secret redaction before being shown in the UI.

## Consequences

- Users see a test result immediately after saving an API configuration.
- The manual check button now performs a real provider request instead of only checking local fields.
- Generation preflight can reuse the same result shape for clear failure messages.
- Some image relays can still fail later at generation time even if settings check passes, because the MVP avoids spending image credits during settings checks.
- ASR settings checks now spend only a minimal transcription request and return a hard failure if the selected model cannot handle `audio/transcriptions`.
