# 0035 - Mixed-cut asset queue and output progress

## Status

Accepted.

## Context

Internal testers need to correct mistakes quickly after syncing a mixed-cut folder. The previous UI could read visual and audio assets, but users could not remove a wrong clip or audio file without resyncing the whole folder. Mixed-cut audio also behaved like a single current asset, which made multiple voiceovers difficult to use for batch output.

Long output jobs also need progress in the area where users are watching results. A top progress bar is useful, but when the user clicks one-click output their attention moves to the preview/result panel.

## Decision

- Mixed-cut visual assets and mixed-cut audio assets are both shown as task-local removable lists.
- Mixed-cut visual assets are grouped by numbered folder in the UI. Users open a folder such as `1` or `2` and delete only the specific copied task asset they no longer want.
- Removing an asset deletes only task metadata first. The copied file is removed only when it is inside the task directory and no remaining asset references the same relative path.
- Audio import appends to a queue instead of replacing the previous audio. Batch output cycles audio by batch index: batch 1 uses audio 1, batch 2 uses audio 2, then loops.
- Audio volume and reuse-rate controls use local draft state while the user drags. The task is saved on blur or pointer release so SQLite writes do not happen on every slider tick.
- Batch-count estimation shows a short calculating state after reuse-rate changes, then displays the new estimate. The calculation is still local and deterministic; the delay is a UI affordance to avoid flickering numbers while dragging.
- Generated script voiceover is available from script panels. Every generated voiceover is added to the task audio queue; in mixed-cut mode it is also added to the mixed-cut audio queue for batch cycling.
- Audio mode fills the selected audio duration with longer visual segments and, when it needs another round, follows numbered folder order while rotating to other clips in the same folder where available.
- Output progress is shown in the right preview/result panel while a workflow is running, backed by the existing running-state refresh and local progress estimate.

## Consequences

Users can replace mistakes by deleting individual task assets or resyncing a folder. Multiple audio files become practical for batch mixed-cut output without adding another configuration step. The UI remains simpler because there is no manual target-count input; estimated count still comes from folder combinations and reuse settings, with a higher internal cap for running batches.

The right-side progress bar is an operational indicator, not an FFmpeg frame-accurate meter. It prevents the desktop app from looking frozen while the background worker is producing output.
