# 0033 - Isolate mixed-cut audio and surface updates

Mixed-cut material folders may contain both visual clips and audio files. Audio must never be treated as a visual frame source, because it can break rendering and confuse users about why a video has no picture. The importer now classifies video/images as `mixed-cut-material` and audio as `mixed-cut-audio`. Visual analysis and mixed-cut shot grouping only read visual extensions, including for older task data.

If the user copies the same visual shot multiple times inside one numbered folder, each file instance remains available to that folder's selection pool. The edit decision record keeps the file-level internal marker so a generated combination can still be traced back to the exact file used.

Chapter mode now controls timing semantics:

- `fixed-material-count` is the default fixed-material mode. It uses one selected visual from each numbered folder and does not let audio drive video length.
- `fill-with-bgm` is the audio mode. It requires audio and fills the audio duration by adding more short visual segments instead of looping one short clip into a long segment.

Online updates must be visible without opening Settings. Internal testers may not know to look inside Settings, so the main topbar now shows update status and actions. The implementation uses GitHub Releases through `electron-updater`; development builds report that online update is only available in packaged builds.
