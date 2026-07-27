# North Star — AgentVisualCrazy v1

AgentVisualCrazy is a **passive visual observer** for AI coding agents. It watches a live
session, reasons about it with a curator agent, and renders a living visual surface — not a
status dashboard.

## The loop

| Stage | What it means |
|-------|----------------|
| **Watch** | Ingest the observed agent's transcript and tool traffic read-only. Never write files or act on the observed agent's behalf. |
| **Interpret** | A **Mastra curator agent** (ChatGPT Pro OAuth / Codex endpoint) investigates the session: look back, form hypotheses, gather evidence. It is a **reasoning curator**, not a classifier dumping Phase / Risk / Next slots. |
| **Render** | A **copied agent-flow** living visual (Canvas2D + D3 force graph, trails, tool cards) plus an **Exhibit Stage** where the curator authors and composes exhibit artifacts on the fly. |

## What success looks like

Success is a **living graph** of the agent's work *and* **curated exhibits** that surface
meaning — investigations, timelines, attention maps, briefings — composed by the curator.

Success is **not**:

- A fixed Phase / Risk / Next dashboard
- A thin imitation rebuilt after "harvesting patterns" from agent-flow
- A classifier that labels mood and moves on

## Doctrine (locked)

1. **agent-flow is the copied substrate.** Its renderer code is our code. We do not vendor it under `third_party/`, and we explicitly reject the old doctrine of *absorb patterns and rebuild*.
2. **Curator on top.** Mastra in the Electron main process; ChatGPT Pro OAuth (Codex endpoint) for inference.
3. **Naming.** Use *curator*, *AgentVisualCrazy*, and `~/.agentvisualcrazy/`. Do not use "shadow" language.
4. **Visual fidelity first.** Prefer exhibit-grade living visuals over faster, thinner UI.

## Governing companions

- [`plans/req-v1-curator.md`](plans/req-v1-curator.md) — requirements for substrate + curator
- [`plans/visual-gui-donors.md`](plans/visual-gui-donors.md) — substrate & reference inventory
- [`plans/forward.md`](plans/forward.md) — post-scaffold pivot plan (what to do next)
- [`architecture.md`](architecture.md) — technical map + current state + gaps
- [`plans/roadmap.md`](plans/roadmap.md) — milestones M1–M5
