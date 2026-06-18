# ADR 0023: Save And Test Service Configurations

## Status

Accepted

## Context

Users configure several API-backed services in the desktop settings modal. A local-only configuration check was not enough because users need immediate feedback after entering a Base URL, model name, and API Key.

## Decision

Saving a service configuration now immediately runs the same connection test as the manual check button and displays the result in that provider card.

OpenAI-compatible providers use a lightweight `GET /models` request with the saved API Key. When the configured model name is present in the returned model list, the provider is marked as usable. If the endpoint is reachable but the model is absent, the result tells the user to check the model name.

HeyGen uses the existing `GET /v3/avatars/looks?limit=1` path. If the API is reachable but no task-ready Avatar ID is configured, the result reports that separately so generation preflight can still block incomplete HeyGen setup.

All returned error bodies are truncated and passed through secret redaction before being shown in the UI.

## Consequences

- Users see a test result immediately after saving an API configuration.
- The manual check button now performs a real provider request instead of only checking local fields.
- Generation preflight can reuse the same result shape for clear failure messages.
- Some OpenAI-compatible relays that do not expose `/models` may fail the test even if a specific generation endpoint works; that is an acceptable MVP trade-off because it avoids test-time content generation cost.
