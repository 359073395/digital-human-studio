# ADR 0017: Task Deletion and Explicit Export Actions

## Status

Accepted

## Context

The task strip previously allowed users to create tasks but not remove them. That made the persistent task list feel unfinished and forced users to keep outdated test tasks.

The main generation action was also labeled as "一键生成视频". That wording was too broad because the current MVP outputs the real avatar video, subtitle files, cover image, and publishing package, but it does not yet burn styled subtitles into the final MP4 file.

## Decision

Each task strip item will include a delete button. Deleting a task removes its database record and local task media directory. If the deleted task is active, the UI selects the next available task. If no task remains, the desktop main process creates a new empty task so the application always has a usable active task.

The product display name is "自媒体视频工作台".

The primary action will be labeled as "一键输出视频和封面". The action still runs the real API workflow: script generation when needed, avatar rendering, subtitle file creation from provider captions or ASR fallback, cover export, and publishing package export.

Preview style settings are still auto-saved on edit, but the preview panel also exposes a visible "保存设置" action so users can explicitly commit subtitle, frame-title, and cover settings before output.

## Consequences

- Users can clean up unwanted tasks from the task strip.
- The product name matches the broader self-media workflow rather than only digital-human talking-head output.
- The export action no longer implies that styled subtitles are already burned into the MP4.
- A future post-production step must add subtitle burn-in before the app can claim that final MP4 videos contain styled subtitles directly.
