# ADR 0022: Source Media Ingest And Visual Analysis

## Status

Accepted

## Context

The source-first workflow starts from an original video link or reference material. Viral remix needs an upload path when the reference video is already downloaded locally. Mixed-cut video also needs a place to collect authorized video, image, and audio assets before future automated editing providers are added.

Users also need separate actions for downloading the original video, extracting copy, and analyzing visuals. These are different operations with different failure modes.

## Decision

Add source media ingest actions:

- `下载原视频`: attempts to download a direct video or audio URL into task source media.
- `上传原视频`: imports a local source video or audio file.
- `提取文案`: keeps using the source transcription workflow.
- `画面分析`: generates `source/visual-analysis.md` and registers it as task media.
- `上传混剪素材`: imports multiple local video, audio, or image assets as mixed-cut materials.

The downloader only accepts responses that look like direct video/audio files. If a platform short link returns an HTML page, login page, or anti-hotlink response, the app surfaces a clear error and asks the user to upload the downloaded file manually.

The visual analysis artifact is a structured brief in the MVP. It records the expected analysis dimensions and is automatically appended to the source brief sent to script generation. Future visual-model providers can replace the placeholder brief with frame-level analysis without changing the renderer workflow.

## Consequences

- Viral remix has an explicit reference upload path.
- Mixed-cut video can collect authorized local materials before full auto-editing exists.
- Source link actions are clearer: download, extract copy, and visual analysis are separate buttons.
- The app avoids claiming it can scrape protected platform links.
- Script generation can use visual-analysis context when available.
