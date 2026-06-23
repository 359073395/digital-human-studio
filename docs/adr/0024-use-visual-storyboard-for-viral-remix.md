# ADR 0024: Use Visual Storyboards For Viral Remix

## Status

Accepted

## Context

The `爆款视频复刻` mode originally emphasized source extraction, viral structure analysis, and rewritten scripts. The user now wants this mode to follow the practical image-to-video planning pattern used by modern short-video workflows: generate a storyboard with visible panels and prompts first, then use that board as a consistent reference for future video generation.

The important requirement is not a fixed 9-grid. The requirement is a unified visual storyboard that makes later video generation easier: the same protagonist, product, wardrobe, scene, lighting, color, and camera style should carry across all panels.

After reviewing a drama-commerce storyboard workflow, we also need a script-control layer before image generation. The app should not spend image or video credits until the user has seen and corrected the product facts, price, claims, CTA, and wording.

## Decision

Add a `视觉故事板` planning stage to viral remix.

Before visual storyboarding, add a `剧情脚本方案` stage that:

- analyzes product, audience, pain points, use cases, and proof opportunities,
- extracts reusable reference mechanics without copying protected expression,
- generates three to five differentiated drama-commerce script options,
- marks one recommended option,
- writes that option into the editable final script for user correction.

The visual storyboard stage then uses the currently edited final script as source of truth and produces:

- a viral structure summary,
- an originality-safe remake direction,
- a variable-count shot list,
- per-shot image and motion prompts,
- a visual consistency bible,
- a single illustrated storyboard image,
- a whole-video prompt for future image-to-video providers.

The app should default to AI-selected shot count, usually 6 to 12 panels, while allowing user presets such as 6, 8, 9, and 12. Nine panels are treated as one preset, not as the product model.

The first implementation stops at script options, storyboard prompts, and storyboard image generation. Seedance, Jimeng, Kling, Wan, NVIDIA Cosmos, or other image-to-video providers can be added later behind provider interfaces.

## Consequences

- `爆款视频复刻` becomes more useful for visual and mixed-material videos, not only talking-head scripts.
- Users can correct important commercial facts before visual generation.
- Future image-to-video integrations can consume the storyboard package without redesigning the source-first flow.
- The UI can show practical production outputs rather than methodology notes.
- The app must store script option artifacts and storyboard artifacts separately.
- Prompting must continue to reuse reference mechanics without copying protected expression, creator persona, distinctive wording, or shot signatures.
