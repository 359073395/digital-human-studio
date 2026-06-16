# Store Service Configuration Locally

The MVP will not include a cloud account system or hosted user workspace. Users configure their own API keys and provider settings on the Windows machine where the application runs, and the app stores credentials through a local encrypted credential file rather than SQLite task metadata, logs, renderer state, or plain project files.

This keeps the first version focused on generating finished videos instead of building account management, billing, synchronization, or hosted secret storage. A cloud account system can be added later if collaboration, remote rendering, or managed credits become product requirements.

During development we found that Windows/Electron `safeStorage` ciphertext could become unreadable across different launch contexts. The credential layer now writes new secrets with a project-local AES-GCM key stored under the ignored app data directory (`data/credentials/local-key.json`) while retaining read support for legacy `safeStorage` ciphertext. This keeps the MVP recoverable for API-account switching and project backup workflows without committing secrets to Git.
