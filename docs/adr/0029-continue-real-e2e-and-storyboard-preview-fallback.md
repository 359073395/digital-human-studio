# ADR 0029: Continue Real E2E And Storyboard Preview Fallback

Real release validation must show the full state of the app, not only the first provider failure. `release:e2e:real` now keeps running every selected video mode after a mode fails, records each failure with an optional external blocker tag, and includes the independent `video-dedup` mode in the default checklist.

Visual storyboard generation has two layers: structured storyboard JSON/Markdown from the LLM, then a storyboard preview image from the image provider. The image provider can temporarily return gateway failures even after the storyboard plan is valid. When storyboard image generation fails, the workflow now writes a local SVG storyboard preview and an error note instead of marking the whole storyboard step as failed.

This fallback is not treated as a successful AI image generation. It is a usable preview asset so the user can inspect shot order, timing, visual action, captions, and motion prompts, while keeping the original provider error available for later regeneration.

Consequences:

- Full release reports can distinguish HeyGen account blockers from local mixed-cut, dedup, ASR, visual analysis, and storyboard issues.
- Viral remix can progress beyond a transient image gateway timeout and expose the next real blocker.
- A public release still needs a successful HeyGen route for digital-human MP4 output.
- If the user specifically needs an AI-rendered storyboard image, they can regenerate it later from the saved storyboard prompt.
