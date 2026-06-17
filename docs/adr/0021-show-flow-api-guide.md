# ADR 0021: Show Flow API Guide

## Status

Accepted

## Context

The workbench uses multiple API-backed services: script generation, image generation, HeyGen avatar rendering, ASR subtitle fallback, and optional external audio. Users need to know which API Key and model are required for each production stage before clicking one-click output.

The app already has a settings modal, but users should not need to open settings repeatedly just to understand why a stage is blocked or which model will be used.

## Decision

Show a compact "流程 API / 模型提示" panel inside the generation settings area.

The panel lists the task workflow stages:

1. Source extraction/material extraction.
2. Analysis and script generation.
3. Product presenter image generation.
4. HeyGen lip-synced video generation.
5. Subtitle fallback.
6. Optional external voice.
7. Local export.

Each card shows:

- Service name.
- Model name or Avatar/Voice/resolution setting.
- API Key state: configured, missing, disabled, not read, or not required.
- Whether the current task will use that stage.

The panel must never display an API Key value. It only reads `ServiceConfiguration.credentialConfigured`.

## Consequences

- Users can see which account/model each stage depends on without opening the settings modal.
- Product/commerce tasks visibly require both image generation and HeyGen when presenter images are missing.
- Preset avatar, image lip-sync, personal IP, viral remix, and mixed-cut tasks all show HeyGen as the MVP render path.
- ASR is presented as subtitle fallback, not as a replacement for provider subtitles.
- Future providers can add stage cards without changing the service configuration storage model.
