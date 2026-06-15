# Use OpenAI-Compatible Script Generation

The MVP will connect script generation through an OpenAI-compatible Chat Completions provider behind the `ScriptProvider` interface. This lets the app use OpenAI directly or an API relay with the same request shape while keeping the renderer away from API keys and network calls.

The provider reads the local LLM service configuration and API key in the Electron main process, builds an originality-focused prompt, and expects JSON output with `finalScript`, `similarityRisk`, and `notes`. The prompt preserves viral structure mechanics while requiring original wording, examples, proof, rhythm, and hook expression.

If the LLM provider is disabled or no API key is configured, the workflow uses the mock script provider so the development vertical slice remains runnable. If a real provider is configured and the request or response parsing fails, the script step becomes retry-ready and exposes a redacted error instead of silently producing mock output.

This keeps the first implementation flexible across model vendors while preserving the product boundary that viral references are used for structure, not copied expression.
