# ADR 0014: Source-First Workflow Layout

## Status

Accepted

## Context

The video creation flow starts with a source or reference video, not with avatar styling. Users expect to paste a source video link, extract copy or media, analyze and rewrite the reference, then generate the final digital-human video. Keeping the original video link inside the lower generation settings made the flow feel backwards and made future source extraction harder to discover.

The task list and avatar look picker also consumed too much screen space for a single-video MVP. The finished-video preview must display the full output frame in the selected aspect ratio so subtitle percentage placement maps to the actual video frame.

## Decision

The original video link field will sit directly under the video-generation mode navigation as the first workflow input. It includes a one-click extraction action that writes extracted text into the editable reference-copy field. Platform-link downloading can be added later behind this same action without changing the main UI.

The task list becomes a narrow status rail instead of a full column. Task details remain available through the active task and hover labels. The preset avatar picker keeps visual cards, but the card grid uses fixed thumbnail and text rows to prevent image overlap.

The finished-video preview frame uses the selected output preset's true aspect ratio. Portrait preview uses a complete 9:16 frame, and landscape preview uses a complete 16:9 frame; neither preview is vertically clipped to fit a decorative card.

## Consequences

- The first visible workflow step now matches the user's actual production sequence.
- Subtitle percentage positioning is based on a complete preview frame.
- The editor and preview receive more horizontal room because the task list is compact.
- The avatar picker remains useful without letting thumbnails overlap or dominate the form.
