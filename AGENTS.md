# Codex Project Rules

## Uploaded Knowledge And GitHub Sync

When the user uploads knowledge documents, viral copy examples, reference videos, source scripts, product materials, or production notes for this app, treat them as reusable product knowledge by default.

Required behavior for future development:

1. Save uploaded learning material inside the app's local task or knowledge storage so it can be reused by script generation, storyboard generation, visual prompts, mixed-cut planning, and dedup analysis.
2. Convert useful reusable lessons into sanitized Markdown notes or built-in knowledge records in the repository when they should travel with the software across computers.
3. Keep private credentials, API keys, Bearer tokens, HeyGen OAuth token bundles, refresh tokens, local SQLite databases, account details, and bulky raw media files out of Git.
4. For videos and large source assets, commit only summaries, analysis reports, prompts, metadata, or reusable rules unless the user explicitly asks to version that raw asset.
5. Before updating GitHub, run the appropriate quality checks for the touched area and commit/push code, docs, and sanitized knowledge updates to `origin`.
6. If a user says "更新到 GitHub", include all current code, documentation, and reusable knowledge changes, but never commit secrets or local runtime data.
7. When the user confirms a feature change, bug fix, UI adjustment, workflow rule, or learned production method should be kept, update GitHub in the same work session unless the user explicitly says not to push yet.
8. When pushing confirmed changes, update the relevant project explanation too: `README.md` for user-facing setup/usage, `CONTEXT.md` for product terms, `docs/adr/` for decisions, and this file for future Codex operating rules.

This rule exists so the project can be cloned on a new computer and continue development with the same product logic, built-in methods, and learned reusable knowledge.
