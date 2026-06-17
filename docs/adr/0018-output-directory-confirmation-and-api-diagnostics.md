# ADR 0018: Output Directory, Confirmation, and API Diagnostics

## Status

Accepted

## Context

Users need to choose where final videos and covers are saved, not only open the app's internal task export directory. The primary output action also needs to remind users to tune subtitle and cover styles in the preview before the app spends API credits.

The settings "check" action previously sounded like a live API test, but it only verified local configuration. That created confusion when a provider request failed during real generation.

## Decision

Each video task stores an optional output save directory. The renderer exposes a "选择保存目录" control next to "一键输出视频和封面". If no directory is selected, the one-click output action asks the user to choose one before generation starts.

Before real output begins, the renderer shows a confirmation: users should first set subtitle and cover styles in the preview. The confirmation also states that the current MVP exports subtitle files as sidecar assets and does not yet burn styled subtitles into the MP4.

After internal export completes, the export workflow copies final MP4 files, cover SVGs, subtitle files, and a manifest into a task-named subfolder inside the selected directory. The internal task media directory remains the working source of truth.

Settings checks are renamed in behavior messaging as local configuration checks. Real API failures are surfaced in the workflow status with a troubleshooting hint to recheck Base URL, model name, and API key.

## Consequences

- Users can find final outputs in a chosen Windows folder.
- Repeated exports do not overwrite each other because each export creates a timestamped task folder.
- The app no longer implies that local configuration checks guarantee provider connectivity.
- Subtitle burn-in remains a future post-production feature.
