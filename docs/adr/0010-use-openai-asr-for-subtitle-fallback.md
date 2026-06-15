# Use OpenAI ASR for Subtitle Fallback

The MVP will use OpenAI audio transcriptions as the first real ASR fallback when HeyGen does not return provider subtitle timing. The app will request `srt` output from the ASR provider and save the result as a task subtitle asset.

OpenAI ASR is already compatible with the API-first direction of the MVP and supports Chinese, English, and Indonesian language hints. Using it behind a subtitle fallback provider keeps the avatar workflow independent from the specific ASR API and lets the app later add local or alternative ASR providers without changing task semantics.

Provider subtitles remain the preferred path. ASR only runs after the avatar video has been generated and downloaded, and ASR failure should mark the subtitle step retry-ready without invalidating the successfully generated avatar video.
