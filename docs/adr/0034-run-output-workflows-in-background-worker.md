# ADR 0034: Run Output Workflows in a Background Worker

## Status

Accepted.

## Context

One-click output, mixed-cut batch rendering, video deduplication, and final subtitle/title burn-in can run FFmpeg many times and copy many files. Running those synchronous operations directly in the Electron main process can make the desktop app look frozen while the video is still being generated.

The app already has an automatic runtime performance profile for low-spec, standard, and batch machines. That profile needs to apply to final export as well as mixed-cut and dedup rendering.

## Decision

Heavy output workflows now run in a `worker_threads` worker:

- `workflow:real-run`
- `mixed-cut:render-batch`
- `dedup:run`

The main process still performs license checks and owns the IPC boundary, but the worker opens its own SQLite connection, rebuilds the workflow services, runs the existing workflow logic, closes the database, and returns the final `VideoTask`.

The renderer keeps the visible progress animation alive and polls task state while output is running, so users can see the current step update instead of waiting on a single long IPC promise.

Final FFmpeg export now receives the runtime performance profile. Low-spec machines use the lighter preset, CRF offset, and limited FFmpeg thread count instead of letting final burn-in consume too much CPU.

## Consequences

- The desktop window should remain responsive while output video generation is running.
- Existing workflow services stay mostly unchanged, which lowers regression risk.
- Main and worker processes can read/write the same SQLite database through separate connections; writes remain short transactions.
- A task cannot start another heavy output worker while one is already running for the same task.
- Future heavy media operations should use the same worker pattern instead of adding synchronous FFmpeg work to the Electron main process.
