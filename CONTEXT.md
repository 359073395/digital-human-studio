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

**Preset Avatar Look**:
A selectable visual preset returned by the avatar provider, including the provider avatar ID, display name, and preview media. In HeyGen, the look ID is the `avatar_id` used for video generation.
_Avoid_: Hidden ID, text-only avatar setting, trained avatar

**Source Script**:
Text supplied directly by the user or transcribed from an uploaded local audio or video file. Platform-link scraping is outside the MVP.
_Avoid_: Scraped script, platform extraction, competitor download

**Original Video Link**:
A task-level URL field for the source or reference video. It is shown directly under the video-generation mode navigation as the first workflow input, because users start by extracting source copy or source media before analysis and generation.
_Avoid_: Downloaded video, scraped transcript, platform import

**Source Extraction Action**:
The first workflow command that attempts to turn source material into editable reference copy. The MVP routes it through the desktop extraction/transcription service and leaves platform-link downloading as a provider enhancement behind the same button.
_Avoid_: Mock check, hidden import, final script generation

**Original Video Download**:
An attempt to save a directly accessible video or audio URL into the task's local source media folder. Platform short links, login pages, and anti-hotlink pages may fail and should tell the user to manually upload the video instead of pretending the download worked.
_Avoid_: Platform scraping, login bypass, fake download success

**Source Media Upload**:
A local file import for original video or audio references. It lets viral remix and source-first workflows continue when platform links cannot be downloaded directly.
_Avoid_: Cloud upload, platform import, hidden cache

**Visual Analysis Brief**:
A task media artifact that records first-frame, hook, scene, proof, rhythm, CTA, and originality-risk prompts for the source video or uploaded materials. In the current MVP it is a structured brief that feeds later script generation; future visual models can replace its placeholder observations with frame-level analysis.
_Avoid_: Final transcript, exact frame detection claim, copied shot plan

**Internal Method Analysis Engine**:
The hidden script-generation layer that analyzes source links, source copy, product context, IP profile, or mixed-cut goals before writing the editable final script. It contains the reusable SOP thinking from reference breakdown, product selection-to-commerce, storyboard planning, personal IP planning, AI image/video prompting, and mixed-cut planning without exposing a large methodology form in the interface.
_Avoid_: Visible workflow block, prompt clutter, direct copy

**Production Workflow Registry**:
The canonical set of built-in production methods, required inputs, workflow stages, expected outputs, and quality gates for each video generation mode. It makes learned production methods part of the product behavior instead of one-off prompt text.
_Avoid_: Tutorial text, loose prompt snippet, user-visible course notes

**Knowledge Document**:
A user-uploaded reference document that can guide script, storyboard, or production decisions for a task, such as a creator rulebook, product policy, platform rule, or internal SOP.
_Avoid_: API key, private password, unrelated file attachment

**Viral Copy Reference**:
A user-uploaded example of high-performing copy or a viral content case. The app may learn structure, hook function, proof path, emotion curve, and CTA logic from it, but must not copy distinctive wording or creator identity.
_Avoid_: Copy source, clone script, protected expression

**Reusable Knowledge Sync**:
The product rule that uploaded documents, viral examples, source analyses, production notes, and user-approved workflow lessons should become reusable app knowledge. Sanitized summaries, prompts, SOP rules, and analysis reports may be committed to GitHub so the software carries the same learned methods across computers. API keys, access tokens, local databases, account details, and bulky raw media stay out of Git unless the user explicitly asks to version a specific non-sensitive asset.
_Avoid_: Secret sync, raw media dump, hidden cloud upload

**Reference Breakdown**:
The structured analysis of a reference video's abstract mechanics, such as hook job, pacing, proof type, emotional curve, visual rhythm, and CTA placement. It must not preserve the reference's distinctive wording, creator persona, jokes, or shot signature.
_Avoid_: Shot-for-shot copy, 1:1 rewrite, creator imitation

**Storyboard Generation Method**:
An internal planning method that converts a script goal into first frame, hook, proof/demo/story, visual action, subtitle emphasis, and edit rhythm. It can guide product shots, image lip-sync prompts, personal IP clips, or future image-to-video providers without becoming a top-level navigation item.
_Avoid_: Separate video category, final rendered edit, fixed timeline

**Drama-Commerce Storyboard Flow**:
An internal method inside viral remix and product/commerce workflows. It first analyzes product, audience, pain points, source mechanics, and conversion logic, then generates multiple editable story script options before visual storyboard generation.
_Avoid_: One-shot video generation, hidden final script, direct tutorial display

**Story Script Options**:
The editable candidate scripts produced after source/product analysis and before visual storyboard generation. The app may write the recommended option into the AI generated copy by default, but the user can replace or edit it before storyboarding.
_Avoid_: Final locked script, raw prompt result, copied reference script

**Personal IP Method**:
An internal analysis path for personal IP videos. It first infers whether the task is store visit, knowledge output, opinion, daily life, industry insight, experience sharing, or commerce, then chooses an appropriate interaction goal instead of forcing every IP video into product sales.
_Avoid_: Creator clone, account automation, forced commerce CTA

**AI Visual Prompt**:
The user-editable prompt constraints for image generation or future image-to-video providers, including presenter appearance, product handling, clothing, scene, mouth visibility, subtitle-safe space, and camera motion.
_Avoid_: Final script, avatar ID, subtitle style

**Mixed-Cut Method**:
An internal planning path for arranging voiceover, subtitles, product images, B-roll, screen recordings, generated visuals, sound cues, and optional digital-human segments. It must not assume a real person or digital human is required.
_Avoid_: Built-in stock library, unlicensed clip scraping, digital-human-only flow

**Mixed-Cut Material Upload**:
A local import for authorized video, image, and audio assets that can later be arranged into mixed-cut videos. MVP stores and lists these materials; full automated editing remains a provider integration.
_Avoid_: Unlicensed stock library, platform scraping, finished mixed edit

**Mixed-Cut Video**:
A top-level video generation mode for videos assembled from authorized materials, subtitles, voiceover, product imagery, screen recordings, generated visuals, and optional digital-human segments. Full mixed-cut rendering and Seedance-like provider execution remain future provider work.
_Avoid_: Digital-human-only mode, stock clip library, platform scrape

**Video Task**:
A single attempt to produce one finished video from one source script and one set of generation settings. The MVP interface focuses on one active video task at a time.
_Avoid_: Batch job, project, campaign

**Video Generation Mode**:
The top-level category selected for a video task. It controls which input materials the user sees and how generation services interpret the task. The MVP modes are preset avatar talking-head, product/commerce video, image lip-sync, personal IP video, viral structure remix, and mixed-cut video.
_Avoid_: Workflow step, output preset, provider setting

**Task List**:
The persistent collection of video tasks managed by the application. The MVP does not expose batch generation as a primary workflow, but the product language treats each video as a task in a list.
_Avoid_: Batch queue, playlist, spreadsheet

**Task Strip**:
A compact horizontal task switcher shown at the top of the workspace. It preserves access to the task list without taking a full vertical column from the single-task production flow.
_Avoid_: Left task rail, batch dashboard, large queue panel

**Default Voice Path**:
The standard MVP path where HeyGen generates speech and lip-synced avatar video from the script, selected voice, and preset avatar.
_Avoid_: Basic TTS, automatic voice mode

**External Audio Path**:
An advanced path where the user provides or generates an audio file before sending it to the avatar provider for lip synchronization.
_Avoid_: Voice clone path, custom voice mode

**Viral Structure Reuse**:
The script workflow that preserves the reference script's abstract mechanics, such as hook function, information order, emotional curve, and CTA placement, while generating original expression.
_Avoid_: 1:1 rewrite, plagiarism rewrite, duplicate-safe rewrite

**Viral Structure Remix**:
The video generation mode called "爆款视频复刻" in the Chinese interface. It accepts a viral reference script as source material, keeps only reusable mechanics, and generates a new script with original wording, examples, persona, and claims.
_Avoid_: Copying a viral video, creator imitation, protected expression reuse

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

**AI Generated Copy**:
The editable final script produced by the language model. It is the script used for video generation, and users can manually correct price, claims, phrasing, or restricted words before rendering.
_Avoid_: Read-only result, hidden prompt output, automatic final copy

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
The task-level visual settings for subtitles, including percentage-based vertical position, font, font size, text color, background color, and weight. These settings are user-editable inside the finished-video preview area.
_Avoid_: Subtitle timing, caption file, hard-coded style

**Frame Title Style**:
The task-level visual settings for an optional title layer shown inside the finished-video frame above or near the subtitle layer. It includes editable text, percentage-based vertical position, font, size, colors, and weight.
_Avoid_: Cover title, publishing title, source script headline

**Cover Style**:
The task-level visual settings used to generate and preview a cover image, including title, subtitle, percentage-based title position, font, font size, text color, background color, accent color, and weight. Cover style controls live next to the preview because users tune them visually.
_Avoid_: Publishing copy, video thumbnail URL, platform cover

**Custom Font**:
A local font file uploaded by the user for creator-specific subtitle, frame title, and cover styling. It is stored as task media and previewed through the renderer's safe task-asset URL path.
_Avoid_: System-wide font install, bundled font library, remote font dependency

**Publishing Package**:
A local export bundle containing the finished video, cover image, title, description copy, tag suggestions, and publishing notes. The MVP produces one generic publishing package instead of platform-specific copy variants or social platform uploads.
_Avoid_: Auto publish, platform upload, distribution

**Output Save Directory**:
The user-selected Windows folder where the app copies final videos, cover images, subtitle files, and the publishing manifest after the internal task export succeeds. The app creates a task-named subfolder inside this directory to avoid overwriting previous exports.
_Avoid_: Internal render cache, task media folder, provider download path

**Explicit Output Confirmation**:
The confirmation shown before one-click output starts. It reminds users to set subtitle and cover styles in the preview first, because those style choices affect exported cover files and sidecar subtitle assets.
_Avoid_: Silent export, hidden finalization, mock check

**Service Configuration**:
The local settings that connect the application to external generation services, including avatar, language model, and optional voice providers. The MVP does not include a cloud account system.
_Avoid_: User account, workspace account, SaaS settings

**HeyGen Generation Route**:
The HeyGen video submission path selected in service configuration. `Direct Video` means deterministic `POST /v3/videos` rendering that may require API credits. `Video Agent` means `POST /v3/video-agents` and is the route that best matches HeyGen member/OAuth workflows. `Auto` chooses the safer route from auth mode and falls back from Direct Video to Video Agent when HeyGen reports API credits are required.
_Avoid_: Auth mode, account plan, avatar mode

**HeyGen Member OAuth Route**:
The OAuth-based HeyGen login path for accounts that should consume member/subscription credits instead of API-credit-only keys. It requires a HeyGen OAuth Client ID, an approved Redirect URI, browser authorization, and a local token exchange using PKCE.
_Avoid_: API Key route, pasted sk key, guaranteed credit entitlement

**HeyGen OAuth Token Bundle**:
The encrypted local credential record created after HeyGen OAuth succeeds. It contains an access token, refresh token, and expiration time, and the main process refreshes it before HeyGen calls when needed. It must never be committed to GitHub or shown in the renderer.
_Avoid_: SQLite setting, GitHub backup, visible Bearer token

**Flow API Guide**:
A compact task-level hint panel that shows which generation stages use which local service configuration, model name, Avatar ID, Voice ID, and API Key status. It may show whether a credential is configured, but it must never reveal the API Key value.
_Avoid_: Secret display, large methodology panel, separate settings duplicate

**Local Configuration Check**:
A settings-screen validation that confirms required local fields and credentials are present. It does not make a live provider API request, so real connectivity errors must still surface during generation.
_Avoid_: API health check, provider uptime check, guaranteed connection

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

**Preview-Attached Controls**:
Style controls that belong inside or directly next to the preview they affect. Subtitle and cover controls use this pattern so users can adjust them while watching the visual result.
_Avoid_: Detached style form, hidden design settings

**Preview Mode Card**:
A preview surface that switches between finished-video preview and cover preview as peer cards. Each card owns its relevant controls so users can adjust text, position, font, and color while seeing the exact affected frame.
_Avoid_: Separate scattered preview panels, hidden style drawer, detached preview tab

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

**Product/Commerce Video**:
A video generation mode for product selling or product explanation. It may use product images, generated presenter images, B-roll, voiceover, or optional digital-human segments, but the category itself does not require a human presenter.
_Avoid_: Digital-human-only product mode, mixed-cut video, product-only image

**Image Lip-Sync Video**:
A video generation mode where the user uploads a reference person image and HeyGen animates that image with lip synchronization for the generated script.
_Avoid_: Product/commerce video, static image narration, custom digital twin

**Personal IP Video**:
A video generation mode that applies a reusable creator profile, persona, tone, catchphrases, and banned words to script generation while still using the selected avatar provider for video rendering.
_Avoid_: Account profile, trained voice, creator clone

**AI Product Image Presenter**:
A generated presenter image that shows a person holding, wearing, or presenting a product image supplied by the user, then becomes the source image for HeyGen image-based lip-sync video.
_Avoid_: Custom digital twin, mixed-cut video, product mockup only

**Presenter/Scene Description Prompt**:
The user-editable prompt that describes the presenter, product scene, clothing, composition, and product-holding or product-wearing style for AI visual generation.
_Avoid_: Script prompt, voice prompt, avatar ID

**Motion Prompt**:
The user-editable prompt that describes how the presenter or generated video subject should move during video generation, such as holding the product toward camera, nodding, pointing, walking, demonstrating, or smiling.
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

**Default Video Frame Cover**:
The default cover background derived from the generated avatar video's provider thumbnail. It is treated as the MVP-compatible video-frame source until bundled FFmpeg can extract the exact first frame locally.
_Avoid_: Pure graphic default cover, unrelated stock background, platform thumbnail scraping

**Interface Language**:
The language used by the desktop application's controls, labels, and messages. The MVP interface language is Chinese.
_Avoid_: Content language

**Content Language**:
The language of generated scripts, avatar speech, subtitles, and publishing copy. The MVP supports Chinese, English, and Indonesian content languages.
_Avoid_: Interface language

**Video Dedup Processing**:
A standalone video mode that imports an existing MP4, mixed-cut output, downloaded source video, or finished video, then produces processed MP4 variants plus an originality score report. It is separate from mixed-cut generation.
_Avoid_: Mixed-cut setting, platform guarantee, filter-only edit

**Storyboard Preview Fallback**:
A local SVG storyboard preview written when the AI image provider fails after the structured visual storyboard has already been generated. It preserves shot order, timing, visual actions, captions, and the image-provider error for later regeneration.
_Avoid_: Successful AI storyboard image, finished video, cover image
