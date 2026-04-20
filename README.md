# AgentVisualCrazy

This is the umbrella workspace for the shadow-agent project.

Layout:
- `shadow-agent/`: the actual product under development
- `docs/`: product notes and implementation plans
- `third_party/sidecar/`: reference clone for runtime and shadow-session patterns
- `third_party/agent-flow/`: reference clone for ingestion, replay, and visualization patterns

How to read this repo:
- this root `README.md` explains the workspace-level layout and shared tooling
- `shadow-agent/README.md` explains the app itself: scope, commands, and current behavior

The `third_party` repos are disposable local references.
- They exist so we can inspect and port patterns into `shadow-agent/`.
- Product code should not import from them at runtime.
- Once a pattern has been absorbed or we no longer need the reference checkout, removing it is fine.
- They are intentionally not part of the main repo history.

Prompt workflow:
- `prompts/*.{json,yaml,yml}` are the single source of truth
- `docs/prompts/*.md` and runtime prompt files are generated artifacts
- repo-root Git hooks are sourced from `.githooks/` and auto-installed during `npm install`
- run `npm run prompts:generate` after prompt edits
- run `npm run prompts:check` to verify parity locally and in CI
