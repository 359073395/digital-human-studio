# 0033 - Isolate mixed-cut audio and surface updates

Mixed-cut material folders may contain both visual clips and audio files. Audio must never be treated as a visual frame source, because it can break rendering and confuse users about why a video has no picture. The importer now classifies video/images as `mixed-cut-material` and audio as `mixed-cut-audio`. Visual analysis and mixed-cut shot grouping only read visual extensions, including for older task data.

Chapter mode now controls timing semantics:

- `fill-with-bgm` requires audio and uses audio duration to fill visuals.
- `fixed-material-count` uses the selected visual sequence duration; audio can be muxed but does not drive video length.
- `minimum-duration` uses script estimation with the existing 12 second floor; audio can be muxed but does not drive video length.

Online updates must be visible without opening Settings. Internal testers may not know to look inside Settings, so the main topbar now shows update status and actions. The implementation uses GitHub Releases through `electron-updater`; development builds report that online update is only available in packaged builds.
