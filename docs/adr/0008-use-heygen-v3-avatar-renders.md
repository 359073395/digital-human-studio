# Use HeyGen v3 Avatar Renders

The MVP will render real digital-human videos through HeyGen v3 video APIs from the Electron main process. The app creates a render with `POST /v3/videos`, polls `GET /v3/videos/{video_id}`, then downloads the returned video URL into the task media folder.

Each selected output preset creates its own native HeyGen render. Portrait and landscape are not produced by cropping or reusing one provider output in the MVP.

HeyGen configuration stores the Base URL, default Avatar ID, optional Voice ID, and resolution as local non-secret settings. The API key remains in the local credential store and is sent only from the main process. The renderer calls a typed IPC method and never sees the API key.

Provider-supplied caption URLs are saved as subtitle assets when available, but subtitle fallback and final subtitle styling remain separate post-production work.
