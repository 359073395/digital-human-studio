# Viral Visual Storyboard Design

## Goal

Turn the `爆款视频复刻` mode into a source-first workflow that can produce two practical planning assets before final video generation:

1. A structured set of storyboard prompts for each shot.
2. A single visual storyboard image with multiple illustrated panels that keeps people, product, scene, color, and camera style consistent.

The storyboard is meant to help later image-to-video providers such as Seedance, Jimeng, Kling, Wan, or NVIDIA Cosmos understand the whole short-video sequence. It is not fixed to a 9-grid layout.

## Non-Goals

- Do not generate the final video in this phase.
- Do not add a Seedance or Jimeng provider in this phase.
- Do not claim to download protected Douyin links when the URL cannot be directly fetched.
- Do not copy a reference video's distinctive wording, creator persona, catchphrases, music signature, or exact shot sequence.
- Do not force every viral remix into a talking-head avatar workflow.

## User Workflow

1. The user selects `爆款视频复刻`.
2. The user provides one or more source inputs:
   - original video link,
   - uploaded source video,
   - uploaded screenshots,
   - product image,
   - reference person image,
   - editable source copy or topic brief.
3. The user clicks `一键生成视觉故事板`.
4. The app analyzes available source material and generates:
   - viral structure summary,
   - originality-safe remake direction,
   - shot list,
   - per-shot prompts,
   - visual consistency bible,
   - one visual storyboard image,
   - one whole-video image-to-video prompt.
5. The user can edit any shot prompt, regenerate the whole storyboard, or regenerate only the visual board later when provider support exists.

## Storyboard Shape

The storyboard uses a flexible panel count:

- Default: AI chooses 6 to 12 panels based on duration and content density.
- User override: common presets such as 6, 8, 9, and 12 panels.
- Layout: one generated image containing labeled panels. The layout can be 2x3, 2x4, 3x3, 3x4, or a long comic-strip style board.
- Rule: continuity and visual consistency are more important than a fixed grid count.

Each panel represents one shot or beat, not necessarily one final video clip. A panel can later be used as a reference for image generation, image-to-video generation, or manual editing.

## Storyboard Data

The generated storyboard package should contain:

- `title`: short working title.
- `sourceSummary`: what the reference appears to be doing.
- `remakeStrategy`: what mechanics to keep and what expression to replace.
- `visualBible`:
  - protagonist description,
  - product description,
  - wardrobe,
  - location,
  - lighting,
  - color palette,
  - camera style,
  - subtitle-safe space,
  - consistency locks such as face, clothing, product shape, logo position, scene style.
- `shots[]`:
  - shot number,
  - estimated duration,
  - shot type,
  - visual action,
  - subject action,
  - product action,
  - voiceover or on-screen text,
  - camera movement,
  - image prompt,
  - video motion prompt,
  - negative prompt,
  - continuity notes.
- `boardImagePrompt`: prompt used to generate the whole visual storyboard image.
- `wholeVideoPrompt`: prompt for future image-to-video or all-in-one video generation.

## UI Design

Inside `爆款视频复刻`, add a compact storyboard section after source actions and before final video generation:

- Button: `一键生成视觉故事板`.
- Optional control: `分镜数量` with `自动`, `6`, `8`, `9`, `12`.
- Output tabs or cards:
  - `爆款拆解`,
  - `分镜提示词`,
  - `视觉统一设定`,
  - `故事板预览`,
  - `整片视频提示词`.

The storyboard preview must show the generated visual board at a readable size without overlapping controls. The result should be editable and copyable. The app should avoid long methodology text in the main surface; show the analysis only as generated output.

## Provider Use

First implementation should use existing provider boundaries:

- LLM provider:
  - analyzes source material,
  - decides shot count,
  - writes storyboard JSON,
  - writes board and video prompts.
- Image provider:
  - generates the visual storyboard image from `boardImagePrompt`.
- Source media service:
  - keeps direct download, upload, extraction, and visual analysis as separate actions.

This phase can use the configured OpenAI-compatible LLM and `gpt-image-2` image provider. The app must surface provider errors honestly and preserve editable prompts so the user can retry without losing planning work.

## Output Artifacts

Save artifacts under the task media folder:

- `storyboard/visual-storyboard.json`
- `storyboard/visual-storyboard.md`
- `storyboard/visual-storyboard.png`

Register the Markdown and image files as media assets so the renderer can preview or export them.

## Error Handling

- If no source material exists, ask the user to add a source link, upload media, paste source copy, or enter a topic brief.
- If visual analysis is missing, continue from source copy and product/topic notes but mark source-visual confidence as low.
- If LLM JSON is malformed, show a retry-ready error rather than silently using mock data.
- If image generation fails, keep the generated prompts and storyboard table so the user can retry image generation later.
- If a source link cannot be downloaded, explain that the user should manually upload the video.

## Testing

Add focused tests for:

- storyboard schema validation and normalization,
- prompt construction for viral remix visual storyboard generation,
- provider failure preserving generated text artifacts,
- image-generation failure leaving retry-ready state,
- renderer display of variable shot counts without fixed 9-grid assumptions.

## Acceptance Criteria

- `爆款视频复刻` can produce a variable-count storyboard prompt set.
- The generated output is not hard-coded to 9 panels.
- The visual board prompt explicitly enforces consistent character, product, clothing, scene, color, and camera style.
- The UI labels the action as `一键生成视觉故事板`.
- The first phase stops at storyboard prompts and visual board generation; final image-to-video generation remains a later provider integration.
