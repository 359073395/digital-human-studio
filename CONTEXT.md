# Digital Human Studio

This context defines the product language for a Windows desktop application that generates finished digital-human talking-head videos through API-first automation.

## Language

**MVP**:
The first usable version that can run the full path from user input to a finished video file. It prioritizes an API-first workflow over fully local model execution.
_Avoid_: Full clone, complete platform, offline-first version

**Finished Video**:
A publish-ready video file that includes a lip-synced digital-human talking-head video, subtitles, background music, title treatment, and cover image.
_Avoid_: Raw avatar output, draft render, preview

**Digital-Human Talking-Head Video**:
A video where a preset digital human speaks with real lip synchronization. A static avatar image with audio and subtitles is not a digital-human talking-head video in this product.
_Avoid_: Avatar slideshow, image narration, static talking image

**Preset Avatar**:
A ready-to-use digital human provided by a third-party avatar API. Custom avatar creation from uploaded human footage is outside the MVP.
_Avoid_: Digital twin, custom avatar, trained avatar

**Source Script**:
Text supplied directly by the user or transcribed from an uploaded local audio or video file. Platform-link scraping is outside the MVP.
_Avoid_: Scraped script, platform extraction, competitor download

**Mixed-Cut Video**:
A future enhancement that combines talking-head footage with additional clips, B-roll, or montage editing. It is not part of the MVP core workflow.
_Avoid_: MVP video, finished video

**Video Task**:
A single attempt to produce one finished video from one source script and one set of generation settings. The MVP interface focuses on one active video task at a time.
_Avoid_: Batch job, project, campaign

**Task List**:
The persistent collection of video tasks managed by the application. The MVP does not expose batch generation as a primary workflow, but the product language treats each video as a task in a list.
_Avoid_: Batch queue, playlist, spreadsheet

**Default Voice Path**:
The standard MVP path where HeyGen generates speech and lip-synced avatar video from the script, selected voice, and preset avatar.
_Avoid_: Basic TTS, automatic voice mode

**External Audio Path**:
An advanced path where the user provides or generates an audio file before sending it to the avatar provider for lip synchronization.
_Avoid_: Voice clone path, custom voice mode

**Viral Structure Reuse**:
The script workflow that preserves the reference script's abstract mechanics, such as hook function, information order, emotional curve, and CTA placement, while generating original expression.
_Avoid_: 1:1 rewrite, plagiarism rewrite, duplicate-safe rewrite

**Original Expression**:
New wording, sentence rhythm, examples, proof, and creator voice generated for the user's own product or topic. It must not preserve the reference script's identifiable expression.
_Avoid_: Light paraphrase, wording swap, tone clone

**Hook Function**:
The job performed by the first few seconds of a script, such as naming a pain point, creating contrast, promising a result, or opening a loop. The MVP preserves the hook function but rewrites the hook expression.
_Avoid_: Hook sentence, opening copy

**Similarity Risk**:
A product-facing warning that estimates whether a generated script is too close to the reference script's expression. It is used to encourage further originality, not to evade platform checks.
_Avoid_: Detection bypass, duplicate-check score, anti-plagiarism score

**Script Provider**:
A main-process adapter that turns a video task's source script and content language into an original final script. The renderer triggers script generation through IPC and never calls language model APIs directly.
_Avoid_: Renderer LLM client, prompt-only utility, direct API button

**Mock Script Fallback**:
The local runnable script generator used when the language model provider is disabled or missing credentials. Once a real provider is configured, provider failures should surface as retry-ready errors instead of silently falling back to mock output.
_Avoid_: Hidden fallback, production generator, fake success

**Editable Default**:
An automatically generated asset or setting that gives the user a ready-to-use result while still allowing manual replacement or adjustment before final rendering.
_Avoid_: Forced default, manual-only setting

**Post-Production Assets**:
The subtitles, background music, title treatment, and cover image added after the digital-human talking-head video is generated.
_Avoid_: Effects, decorations, optional extras

**Subtitle Style**:
The task-level visual settings for subtitles, including position, font size, text color, background color, and weight. These settings are user-editable and previewed before export.
_Avoid_: Subtitle timing, caption file, hard-coded style

**Cover Style**:
The task-level visual settings used to generate and preview a cover image, including title, subtitle, font, font size, text color, background color, accent color, and weight.
_Avoid_: Publishing copy, video thumbnail URL, platform cover

**Publishing Package**:
A local export bundle containing the finished video, cover image, title, description copy, tag suggestions, and publishing notes. The MVP produces one generic publishing package instead of platform-specific copy variants or social platform uploads.
_Avoid_: Auto publish, platform upload, distribution

**Service Configuration**:
The local settings that connect the application to external generation services, including avatar, language model, and optional voice providers. The MVP does not include a cloud account system.
_Avoid_: User account, workspace account, SaaS settings

**Local Credential**:
An API key or service secret saved only on the user's Windows machine. It should be stored through operating-system-backed secure storage rather than as plain text project data.
_Avoid_: Cloud secret, shared credential, project field

**Task Metadata**:
Structured information about video tasks, including scripts, selected providers, generation settings, statuses, paths, and timestamps. It does not include large media files.
_Avoid_: Project file, media data, render cache

**Media Asset**:
A local file used or produced by a video task, such as source audio, source video, generated avatar video, background music, cover image, subtitle file, or finished video.
_Avoid_: Database blob, metadata record

**Generation Step**:
One recoverable stage inside a video task, such as transcription, script generation, avatar rendering, subtitle creation, post-production, or export.
_Avoid_: Whole task, background job, pipeline

**Step Status**:
The current state of one generation step. It lets the user understand which part is waiting, running, complete, failed, or ready to retry.
_Avoid_: Task status, progress text

**Single-Step Retry**:
A retry action that reruns only the failed or selected generation step while preserving earlier successful outputs and user edits.
_Avoid_: Restart task, regenerate everything

**Layered Preview**:
A preview model where scripts, subtitle style, cover image, avatar output, and finished video are previewed at the stage where each artifact exists. The MVP does not promise real-time preview of the final video while it is still being generated.
_Avoid_: Live final preview, real-time render preview

**Previewable Media Asset**:
A local task media file that the desktop app can safely display in the renderer, such as a product image, generated presenter image, cover image, or finished video.
_Avoid_: Raw file path, database blob, hidden output

**One-Click Video Generation**:
The primary user-facing action that runs the real API workflow from current task settings through script generation, avatar rendering, subtitles, cover creation, and export. Developer mock checks are not part of this primary user flow.
_Avoid_: Mock check, partial avatar render, debug workflow

**Output Preset**:
The selected video orientation, aspect ratio, resolution, and layout-safe defaults for one finished video. A video task may select one or more output presets, with portrait selected by default.
_Avoid_: Platform, export quality

**Portrait Output**:
A vertical finished video preset intended for short-video feeds that favor 9:16 presentation.
_Avoid_: Mobile-only video

**Landscape Output**:
A horizontal finished video preset intended for 16:9 playback, embedding, or channels where horizontal video is preferred.
_Avoid_: Desktop-only video

**Output Variant**:
One finished video produced from a video task for a specific output preset. Multiple output variants can share the same script and avatar configuration while using different layouts, covers, and subtitle positioning.
_Avoid_: Separate task, duplicate task

**Native Avatar Render**:
A digital-human talking-head video generated by the avatar provider for the exact output preset selected by the user. The MVP uses native avatar renders for each selected output preset.
_Avoid_: Cropped render, reused render, aspect-ratio conversion

**Avatar Mode**:
The task-level choice that decides whether a video uses a HeyGen preset avatar or an AI-generated product presenter image as the visual speaker source.
_Avoid_: Provider switch, style preset, output preset

**AI Product Image Presenter**:
A generated presenter image that shows a person holding, wearing, or presenting a product image supplied by the user, then becomes the source image for HeyGen image-based lip-sync video.
_Avoid_: Custom digital twin, mixed-cut video, product mockup only

**Digital-Human Description Prompt**:
The user-editable prompt that describes the presenter's appearance, clothing, scene, and product-holding style for AI product image generation.
_Avoid_: Script prompt, voice prompt, avatar ID

**Motion Prompt**:
The user-editable prompt that describes how the digital human should move during video generation, such as holding the product toward camera, nodding, pointing, or smiling.
_Avoid_: Script, subtitle timing, edit instruction

**Product Image**:
A local user-uploaded image of the item to be shown by the AI product image presenter. It is stored as a task media asset and is not scraped from a platform link in the MVP.
_Avoid_: Product feed, SKU database, platform image scraping

**Generated Presenter Image**:
The OpenAI-generated or edited image that combines the product image with the digital-human description prompt. It is an intermediate media asset used before HeyGen lip-sync rendering.
_Avoid_: Finished video, cover image, HeyGen avatar

**Cost-Saving Mode**:
A future option that reuses one avatar render and adapts it locally for another output preset. It is not part of the MVP.
_Avoid_: MVP render path, default render mode

**Subtitle Timing**:
The word or sentence timing used to place subtitles on a finished video. The MVP uses provider-supplied subtitle timing when available and does not use estimated timing as final output.
_Avoid_: Estimated subtitles, static captions

**ASR Fallback**:
A recovery path that transcribes the generated avatar video to create subtitle timing when the avatar provider does not return usable subtitles.
_Avoid_: Primary transcription path, subtitle guess

**Background Music**:
An optional local audio file selected by the user and mixed into a finished video. The MVP does not ship with a music library of unclear rights.
_Avoid_: Built-in music, platform music, stock music

**Cover Image**:
A still image exported with a publishing package for a specific output variant. The MVP creates it from a selected video frame with title treatment and lets the user replace it.
_Avoid_: AI cover, thumbnail-only asset

**Interface Language**:
The language used by the desktop application's controls, labels, and messages. The MVP interface language is Chinese.
_Avoid_: Content language

**Content Language**:
The language of generated scripts, avatar speech, subtitles, and publishing copy. The MVP supports Chinese, English, and Indonesian content languages.
_Avoid_: Interface language
