# ADR 0016: Task Strip Mode Label and Video Frame Cover

## Status

Accepted

## Context

The horizontal task strip is meant to help users identify which video they are editing. Showing only output orientation plus runtime status, such as "竖屏 · 运行中", does not explain what kind of video workflow the task belongs to. Users care more about whether the task is a preset avatar video, product avatar video, image lip-sync video, personal IP video, viral remix, or future mixed-cut video.

Cover images should also start from the generated video itself. A pure graphic cover is useful as a fallback, but the default should be grounded in the generated talking-head output so creators can tune title styling on top of a real video frame.

## Decision

Task strip metadata will display selected output orientation plus video generation mode. Runtime status remains available through the step status strip, not the compact task label.

The default cover background will use the avatar provider thumbnail when available. The application stores that thumbnail as a cover-image media asset and attaches it to the output variant. The cover preview displays the thumbnail as the background and overlays the editable cover title style.

During export, the cover SVG embeds the saved video-frame thumbnail and applies the current cover title, subtitle, font, color, and position on top. If no thumbnail exists, export falls back to the existing styled solid-color cover.

## Consequences

- The task strip reads like "竖屏 · 预设数字人口播" instead of "竖屏 · 运行中".
- Cover preview starts from video imagery when the provider returns a thumbnail.
- Exported covers stay aligned with the preview by using the same thumbnail-backed cover style.
- Strict first-frame extraction still depends on a future FFmpeg integration; provider thumbnails are the MVP-compatible default video-frame source.
