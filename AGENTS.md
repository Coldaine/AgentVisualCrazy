# AGENTS.md

AgentVisualCrazy is a passive visual observer for AI coding agents. It watches an agent's
transcript, interprets it via a separate "shadow" model, and renders a live visualization.
See [`docs/north-star.md`](docs/north-star.md) for the vision and
[`docs/plans/roadmap.md`](docs/plans/roadmap.md) for what's next.

This is a single flat Electron app — `src/` and `tests/` live at the repo root. No monorepo.

## Read These First

1. `docs/north-star.md` — what we're building and why
2. `docs/plans/roadmap.md` — the forward plan (canonical)
3. `docs/architecture.md` — technical decisions and domain references
4. This file — the rules below

## Where to Find Things

| Topic | Where |
|-------|-------|
| Rendering domain (Canvas2D, D3, color, layout) | `docs/domain-gui.md` |
| Inference domain (providers, auth, prompts, MCP) | `docs/domain-inference.md` |
| Event-capture domain (watcher, schema, drivers) | `docs/domain-events.md` |
| Prompt engineering | `src/inference/prompts.ts` (single source of truth — rationale lives in its doc comment) |
| The visual ambition (UI idea bank) | `docs/ideas/repoviz/` |
| Visual patterns research | `docs/research/visual-patterns-*.md` |
| Tooling philosophy | `docs/tooling-philosophy.md` |

## Visual Fidelity Is Priority #1

When facing a tradeoff, choose visual quality over faster implementation. The bar is the
exhibit-grade concepts preserved in `docs/ideas/repoviz/` (gravity wells, thermal cameras,
seismographs, plus a working React prototype) and the agent-flow rendering patterns now in
`src/renderer/`. Treat them as a palette — mine and adapt, don't follow as a checklist.

## Read-Only Constraint (v1)

Never write files or issue tools on behalf of the observed agent. No interventions, no
corrections, no acting — watch and interpret only. (The one exception is user-initiated replay
export, a deliberate user gesture.)

## Prompt Changes

The shadow system prompt lives at `src/inference/prompts.ts`. Edit the file directly — both the
`SHADOW_SYSTEM_PROMPT` template literal and the doc comment that explains the rationale. There
is no separate source file, no generation step, no parity check. See `.claude/rules/prompts.md`
and `docs/tooling-philosophy.md`.

## Commit Messages

Use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
Always include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

## Git Workflow

- Integrate via **feature branch + PR**; remote `main` is branch-protected.
- Do not treat local `main` commits as the shipping path.
- Build and test from the repo root: `npm run build`, `npm test`.
