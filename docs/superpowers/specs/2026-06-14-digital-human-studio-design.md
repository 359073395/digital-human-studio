# Digital Human Studio MVP Design

## Purpose

Digital Human Studio is a Windows desktop application for generating publish-ready digital-human talking-head videos. The MVP is an API-first desktop orchestrator: the app manages scripts, tasks, media, local post-production, previews, and exports, while third-party services generate the lip-synced digital-human video.

The MVP must prove one complete path from user input to a finished video and a local publishing package.

## Product Scope

The MVP includes:

- Chinese desktop interface.
- Chinese, English, and Indonesian content generation.
- One active video task as the primary UI workflow.
- A persistent task list underneath the UI model.
- Direct source-script input.
- Local audio or video upload for transcription.
- Viral structure reuse with original expression and similarity risk warnings.
- HeyGen as the first complete avatar provider.
- HeyGen preset avatars and voices.
- Default HeyGen voice path.
- Optional external audio path.
- Portrait and landscape output presets.
- Native avatar render per selected output preset.
- Subtitles, title treatment, cover image, and optional local BGM.
- Local FFmpeg post-production.
- Generic publishing package export.
- Single-step retry for failed generation steps.
- Windows installer at MVP acceptance time.

The MVP excludes:

- Platform-link scraping.
- Automatic posting to social platforms.
- Batch generation as a primary workflow.
- Mixed-cut videos with B-roll or montage editing.
- Custom digital twin creation from uploaded human footage.
- Fully local model execution.
- Platform-specific publishing copy variants.
- Built-in music library with unclear rights.
- Cost-saving reuse of one avatar render across output presets.

## Architecture

The desktop app uses Electron, React, and TypeScript.

Renderer responsibilities:

- Display the Chinese UI.
- Manage the single-task workbench.
- Show scripts, previews, step status, errors, and export results.
- Request actions through a preload API rather than direct Node access.

Main-process responsibilities:

- Own local file access.
- Read and write SQLite task metadata.
- Store local credentials through OS-backed secure storage.
- Call FFmpeg.
- Download provider outputs.
- Expose a small, typed IPC surface to the renderer.

Provider responsibilities:

- Wrap each external API behind a boundary.
- MVP implements HeyGen as the only complete `AvatarProvider`.
- Language-model and optional TTS providers follow the same boundary style.
- Provider errors are mapped into task-step failures instead of leaking raw API behavior into UI code.

Workflow responsibilities:

- Coordinate generation steps.
- Persist step state after meaningful transitions.
- Allow single-step retry.
- Preserve user edits and completed outputs when later steps fail.

Storage responsibilities:

- SQLite stores task metadata.
- Media assets stay as files in task folders.
- API credentials are separate from task metadata.

Packaging responsibilities:

- Development builds only need to run locally.
- MVP acceptance includes a Windows installer.
- The installer bundles a known FFmpeg build with license and build information.

## User Interface

The MVP uses a single-task workbench layout:

- Left: task list, current task, history, failed tasks, new task action.
- Center: current task editing area with source script, generated script, avatar settings, output presets, and post-production settings.
- Right: layered preview, step statuses, single-step retry, similarity risk, and publishing package entry.

The main workflow is organized as:

1. Source script.
2. Original script.
3. Digital human.
4. Post-production.
5. Export.

Settings such as API keys, FFmpeg information, default output presets, and provider configuration live outside the main task flow.

## Workflow

1. The user creates a video task.
2. The user enters a source script or uploads local audio or video for transcription.
3. The app generates an original script by reusing viral structure without preserving identifiable expression.
4. The app shows similarity risk and lets the user edit the final script.
5. The user selects a preset avatar, voice path, content language, and output presets.
6. For each selected output preset, the app requests a native avatar render from HeyGen.
7. The app gets subtitle timing from the provider when available.
8. If provider subtitle timing is unavailable, the app transcribes the generated avatar video through ASR.
9. The app creates editable defaults for title treatment, cover image, subtitles, and BGM.
10. The app uses FFmpeg to render each output variant.
11. The app exports a generic publishing package.
12. Failed steps can be retried independently.

## Script Generation Rules

The script module is not a duplicate-rewrite or detection-evasion tool.

The app may preserve:

- Hook function.
- Information order.
- Emotional curve.
- Pacing density.
- CTA placement.
- Segment count and approximate duration.

The app must change:

- Specific wording.
- Sentence rhythm.
- Creator voice.
- Examples and metaphors.
- Proof material.
- Distinctive expression.
- The first-five-second hook wording.

The first five seconds preserve hook function but rewrite hook expression. The UI shows similarity risk to encourage originality, not to help evade platform checks.

## Output Presets and Variants

Each video task may select one or more output presets.

- Portrait output is selected by default.
- Landscape output can be selected in the same task.
- Each selected preset produces one output variant.
- Each output variant requests its own native HeyGen render.
- Output variants share the same source script, final script, avatar configuration, and task history.
- Output variants may have different subtitle positioning, title layout, cover image, and final file.

Cost-saving reuse of one avatar render for another aspect ratio is future scope.

## Post-Production

Post-production assets use editable defaults.

Subtitles:

- Prefer provider-supplied subtitle timing.
- Use ASR fallback when provider timing is unavailable.
- Do not use estimated timing for final output.

BGM:

- Support no BGM.
- Support local user-imported BGM.
- Do not ship a music library with unclear rights.

Cover image:

- Create from a selected video frame.
- Add title treatment.
- Generate per output variant.
- Allow user replacement.

Title and publishing copy:

- Generate one generic title, description, tag suggestion set, and publishing note set.
- Do not generate platform-specific variants in the MVP.

## Data Model

Core entities:

- `VideoTask`: one attempt to produce finished video outputs from one source script and one settings set.
- `GenerationStep`: one recoverable stage in a task.
- `OutputPreset`: portrait or landscape render target.
- `OutputVariant`: one finished video for one output preset.
- `MediaAsset`: local file used or produced by a task.
- `ServiceConfiguration`: provider settings stored locally.
- `LocalCredential`: API key or service secret stored through secure storage.

The SQLite database stores metadata such as:

- Task ID and title.
- Source script.
- Final script.
- Content language.
- Step statuses.
- Provider choices.
- Output presets.
- Output variant metadata.
- Media file paths.
- Error messages.
- Retry history.
- Created and updated timestamps.

Media files are stored under task directories, not as database blobs.

## Local File Layout

The app data directory should use a layout like:

```text
app-data/
  digital-human-studio.sqlite
  tasks/
    task-id/
      source/
      avatar/
      subtitles/
      post/
      exports/
```

Credential storage is managed separately through OS-backed secure storage and is not treated as task data.

## Error Handling

Each generation step has its own status:

- Waiting.
- Running.
- Complete.
- Failed.
- Ready to retry.

Failure handling rules:

- Preserve successful previous steps.
- Preserve user edits.
- Show provider errors in user-readable language.
- Keep raw diagnostic detail available for logs without exposing credentials.
- Retry only the selected failed or stale step.
- Avoid silently retrying paid provider actions without user awareness.

## Security

Security requirements:

- Renderer process has no direct Node access.
- Use context isolation and a typed preload API.
- API keys are never written to task metadata.
- API keys are never logged.
- Provider requests are made from the main process or controlled service modules.
- File access goes through explicit user-selected paths or app-owned task directories.
- FFmpeg invocation uses controlled argument construction rather than shell string concatenation.
- Bundled FFmpeg distribution includes license and build information.

## Testing

Unit tests:

- Task state transitions.
- Script-generation prompt builders.
- Similarity-risk decision mapping.
- Output-preset and output-variant mapping.
- Path handling.
- Publishing-package manifest generation.

Integration tests:

- SQLite persistence.
- Secure configuration save/load using mock secrets.
- Provider mocks for HeyGen, LLM, optional TTS, and ASR.
- FFmpeg command construction.
- Media file organization.

End-to-end tests:

- Mock API path from new task to exported publishing package.
- Single-step retry after a simulated provider failure.
- Portrait-only task.
- Portrait plus landscape task.

Manual acceptance:

- Real HeyGen run for one portrait task.
- Real HeyGen run for one task with portrait and landscape outputs.
- Verify subtitles, title, cover, optional BGM, and publishing package contents.

## MVP Acceptance Criteria

The MVP is accepted when a real sample task can:

1. Configure API keys locally.
2. Create a video task.
3. Enter a Chinese, English, or Indonesian source script.
4. Generate an original talking-head script with similarity risk shown.
5. Select a HeyGen preset avatar and voice.
6. Select portrait output by default and optionally add landscape output.
7. Generate native HeyGen avatar video for each selected output preset.
8. Produce usable subtitle timing through provider captions or ASR fallback.
9. Generate title treatment and cover image.
10. Optionally import local BGM.
11. Render finished video with FFmpeg.
12. Export a generic publishing package.
13. Retry a failed step without restarting the whole task.
14. Run from a Windows installer for MVP acceptance.

## Documentation and Decisions

Existing project context and decisions:

- `CONTEXT.md`
- `docs/adr/0001-use-electron-react-typescript.md`
- `docs/adr/0002-use-heygen-as-first-avatar-provider.md`
- `docs/adr/0003-store-service-configuration-locally.md`
- `docs/adr/0004-use-sqlite-for-task-metadata.md`
- `docs/adr/0005-bundle-ffmpeg-with-compliance.md`

Implementation should re-check official provider documentation before coding concrete API fields and response mappings.

Reference documentation:

- Electron safeStorage: https://www.electronjs.org/docs/latest/api/safe-storage
- Electron security: https://www.electronjs.org/docs/latest/tutorial/security
- SQLite application file format: https://www.sqlite.org/appfileformat.html
- FFmpeg legal considerations: https://www.ffmpeg.org/legal.html
- HeyGen developer docs: https://developers.heygen.com/
