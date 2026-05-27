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
| Prompt engineering | `shadow-agent/src/inference/prompts.ts` (single source of truth — rationale, philosophy, eval plan, iteration log all in the doc comment) |
| Tooling philosophy (why the build/CI/hooks are sized this way) | `docs/tooling-philosophy.md` |
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

## Prompt Changes

The shadow system prompt lives at `shadow-agent/src/inference/prompts.ts`.
Edit the file directly — both the `SHADOW_SYSTEM_PROMPT` template literal
and the doc comment that explains the rationale. There is no separate
source file, no generation step, no parity check. See the rules in
`.claude/rules/prompts.md` and the meta-rationale in
`docs/tooling-philosophy.md` for why it's structured this way.

## Commit Messages

Use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
Always include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

## Git Workflow

- Integrate via **feature branch + PR** only; remote `main` is branch-protected.
- Do not treat local `main` commits as the shipping path.
- Do not call open PRs "stale" without rebasing onto current `main` and re-evaluating whether their ideas are still worth porting.
