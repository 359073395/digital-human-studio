# ADR 0023: Save And Test Service Configurations

## Status

Accepted

## Context

Users configure several API-backed services in the desktop settings modal. A local-only configuration check was not enough because users need immediate feedback after entering a Base URL, model name, and API Key.

## Decision

Saving a service configuration now immediately runs the same connection test as the manual check button and displays the result in that provider card.

The LLM provider uses the same `POST /chat/completions` endpoint that script generation uses, with a tiny `ping` request. This avoids false failures from relays that can generate chat completions but do not expose `GET /models`.

Image generation and ASR do not run full generation during settings checks because that can consume credits and requires media files. They still try a lightweight `GET /models` request to catch obvious auth or network failures, but a missing/unsupported models endpoint is treated as an informational result instead of a hard failure.

HeyGen uses the existing `GET /v3/avatars/looks?limit=1` path. If the API is reachable but no task-ready Avatar ID is configured, the result reports that separately so generation preflight can still block incomplete HeyGen setup.

All returned error bodies are truncated and passed through secret redaction before being shown in the UI.

## Consequences

- Users see a test result immediately after saving an API configuration.
- The manual check button now performs a real provider request instead of only checking local fields.
- Generation preflight can reuse the same result shape for clear failure messages.
- Some image/ASR relays can still fail later at generation time even if settings check passes, because the MVP avoids spending credits during settings checks.
