# Digital Human Studio MVP Implementation Plan

## Goal

Build the MVP described in `docs/superpowers/specs/2026-06-14-digital-human-studio-design.md`: a Windows desktop app that can create a video task, generate an original script, render real HeyGen digital-human output, add post-production assets, and export a generic publishing package.

The implementation should first prove the full workflow with mocks, then replace mocks with real providers and packaging.

## Guardrails

- Keep the renderer isolated from Node APIs.
- Route all filesystem, credential, provider, SQLite, and FFmpeg work through the main process.
- Preserve the domain language in `CONTEXT.md`.
- Do not implement platform-link scraping, auto-publishing, batch-first UI, mixed-cut editing, custom digital twin creation, or cost-saving avatar reuse in the MVP.
- Do not store API keys in SQLite, logs, renderer state, or task files.
- Do not commit large generated media, local credentials, SQLite databases, or bundled binary artifacts unless a later packaging step explicitly requires tracked metadata.

## Milestone 1: App Scaffold and Desktop Shell

Tasks:

- Create an Electron + React + TypeScript project structure.
- Add a Vite-based renderer build.
- Add Electron main and preload entry points.
- Add linting, formatting, typecheck, and test scripts.
- Add a minimal Chinese app shell with three panes: task list, task editor, preview/status.
- Add typed IPC boundaries for renderer-to-main calls.
- Add a basic settings route or modal placeholder.

Deliverables:

- `npm install` or equivalent succeeds.
- Desktop app launches in development mode.
- Renderer has no direct Node access.
- Main/preload/renderer TypeScript builds.

Verification:

- Run typecheck.
- Run dev app locally.
- Confirm the workbench shell renders.

## Milestone 2: Domain Model, Storage, and Asset Layout

Tasks:

- Define shared domain types for `VideoTask`, `GenerationStep`, `StepStatus`, `OutputPreset`, `OutputVariant`, `MediaAsset`, and `PublishingPackage`.
- Add SQLite schema and migration mechanism.
- Add task repository APIs in the main process.
- Add app-data path resolution.
- Add task folder creation under the app data directory.
- Add media asset path conventions for source, avatar, subtitles, post, and exports.
- Add a seed/mock task for development.

Deliverables:

- Tasks can be created, listed, loaded, and updated.
- Step statuses persist across app restarts.
- Media folders are created per task.

Verification:

- Unit tests for state transitions.
- Integration tests for SQLite read/write.
- Manual restart test confirms task data persists.

## Milestone 3: Local Configuration and Credentials

Tasks:

- Implement service configuration models for HeyGen, LLM, ASR, optional TTS, and FFmpeg bundle metadata.
- Store API keys through Electron secure storage or an equivalent OS-backed main-process credential store.
- Store non-secret provider settings in SQLite or local settings metadata.
- Add settings UI for API Key, Base URL, model name, and provider health checks.
- Add masking and clear actions for secrets.
- Add logging rules that redact sensitive values.

Deliverables:

- User can save, test, and clear provider credentials locally.
- API keys are not visible in SQLite or logs.

Verification:

- Unit tests for redaction helpers.
- Integration test for secure credential save/load with mock secret values.
- Manual SQLite inspection confirms no secrets are stored in task metadata.

## Milestone 4: Mock Workflow Vertical Slice

Tasks:

- Implement a workflow runner that executes generation steps with persisted status.
- Add mock LLM, mock avatar provider, mock ASR, and mock FFmpeg renderer.
- Wire the UI to run the full task flow using mocks.
- Add single-step retry for failed mock steps.
- Add output variant creation for portrait by default and optional landscape.
- Add layered previews using mock artifacts.
- Add publishing package manifest generation.

Deliverables:

- A user can create a task and run it end-to-end without real API keys.
- The mock flow creates placeholder media files and a publishing package folder.
- Failed mock steps can be retried without restarting the task.

Verification:

- E2E test for the mock full workflow.
- E2E test for single-step retry.
- Manual test for portrait-only and portrait-plus-landscape tasks.

## Milestone 5: Script Generation and Source Transcription

Tasks:

- Implement OpenAI-compatible LLM provider configuration.
- Build prompt templates for viral structure reuse and original expression.
- Add similarity-risk output mapping.
- Add final-script editing and locking behavior before avatar generation.
- Implement local audio/video upload as a source asset.
- Implement ASR provider for source transcription.
- Add content language and voice locale selection for Chinese, English, and Indonesian.

Deliverables:

- User can input source text or upload local media for transcription.
- User can generate and edit an original script.
- UI displays similarity risk.
- First-five-second hook wording is rewritten while hook function is retained.

Verification:

- Unit tests for prompt builders.
- Unit tests for similarity-risk parsing.
- Integration tests using mocked LLM and ASR responses.
- Manual test with one Chinese, one English, and one Indonesian script.

## Milestone 6: HeyGen Avatar Provider

Tasks:

- Implement the `AvatarProvider` interface.
- Implement HeyGen provider configuration and health check.
- Load available preset avatars and compatible voices when supported by the API.
- Submit avatar renders for each selected output preset.
- Poll status or handle completion using the supported API pattern.
- Download generated avatar videos to the task media folder.
- Support default HeyGen voice path.
- Support external audio path through uploaded audio and optional TTS-generated audio when configured.
- Map provider errors to step failures with user-readable messages.

Deliverables:

- One portrait native avatar render can be generated from a real HeyGen account.
- One task can produce portrait and landscape native avatar renders.
- Provider failures are visible and retryable.

Verification:

- Integration tests with mocked HeyGen responses.
- Manual real HeyGen test for portrait.
- Manual real HeyGen test for portrait plus landscape.

## Milestone 7: Subtitle Timing and Post-Production Assets

Tasks:

- Ingest provider-supplied subtitle timing when available.
- Run ASR fallback on generated avatar video when provider timing is unavailable.
- Generate subtitle files for each output variant.
- Add subtitle style controls for MVP-safe defaults.
- Implement title treatment settings.
- Implement cover image generation from selected video frame plus title.
- Allow user cover replacement.
- Allow local BGM import or no BGM.
- Add BGM volume, trimming, and loop behavior.

Deliverables:

- Each output variant has subtitle timing.
- Each output variant has a cover image.
- User can choose no BGM or import local BGM.

Verification:

- Unit tests for subtitle conversion.
- Integration tests for ASR fallback mapping.
- Manual visual check for subtitle placement in portrait and landscape.

## Milestone 8: FFmpeg Rendering and Publishing Package Export

Tasks:

- Integrate FFmpeg invocation in the main process.
- Use controlled argument arrays rather than shell-built command strings.
- Render finished videos with subtitles, title treatment, optional BGM, and expected output preset.
- Generate a generic publishing package for each output variant.
- Include title, description, tag suggestions, publishing notes, cover image, and finished video.
- Add export folder opening from the UI.
- Add render progress and error reporting when available.

Deliverables:

- Finished MP4 output for portrait.
- Finished MP4 output for landscape.
- Generic publishing package folder is created.

Verification:

- Integration tests for FFmpeg command construction.
- Manual render test with no BGM.
- Manual render test with local BGM.
- Manual export package inspection.

## Milestone 9: Windows Packaging and FFmpeg Compliance

Tasks:

- Add Windows installer packaging.
- Bundle a known FFmpeg build selected for the release strategy.
- Include FFmpeg license, build information, and source/build notices required by the selected distribution.
- Add app About or legal information entry.
- Confirm installer creates expected app data directories.
- Confirm uninstall does not unexpectedly delete user media unless explicitly requested by the user.

Deliverables:

- Windows installer builds successfully.
- Installed app launches and can run the MVP workflow.
- FFmpeg legal files are included.

Verification:

- Install on Windows.
- Run mock workflow from installed app.
- Run one real HeyGen workflow from installed app.
- Inspect packaged license files.

## Milestone 10: MVP Acceptance Pass

Tasks:

- Run the full acceptance checklist from the design spec.
- Fix blocking issues found during real-provider tests.
- Add concise README with setup, API configuration, FFmpeg/legal note, and MVP limitations.
- Tag or commit the accepted MVP state.

Acceptance checklist:

- Configure API keys locally.
- Create a video task.
- Enter Chinese, English, or Indonesian source script.
- Generate original script with similarity risk shown.
- Select HeyGen preset avatar and voice.
- Generate portrait by default.
- Optionally generate landscape in the same task.
- Produce subtitle timing via provider or ASR fallback.
- Generate title treatment and cover image.
- Optionally import local BGM.
- Render finished video with FFmpeg.
- Export generic publishing package.
- Retry failed step without restarting the task.
- Run from Windows installer.

## Suggested Implementation Order

1. Scaffold the app and secure IPC.
2. Add domain model, SQLite, and task folders.
3. Add local credentials and settings.
4. Build the mock full workflow.
5. Add real LLM and ASR.
6. Add real HeyGen.
7. Add subtitles, cover, BGM, and FFmpeg render.
8. Add installer and FFmpeg compliance files.
9. Run acceptance and fix defects.

This order keeps a working vertical slice alive while replacing mocks with real integrations.

## Risks

- HeyGen API field names, status behavior, caption support, or aspect-ratio options may differ from assumptions. Verify official docs during provider implementation.
- Bundled FFmpeg compliance depends on the exact binary build and enabled flags.
- Electron native SQLite packages may require rebuild or packaging configuration.
- Long-running provider steps need careful cancellation and retry semantics.
- External API costs can increase quickly when generating portrait and landscape native renders.

## Open Implementation Decisions

- Exact Electron scaffolding tool and packaging plugin.
- SQLite Node binding resolved for the MVP in `docs/adr/0006-use-node-sqlite-for-mvp-storage.md`.
- Exact FFmpeg binary source and compliance packaging method.
- OpenAI audio transcriptions are the first ASR provider for subtitle fallback.
- Exact optional TTS provider for external audio generation.

These should be decided during implementation after checking current official package docs and compatibility with the chosen Electron runtime.
