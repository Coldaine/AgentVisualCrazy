# AGENTS.md

Shadow-agent is a passive visual observer for AI coding agents. It watches an agent's
transcript, interprets what the agent is thinking via a separate AI model, and renders
everything as a live holographic visualization. See `docs/north-star.md` for the full vision.

## Read These First

1. `docs/north-star.md` — What we're building and why
2. `docs/architecture.md` — Technical decisions and domain references
3. This file — The rules below

## Where to Find Things

| Topic | Document |
|-------|----------|
| Visual rendering decisions | `docs/research/visual-design-strategy.md` |
| Rendering domain (Canvas2D, D3, color, layout) | `docs/domain-gui.md` |
| Inference domain (OpenCode, auth, prompts, MCP) | `docs/domain-inference.md` |
| Event capture domain (watcher, schema, adapters) | `docs/domain-events.md` |
| Inference engine research | `docs/research/shadow-inference-architecture.md` |
| Implementation plans | `docs/plans/` |
| Testing and logging plan | `docs/plans/plan-testing-observability.md` |
| Prompt engineering | `prompts/shadow-system-prompt.json` |
| Agent-flow visual patterns (source material) | `docs/research/visual-patterns-agent-flow.md` |
| Sidecar runtime patterns (source material) | `docs/research/visual-patterns-sidecar.md` |
| Citadel animation primitives (source material) | `docs/research/visual-patterns-citadel.md` |

## Visual Fidelity Is Priority #1

When facing a tradeoff, choose visual quality over faster implementation.

`third_party/` contains three reference libraries. Treat them as a palette — pick what fits:

| Library | What it contributes |
|---------|-------------------|
| `agent-flow` | Canvas2D hexagonal nodes, D3-Force physics, particle trails, tapered bezier edges, bloom |
| `sidecar` | Runtime patterns, session management, MCP auth chain, shadow interpretation architecture |
| `citadel` | Spring-damped dot-grid background, pulse API (burst/ripple), 13 CSS @keyframes, tier cascade timing |

You are not required to use all of them. Mix, augment, or ignore as the moment demands.
The research docs catalog which specific patterns are worth stealing and how to adapt them.
`third_party/` is reference material, not product surface area: do not add runtime imports from it,
and if a checkout is no longer useful after its patterns are absorbed, removing it is fine.

## Read-Only Constraint (v1)

Shadow-agent never writes files or issues tools on behalf of the observed agent.
No interventions, no corrections, no acting. It watches and interprets only.

## Prompt Change Workflow (Mandatory)

**Every prompt now has one source of truth plus generated artifacts that must stay in sync:**

1. **Source** (`prompts/shadow-system-prompt.json`) — canonical prompt definition, commentary,
   and iteration log.
2. **Documentation** (`docs/prompts/shadow-system-prompt.md`) — generated from the source file.
3. **Code** (`shadow-agent/src/inference/prompts.ts`) — generated runtime version, loaded by the app.
4. **This file** — states they must match.

**To change a prompt:**

1. Edit the source file first.
2. Update the iteration log in that source file.
3. Run `npm run prompts:generate`.
4. Run `npm run prompts:check`.
5. Use a `prompt:` prefix in the commit message.

Manual edits to generated prompt docs/runtime files cause drift and will fail pre-commit and CI. Don't skip steps.

## Commit Messages

Use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `prompt:`, `chore:`).
Always include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
