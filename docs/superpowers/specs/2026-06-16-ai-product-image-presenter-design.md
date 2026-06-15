# AI Product Image Presenter Mode Design

## Purpose

Add a second digital-human generation mode to Digital Human Studio:

- Existing mode: use a HeyGen preset avatar to render a lip-synced talking-head video.
- New mode: use OpenAI `gpt-image-2` to generate or edit a product presenter image, then use HeyGen image-based lip-sync to turn that image into a speaking video.

This lets the user create product-specific presenters such as a person holding a product, wearing a product-related outfit, or showing a product close to camera, while keeping the MVP API-first.

## User Outcome

The user can:

1. Upload a local product image.
2. Enter a digital-human description prompt.
3. Enter a video motion prompt.
4. Generate a product presenter image with OpenAI image generation.
5. Use that generated image with HeyGen lip-sync to create a video.
6. Still use the existing HeyGen preset avatar mode when no product image workflow is needed.

## Modes

### Mode 1: HeyGen Preset Avatar

This is the current path.

Inputs:

- HeyGen Avatar ID.
- Optional HeyGen Voice ID.
- Final script.
- Content language.
- Output presets.
- New: motion prompt.

Behavior:

- Submit one native HeyGen avatar render per selected output preset.
- Pass motion prompt to HeyGen when the API path supports it.
- Keep using HeyGen built-in voice by default.

### Mode 2: AI Product Image Presenter

This is the new path.

Inputs:

- Product image uploaded from local disk.
- Digital-human description prompt.
- Motion prompt.
- Final script.
- Content language.
- Output presets.
- Optional HeyGen Voice ID.

Behavior:

1. Save the uploaded product image as a task media asset.
2. Build an OpenAI image prompt from:
   - product image,
   - digital-human description prompt,
   - task content language,
   - selected output preset.
3. Call OpenAI image generation or image edit with `gpt-image-2`.
4. Save the generated presenter image as a task media asset.
5. Submit one HeyGen image-based video render per selected output preset using the generated image.
6. Save HeyGen video outputs and provider subtitle files like the existing avatar render path.

## Prompt Fields

### Digital-Human Description Prompt

Purpose:

- Defines who appears in the generated image.

Examples:

- "年轻印尼女主播，亲和自然，穿白色衬衫，手拿护肤品，TikTok Shop 直播间风格。"
- "成熟商务男主持人，深色西装，干净背景，右手展示产品包装。"

Rules:

- Stored on the video task.
- Editable before image generation.
- Used only for generated presenter image mode.
- Not treated as a custom HeyGen digital twin.

### Motion Prompt

Purpose:

- Defines how the presenter should move in the generated video.

Examples:

- "手拿商品靠近镜头展示，边讲边轻微点头，语气自信。"
- "右手指向产品卖点，保持自然微笑，镜头稳定。"

Rules:

- Stored on the video task.
- Used by HeyGen render paths when supported.
- Applies to both preset avatar mode and AI product image presenter mode.

## Product Image Upload

The MVP upload entry lives in the Digital Human section, visible when the user selects AI Product Image Presenter mode.

Supported MVP behavior:

- User selects one local product image.
- App copies the image into the task folder under `source/`.
- App registers a media asset kind such as `product-image`.
- The renderer never reads arbitrary local files directly; it calls main-process IPC.

Out of scope for this step:

- Batch product image upload.
- Product image background removal.
- Product image gallery management.
- Automatic SKU metadata extraction.

## Generated Presenter Image

The generated image is an intermediate task asset.

Storage:

- Save under `avatar/` or `source/` as `generated-presenter-<preset>.png`.
- Register media asset kind such as `generated-presenter-image`.

Preview:

- Show the latest generated presenter image in the preview panel before video generation.
- Keep the generated image editable by regeneration, not by in-app pixel editing.

Output preset handling:

- For portrait output, generate a portrait-safe image.
- For landscape output, generate a landscape-safe image.
- If both presets are selected, generate one presenter image per preset unless the user later enables a cost-saving reuse mode.

## Provider Configuration

Add an image provider configuration for OpenAI image generation.

Settings:

- Provider label: "OpenAI 图片".
- Base URL: default OpenAI API URL.
- Model name: default `gpt-image-2`.
- Optional size/quality settings can be added later.
- API key saved in local credential storage.

Security:

- API key stays in the main process.
- API key is not stored in SQLite task metadata, renderer state, task files, or logs.

## Main-Process Architecture

New boundaries:

- `ImageProvider`: generates an image from text prompt plus optional input images.
- `OpenAiImageProvider`: OpenAI implementation using `gpt-image-2`.
- `PresenterImageWorkflowService`: uploads product image, generates presenter image, and records media assets.

Avatar provider changes:

- Extend avatar render input with:
  - `avatarMode`,
  - `motionPrompt`,
  - optional `imageAssetPath`.
- HeyGen preset avatar path keeps using `type: "avatar"`.
- AI product image presenter path uses HeyGen image-based render, expected API body shape based on current HeyGen v3 docs: `type: "image"`, image URL or asset, script/audio, voice settings, aspect ratio, resolution, and motion prompt when supported.

## Data Model Additions

Add task-level fields:

- `avatarMode`: `preset-avatar` or `image-presenter`.
- `avatarDescriptionPrompt`: string.
- `motionPrompt`: string.
- `productImageAssetId`: optional media asset ID.
- `generatedPresenterImageAssetId`: optional media asset ID.

Add media asset kinds:

- `product-image`.
- `generated-presenter-image`.

Add provider ID:

- `image`.

Migration:

- Existing tasks default to:
  - `avatarMode = "preset-avatar"`,
  - empty description prompt,
  - empty motion prompt,
  - no product image,
  - no generated presenter image.

## UI Changes

In the Digital Human block:

- Add mode selector:
  - "HeyGen 预设数字人"
  - "AI 商品图数字人"
- Add "数字人描述提示词" textarea.
- Add "动作提示词" textarea.
- Show product image upload only in AI Product Image Presenter mode.
- Add "生成人物商品图" button.
- Keep "生成 HeyGen 数字人" button.

Preview panel:

- Show uploaded product image when present.
- Show generated presenter image when present.
- Show generated video status per output preset.

Settings modal:

- Add OpenAI image provider configuration.
- Keep HeyGen configuration separate.

## Workflow

Preset avatar mode:

1. User edits script.
2. User chooses preset avatar settings.
3. User optionally enters motion prompt.
4. User clicks "生成 HeyGen 数字人".
5. App renders via HeyGen `type: "avatar"`.

AI product image presenter mode:

1. User uploads product image.
2. User enters digital-human description prompt.
3. User enters motion prompt.
4. User clicks "生成人物商品图".
5. App generates one image per selected output preset.
6. User reviews generated image.
7. User clicks "生成 HeyGen 数字人".
8. App renders via HeyGen image-based lip-sync.

## Error Handling

- Missing product image: image generation step becomes retry-ready with "请先上传商品图片。"
- Missing image provider API key: image generation step becomes retry-ready with "OpenAI 图片 API Key 尚未配置。"
- OpenAI image generation failure: preserve product image and prompts, show redacted provider error.
- Missing generated presenter image in image-presenter mode: avatar step becomes retry-ready with "请先生成人物商品图。"
- HeyGen image render failure: preserve generated presenter image and mark avatar step retry-ready.
- Paid provider actions should not silently retry.

## Testing

Unit tests:

- Domain default values and migrations.
- Image prompt builder.
- OpenAI image provider request and response parsing.
- HeyGen provider request body for avatar mode and image-presenter mode.
- Credential redaction.

Integration tests:

- Product image upload copies file into task directory.
- Presenter image generation stores media assets.
- Image-presenter avatar render uses generated image asset.
- Failure paths mark steps retry-ready.

Manual checks:

- Product image upload appears in UI.
- Presenter image preview appears after generation.
- Preset avatar mode still works.
- Portrait-only image-presenter task can generate a HeyGen video with a real account.
- Portrait plus landscape generates separate native outputs.

## Documentation Sources

Provider details must be verified again during implementation because API fields can change.

Current sources checked while designing:

- OpenAI image generation guide: https://developers.openai.com/api/docs/guides/image-generation
- OpenAI Image API reference: https://developers.openai.com/api/reference/resources/images
- HeyGen Create Video API reference: https://developers.heygen.com/reference/create-video
