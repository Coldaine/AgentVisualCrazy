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
| Prompt engineering | `docs/prompts/shadow-system-prompt.md` |
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

## Read-Only Constraint (v1)

Shadow-agent never writes files or issues tools on behalf of the observed agent.
No interventions, no corrections, no acting. It watches and interprets only.

## Prompt Change Workflow (Mandatory)

**Every prompt exists in three locations that must stay in sync:**

1. **Documentation** (`docs/prompts/shadow-system-prompt.md`) — canonical, with inline
   commentary explaining why each section exists.
2. **Code** (`shadow-agent/src/inference/prompts.ts`) — runtime version, loaded by the app.
3. **This file** — states they must match.

**To change a prompt:**

1. Edit the documentation file first. Update text and commentary.
2. Update the iteration log at the bottom of the prompt doc.
3. Update the code file to match character-for-character.
4. Use a `prompt:` prefix in the commit message.

Undocumented prompt changes cause regression, drift, and opacity. Don't skip steps.

## Commit Messages

Use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `prompt:`, `chore:`).
Always include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
