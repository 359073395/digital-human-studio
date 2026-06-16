# ADR 0013: Attach Style Controls to Preview

## Status

Accepted

## Context

Subtitle and cover styling are visual editing tasks. Keeping those controls in the main task form forced users to adjust settings in one area and inspect the result elsewhere. The preview also allowed subtitle text to compete with placeholder text, which made the finished-video preview look visually broken.

The script area also used "source script" and "original script" labels that could be misunderstood. Users need an explicit AI generation action, followed by an editable final copy field, because generated scripts often need manual corrections to prices, claims, restricted words, or phrasing.

## Decision

Subtitle and cover controls will live inside the finished-video preview card. Subtitle placement uses a percentage-based vertical position with both a slider and numeric input. Subtitle and cover controls include font selection, and users can upload a local font file that is stored as a task media asset and loaded through the safe task-asset URL path.

The script area will present the final text as "AI generated copy" and keep it editable. The "one-click AI copy generation" button runs only script generation; the main "one-click video generation" action then uses the edited final copy when present.

Each video generation mode stores an original video link field. The MVP keeps the link as metadata so future source extraction and viral analysis can use it without redesigning the task model.

Preset avatar videos also store a task-level Avatar ID. The HeyGen provider prefers this task-level Avatar ID and falls back to the configured default Avatar ID when the task field is empty.

The preset avatar form will expose a HeyGen avatar look picker. The main process reads the saved HeyGen credential, requests `/v3/avatars/looks`, and returns only display-safe look metadata to the renderer. The renderer shows preview cards when the list loads and keeps a manual Avatar ID input as a fallback.

## Consequences

- Users can tune subtitle and cover styles while looking at the affected preview.
- Subtitle position is no longer limited to top, middle, and bottom presets.
- The preview avoids overlapping placeholder text and subtitle text.
- Script generation becomes an explicit, editable step instead of a hidden read-only result.
- Original video links, custom fonts, and task-level Avatar IDs are persisted for future workflow expansion.
- Users can see and choose preset avatars visually instead of relying only on an opaque Avatar ID.
