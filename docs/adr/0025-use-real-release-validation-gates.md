# ADR 0025: Use Real Release Validation Gates

The workbench is moving from a runnable MVP toward a small-scope deliverable. Earlier development checks proved that mock paths can pass while real generation still fails because of provider credit, voice selection, ASR support, subtitle rendering, or export mismatches. The release process must therefore include automated quality gates and real API validation.

We will add three release commands:

- `release:check` for local code quality and production build.
- `release:ui` for desktop UI smoke testing through Electron remote debugging.
- `release:e2e:real` for real API validation across all six generation modes and both output presets.

The real E2E script creates isolated app data, copies the user's local service configuration or reads environment variables, downloads short public test materials, runs each mode, and writes a structured report under `tmp/release-e2e-real-*`. It stops after the first mode failure to avoid wasting credits.

Final export is a release blocker, not a cosmetic step. The app must render subtitle and frame-title styles into the final MP4 through the local FFmpeg post-production path. When subtitle style is enabled, export must fail if no real timed subtitle file is available.

Mixed-cut release validation is also real, but intentionally narrow for the first deliverable: it must use uploaded visual material to generate an exportable video instead of falling back to a digital-human placeholder. More advanced multi-clip pacing can be added later without changing the release gate shape.

API keys remain outside Git, documentation, and test reports. Reports may include provider IDs, configured model names, redacted status, file paths, and error reasons.
