# ADR 0011: Simplify Generation UI and Preview Assets

## Status

Accepted

## Context

The MVP interface previously exposed development-oriented actions such as Mock Check and partial HeyGen avatar rendering. Those controls made the desktop app feel like a test harness instead of a video tool. Users also could not visually inspect key assets such as uploaded product images, generated presenter images, covers, and finished videos from the main workflow.

## Decision

The primary renderer workflow will expose one main action: One-Click Video Generation. This action runs the real API workflow for the current task. Mock workflows remain available in the main process and tests, but they are not shown as primary user controls.

Task metadata now stores subtitle style and cover style. The renderer previews these settings immediately. The main process exposes a safe task-asset URL channel so the renderer can display product images, generated presenter images, cover images, and finished videos without exposing arbitrary local file paths.

## Consequences

- The interface is centered on producing a finished video, not validating mock artifacts.
- Output presets remain visible, but compact.
- Step status is reduced to compact badges.
- Cover SVG files are generated during real export so every output variant can have a previewable cover asset.
- Future post-production work can read the stored subtitle and cover style settings instead of adding another UI model.
