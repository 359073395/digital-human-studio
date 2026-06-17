# ADR 0019: Creative Workflow Modules

## Status

Accepted

## Context

The workbench is expanding from a single digital-human talking-head flow into several creator workflows: viral reference breakdown, product-selling storyboards, personal IP daily production, image lip-sync planning, and future mixed-cut or image-to-video provider flows.

These workflows share the same first step, where the user provides an original video link or reference copy, but each mode needs different planning material before script and video generation. The app also needs to avoid treating viral references as copyable expression.

## Decision

Each `VideoTask` stores a `creativeWorkflow` object with editable fields for reference analysis, selling points, storyboard, daily pipeline, AI video prompt constraints, and mixed-cut plan.

The renderer shows a compact "创作流水线" block between editable scripts and generation settings. The visible fields change with the selected video generation mode, and a local template button fills practical defaults for that mode. Users can edit every generated field before running AI script generation or one-click output.

Script providers receive `creativeWorkflow` as prompt context. Prompt wording frames the notes as planning constraints and explicitly avoids copying reference wording, creator catchphrases, shot signatures, or other protected expression.

Mixed-cut is selectable as a planning mode, but the MVP still renders the available talking-head base path. Full mixed-cut rendering and Seedance-like provider execution remain future provider work.

## Consequences

- The five creator workflows are visible in the app without pretending every external platform integration is complete.
- Script generation can use user-edited breakdowns, selling points, storyboards, and prompts.
- Viral remix features reuse mechanics while reducing the risk of copying protected expression.
- The storage model is ready for future mixed-cut and image-to-video providers without another task schema redesign.
