# AGENTS.md

AgentVisualCrazy is a passive visual observer for AI coding agents. It watches an agent's
transcript, interprets it via a **Mastra curator agent** (ChatGPT Pro OAuth / Codex endpoint),
and renders a live visualization on a **copied agent-flow** substrate.
See [`docs/north-star.md`](docs/north-star.md) for the vision and
[`docs/plans/roadmap.md`](docs/plans/roadmap.md) for what's next.

Runtime data and config live under `~/.agentvisualcrazy/`. Layout and build boundaries
are documented in [`docs/architecture.md`](docs/architecture.md) ("As built").

## Read These First

1. `docs/north-star.md` — what we're building and why
2. `docs/plans/roadmap.md` — the forward plan (canonical)
3. `docs/architecture.md` — technical map + current state + gaps
4. `docs/plans/req-v1-curator.md` — governing requirements
5. `docs/plans/visual-gui-donors.md` — substrate & reference inventory
6. `docs/plans/forward.md` — the post-scaffold pivot plan (what to do next)
7. This file — the rules below

## Where to Find Things

| Topic | Where |
|-------|-------|
| Product vision | `docs/north-star.md` |
| Architecture | `docs/architecture.md` |
| Roadmap | `docs/plans/roadmap.md` |
| Forward plan | `docs/plans/forward.md` |
| Curator requirements | `docs/plans/req-v1-curator.md` |
| Substrate / GUI inventory | `docs/plans/visual-gui-donors.md` |

## Substrate Doctrine (non-negotiable)

- **agent-flow code is COPIED as the renderer substrate.** It becomes our code. We edit it freely.
- We do **not** vendor agent-flow under `third_party/`.
- We do **not** "absorb patterns and rebuild." That doctrine is explicitly rejected.
- Layer a **Mastra curator agent** + **ChatGPT Pro OAuth** (Codex endpoint) on top of the copied substrate.
- Electron shell hosts the Next/Vite renderer; Mastra runs in the main process.
- Naming: **curator** / **AgentVisualCrazy** / **`~/.agentvisualcrazy/`**. Do not use "shadow" language.

## Visual Fidelity Is Priority #1

When facing a tradeoff, choose visual quality over faster implementation. The bar is the
living agent-flow graph plus curated exhibit stages — not Phase/Risk/Next dashboard slots.

## Read-Only Constraint (v1)

Never write files or issue tools on behalf of the observed agent. No interventions, no
corrections, no acting — watch and interpret only. (The one exception is user-initiated replay
export, a deliberate user gesture.)

## Commit Messages

Use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
Always include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

## Git Workflow

- Integrate via **feature branch + PR**; remote `main` is branch-protected.
- Do not treat local `main` commits as the shipping path.
- Build and test from the repo root: `npm run build`, `npm test`.
