# ADR 0020: Use Internal Method Analysis Engine

## Status

Accepted

## Context

The workbench now supports several final video categories: preset avatar talking-head, product/commerce video, image lip-sync, personal IP video, viral structure remix, and mixed-cut video.

Earlier designs exposed a visible creative workflow block with fields for reference analysis, selling points, storyboard, daily pipeline, AI prompts, and mixed-cut planning. User feedback made it clear that these methods are useful, but showing them as a large form adds clutter and makes the interface feel like methodology documentation instead of a production tool.

The product direction is source-first: users provide an original video link, extracted copy, source script, product material, or IP profile; the system analyzes the source; then it generates editable copy and video assets.

## Decision

Move the creative workflow from visible renderer fields into a main-process script method engine.

`methodAnalysisInstructionLines` builds provider prompt instructions from the task state. It chooses the internal analysis path in this order:

1. Original video URL: reference video breakdown.
2. Source script: source-copy analysis.
3. Product/commerce mode: product and selling-point analysis.
4. Personal IP mode: IP subtype analysis.
5. Fallback: topic brief analysis.

Mode-specific rules are embedded in the prompt:

- Product/commerce video uses product-card logic, selection-to-commerce thinking, storyboard planning, and optional visual generation, but it does not assume a human presenter is required.
- Image lip-sync keeps the script short, spoken, and suitable for one presenter image.
- Personal IP first infers whether the task is store visit, knowledge output, opinion, daily life, industry insight, experience sharing, or commerce.
- Viral remix reuses abstract mechanics only and replaces concrete wording, examples, creator persona, catchphrases, shot signatures, and claims.
- Mixed-cut video plans material arrangement and does not assume a real person or digital human is required.
- Preset avatar talking-head still applies short-video retention analysis before rendering through the avatar provider.

The renderer should keep these methods invisible. It shows practical inputs, generated/editable script, provider settings, preview, style controls, and export actions.

## Consequences

- The UI stays focused on production instead of exposing method notes.
- Script generation still benefits from viral breakdown, Feishu SOP knowledge, product-card thinking, storyboard planning, and IP-video strategy.
- The top-level navigation describes final video form and user intent, not internal workflow methods.
- The old `creativeWorkflow` task field remains in storage for compatibility, but new generation logic should not depend on renderer-edited workflow fields.
- Future providers can read the same method engine output or add typed planning artifacts behind provider interfaces.
