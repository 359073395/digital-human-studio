# ADR 0012: Use Generation Mode Navigation

## Status

Accepted

## Context

The MVP originally moved toward a single-task workflow, but the user needs multiple kinds of digital-human videos. Each kind requires different source materials: preset avatar scripts, product images, reference person images, personal IP profile fields, or viral reference scripts. A workflow-step navigation model made these categories hard to understand because steps such as source, script, avatar, and export are implementation stages, not user intent.

The interface also needs to include "爆款视频复刻" as a first-class category while keeping the content-generation rule clear: reuse reference mechanics, not protected expression.

## Decision

The renderer will use top navigation for video generation modes:

- Preset avatar talking-head
- Product avatar
- Image lip-sync
- Personal IP video
- Viral structure remix
- Mixed-cut video as a disabled future mode

The selected mode is stored on each `VideoTask` as `generationMode`. It controls the visible material inputs, the avatar source path, and script-generation prompt instructions. Output presets remain separate because they describe aspect ratio and native provider renders, not the kind of video being made.

The viral structure remix mode is labeled "爆款视频复刻" in the Chinese UI, but its generation prompt preserves only abstract mechanics such as hook job, pacing, reveal order, proof type, emotional turn, and CTA position. It must change wording, examples, scene framing, creator persona, and distinctive phrases.

## Consequences

- The first screen now reflects video intent instead of internal workflow steps.
- Product avatar and image lip-sync can share the image-based HeyGen rendering path while requiring different source images.
- Personal IP script generation can use reusable persona, tone, catchphrase, and banned-word fields.
- Viral structure remix becomes discoverable without presenting copying as an acceptable output goal.
- Mixed-cut video can stay visible as roadmap context without entering the MVP workflow.
