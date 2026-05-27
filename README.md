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

Repo-root Git hooks are sourced from `.githooks/` and auto-installed during `npm install`.
Pre-push runs the shadow-agent test suite once before push.

The shadow system prompt lives in `shadow-agent/src/inference/prompts.ts` as a single
source of truth (both runtime template literal and rationale doc comment). No generation
pipeline. See `docs/tooling-philosophy.md` for why.
