# Use HeyGen as the First Avatar Provider

The MVP must produce real lip-synced digital-human talking-head videos, not static avatar videos. We will fully integrate HeyGen as the first avatar provider and isolate it behind an `AvatarProvider` boundary so the workflow can later support other avatar APIs without changing the product flow.

We considered exposing multiple avatar providers in the MVP, but that would add configuration, status mapping, error handling, and UI complexity before the first video workflow is proven. Starting with HeyGen keeps the MVP focused on a complete finished-video path while preserving a clear extension point.
