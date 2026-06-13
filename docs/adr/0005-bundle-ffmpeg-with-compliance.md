# Bundle FFmpeg with License Compliance

The MVP will bundle FFmpeg so users can render finished videos without manually installing or configuring an external `ffmpeg.exe`. The bundled binary must come from a known build source, avoid `--enable-gpl` and `--enable-nonfree` for the default distribution, and include the required license, source, and build-information notices with the application.

We considered requiring users to configure an external FFmpeg path, which would reduce packaging obligations but create setup friction for the MVP. Bundling FFmpeg gives a smoother Windows desktop experience, but it makes license compliance part of the release process rather than an optional detail.
