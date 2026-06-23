# ADR 0027: Add Local Save Path Preferences

## Status

Accepted

## Context

The app already stores task media internally under the application data directory and lets a task
choose an export directory. Users also need predictable folders for downloaded source videos,
generated product-presenter images, and final video packages so they can find assets outside the
task workspace.

These paths are local machine preferences. They are not task facts, credentials, or portable
project settings.

## Decision

Add an `app_preferences` SQLite table for non-secret local preferences and store three optional
save paths:

- Source video download directory.
- Generated image directory.
- Generated video directory.

Internal task media remains the source of truth. When a configured local path exists, the workflow
copies a convenience copy to that folder:

- Source downloads copy the downloaded media file.
- Product-presenter image generation copies the image and its prompt preview.
- Final export copies the publishing package to the task export directory first, or to the
  configured generated video directory when the task has no export directory.

## Consequences

- Local folders are easy for the user to inspect without breaking task portability.
- Existing task data keeps working because task media remains inside the app data directory.
- API keys and tokens remain in the encrypted credential store and are not mixed with path
  preferences.
- A restored project on a new computer can continue without these paths; the user can choose new
  local folders in Settings.
