# Use SQLite for Task Metadata

The MVP needs to persist a task list, task statuses, scripts, provider settings, generated file paths, timestamps, and export history on the user's Windows machine. We will store task metadata in SQLite and keep media assets as files in project folders.

We considered JSON files for simplicity, but they would become fragile once task status updates, retries, filtering, and history are added. We also considered storing media files in the database, but large video and audio files are easier to inspect, replace, export, and clean up when kept as normal files.
