# ADR 0015: Preview Cards and Frame Title Controls

## Status

Accepted

## Context

The MVP interface is centered on producing one video task at a time, but the previous compact left task rail still consumed a full workspace column while providing little daily value. Users need the main production sequence to stay visible: source extraction, editable copy, generation settings, and a complete preview.

Finished-video styling and cover styling also need to be tuned visually. When subtitle and cover controls are detached from the preview, users cannot reliably judge placement, font, color, or overlap. The finished-video frame additionally needs a separate title layer for on-screen hooks or scene titles, not only subtitles.

## Decision

The task list will move to a compact horizontal task strip directly below the top bar. It keeps task switching available while returning the main workspace to a two-column editor-and-preview layout.

The preview pane will use preview mode cards. The first card previews the finished video and exposes finished-video controls: frame title style and subtitle style. The second card previews the cover and exposes cover style controls. Only the active preview's controls are shown.

Frame title style becomes a task-level setting with enabled state, editable text, percentage-based vertical position, font family, font size, text color, background color, and weight. If the title text is empty, the preview can derive a short title from the cover title or script.

Cover style gains a percentage-based title block position. The cover preview and exported SVG cover both use this position so the visual preview and generated asset stay aligned.

## Consequences

- The editor gains horizontal room because task switching no longer occupies a vertical workspace column.
- Finished-video and cover styling become independently controllable from their own preview cards.
- Users can add a visible frame title above the subtitle layer and tune it live.
- Cover title placement is no longer limited to hard-coded positions.
- Future post-production rendering should consume the same subtitle, frame title, and cover style metadata instead of adding separate style fields.
