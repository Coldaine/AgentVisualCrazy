# AgentVisualCrazy

This is the umbrella workspace for the shadow-agent project.

Layout:
- `shadow-agent/`: the actual product under development
- `docs/`: product notes and implementation plans
- `third_party/sidecar/`: reference clone for runtime and shadow-session patterns
- `third_party/agent-flow/`: reference clone for ingestion, replay, and visualization patterns

The `third_party` repos are local references. They are intentionally not part of the main repo history.

Prompt workflow:
- `prompts/*.json` are the single source of truth
- `docs/prompts/*.md` and runtime prompt files are generated artifacts
- repo-root `npm install` enables the Husky pre-commit parity check
- run `npm run prompts:generate` after prompt edits
- run `npm run prompts:check` to verify parity locally and in CI
