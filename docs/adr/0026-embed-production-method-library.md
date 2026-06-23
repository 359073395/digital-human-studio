# ADR 0026: Embed Production Methods as a Software Library

The workbench should not treat learned short-video methods as loose prompt decoration. The user expects prior learning about video breakdown, viral remix, Image2 storyboards, AI talking-head pipelines, digital-human automation, product-to-commerce workflows, personal IP videos, and mixed-cut videos to become built-in software behavior.

We will add a shared production workflow registry, not just a main-process prompt helper. The registry defines the built-in methods, default inputs, required stages, expected outputs, provider needs, and quality gates for every video mode. Script generation, storyboard generation, and the renderer all read from the same registry, so the app behavior and UI stay aligned.

The embedded method library includes:

- Claude Code style video breakdown: first frame, hook, beat order, proof, rhythm, subtitles, CTA, and originality risk.
- Viral reference remix: reuse mechanics, replace expression, examples, persona, catchphrases, music identity, and shot signatures.
- Image2 storyboard workflow: one unified multi-panel board with continuity locks and per-shot image/video prompts for Seedance, Jimeng, Kling, and similar image-to-video models.
- AI talking-head pipeline: source extraction, analysis, editable script, avatar/image selection, lip-sync, subtitles, cover, and export.
- Product-to-commerce workflow: product category, target user, pain point, proof, offer, objections, CTR/GPM thinking, and safe claims.
- Personal IP workflow: classify store visit, knowledge output, opinion, daily workflow, industry insight, experience sharing, community interaction, or commerce.
- Mixed-cut workflow: analyze uploaded material by visual proof, pacing role, caption role, and edit order without assuming a human presenter.

Uploaded knowledge bases and viral-copy examples are dynamic task inputs. The MVP stores them as task assets and injects text-readable files into script/storyboard generation context. PDF/DOCX files are saved and indexed by filename first; richer parsing and retrieval can be added later without changing the workflow registry.

The stable SOP layer lives in `src/shared/productionWorkflows.ts`. The prompt helper in `src/main/script/productionMethodLibrary.ts` converts that registry into model instructions, while the renderer shows a compact workflow card for the active mode. This makes learned methods visible as product behavior rather than only hidden prompt decoration.

Tests must assert that script prompts and storyboard prompts include the relevant method modules, so the app does not regress into simple prompt concatenation.
