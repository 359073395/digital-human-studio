# Viral Visual Storyboard Design

## Goal

Turn the `爆款视频复刻` mode into a source-first workflow that produces practical planning assets before final video generation:

1. Product/source analysis and multiple editable drama-commerce script options.
2. A confirmed script that the user can edit before spending image/video credits.
3. A structured set of storyboard prompts for each shot.
4. A single visual storyboard image with multiple illustrated panels that keeps people, product, scene, color, and camera style consistent.

The storyboard is meant to help later image-to-video providers such as Seedance, Jimeng, Kling, Wan, or NVIDIA Cosmos understand the whole short-video sequence. It is not fixed to a 9-grid layout.

## Non-Goals

- Do not generate the final video in this phase.
- Do not add a Seedance or Jimeng provider in this phase.
- Do not claim to download protected Douyin links when the URL cannot be directly fetched.
- Do not copy a reference video's distinctive wording, creator persona, catchphrases, music signature, or exact shot sequence.
- Do not force every viral remix into a talking-head avatar workflow.
- Do not show tutorial methodology as large static text in the main UI; convert it into internal workflow behavior.

## User Workflow

1. The user selects `爆款视频复刻`.
2. The user provides one or more source inputs:
   - original video link,
   - uploaded source video,
   - uploaded screenshots,
   - product image,
   - reference person image,
   - editable source copy or topic brief.
3. The user clicks `生成剧情脚本方案`.
4. The app analyzes available source material and generates:
   - product and audience analysis,
   - reusable reference mechanics,
   - conversion strategy,
   - three to five editable story script options,
   - a recommended option copied into the editable AI generated copy.
5. The user reviews or edits the selected script, especially price, claims, product facts, and wording.
6. The user clicks `确认脚本并生成故事板`.
7. The app generates:
   - viral structure summary,
   - originality-safe remake direction,
   - shot list,
   - per-shot prompts,
   - visual consistency bible,
   - one visual storyboard image,
   - one whole-video image-to-video prompt.
8. The user can edit any shot prompt, regenerate the whole storyboard, or regenerate only the visual board later when provider support exists.

## Drama-Commerce Script Stage

The storyboard flow includes a script-control stage before visual generation. This follows the practical product-video workflow where the app does not spend image/video credits until the script direction is useful.

The script stage produces:

- `productAnalysis`: audience, pain points, use cases, product facts, objections, and proof opportunities.
- `referenceMechanics`: abstract source mechanics such as hook function, conflict, proof path, rhythm, and CTA placement.
- `conversionStrategy`: how the script turns attention into trust and action.
- `options[]`: three to five differentiated story scripts with angle, target audience, first-five-second hook, beat sheet, script, reason, and risk notes.
- `recommendedOptionId`: the default script copied into the editable final script.
- `originalityNotes`: what changed from the reference and why it is original.

The visual storyboard must use the currently edited final script as source of truth. Product facts, prices, claims, and CTA from that edited script should not be rewritten during storyboarding.

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
- `productAnalysis`: product, audience, pain points, use cases, objections, and proof opportunities.
- `referenceMechanics`: abstract reference mechanics reused safely.
- `selectedScript`: the confirmed editable script used to create this storyboard.
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

- Button: `生成剧情脚本方案`.
- Candidate script cards: show angle, first-five-second hook, target audience, beat sheet, reason, and a `使用此方案` action.
- Button: `确认脚本并生成故事板`.
- Optional control: `分镜数量` with `自动`, `6`, `8`, `9`, `12`.
- Output cards:
  - `剧情脚本方案`,
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
  - generates script options,
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

- `storyboard/story-script-options.json`
- `storyboard/story-script-options.md`
- `storyboard/story-script-options-prompt.txt`
- `storyboard/visual-storyboard.json`
- `storyboard/visual-storyboard.md`
- `storyboard/visual-storyboard-prompt.txt`
- `storyboard/visual-storyboard.png`

Register the Markdown and image files as media assets so the renderer can preview or export them.

## Error Handling

- If no source material exists, ask the user to add a source link, upload media, paste source copy, or enter a topic brief.
- If script options cannot be generated, do not pretend success; keep the task retry-ready.
- If the user has no confirmed final script, do not generate a visual storyboard.
- If visual analysis is missing, continue from source copy and product/topic notes but mark source-visual confidence as low.
- If LLM JSON is malformed, show a retry-ready error rather than silently using mock data.
- If image generation fails, keep the generated prompts and storyboard table so the user can retry image generation later.
- If a source link cannot be downloaded, explain that the user should manually upload the video.

## Testing

Add focused tests for:

- story script package schema validation and normalization,
- storyboard schema validation and normalization,
- prompt construction for viral remix visual storyboard generation,
- provider failure preserving generated text artifacts,
- image-generation failure leaving retry-ready state,
- renderer display of variable shot counts without fixed 9-grid assumptions.

## Acceptance Criteria

- `爆款视频复刻` first produces multiple editable drama-commerce script options.
- The recommended script option is copied into editable AI generated copy before storyboarding.
- `爆款视频复刻` can produce a variable-count storyboard prompt set.
- The generated output is not hard-coded to 9 panels.
- The visual board prompt explicitly enforces consistent character, product, clothing, scene, color, and camera style.
- The UI labels the actions as `生成剧情脚本方案` and `确认脚本并生成故事板`.
- The first phase stops at storyboard prompts and visual board generation; final image-to-video generation remains a later provider integration.
