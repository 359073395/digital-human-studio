# 0032 - Adaptive workspace and audio-timed mixed cut

The workbench must stay usable in normal desktop windows. Video modes, especially mixed-cut, must not require horizontal dragging to reach controls. The workspace now uses flexible grid columns, mode tabs wrap automatically, and mixed-cut tables wrap text instead of forcing page-level horizontal overflow.

Mixed-cut audio is now a first-class task asset. Visual materials still come from ordered numeric folders such as `1`, `2`, `3`, while voiceover or music is uploaded separately as `mixed-cut-audio`. When a mixed-cut audio asset exists, rendering uses the audio duration as the target video duration and muxes that audio into the final MP4. Without uploaded audio, mixed-cut falls back to script-length estimation.

This keeps the user flow simple: choose a visual material folder, optionally upload a voiceover/music track, then generate. Deduplication remains a separate mode after mixed-cut output.
