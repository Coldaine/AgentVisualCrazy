# North Star

**AgentVisualCrazy** is a passive visual observer for AI coding agents.

It sits beside a working agent — Claude Code, Codex, OpenCode, whatever comes next — and
shows you what that agent is *doing* and *thinking*: not its raw logs, but its current
phase, what's risky, where its attention is, and what it will probably do next. You glance
at it and understand the session without reading a line of transcript.

> **On the name.** "Shadow agent" is the *concept* — one agent quietly shadowing another
> and narrating it. The product is **AgentVisualCrazy**. You'll still see `shadow` in the
> code (the interpretation engine, the `SHADOW_*` env vars); treat that as the internal
> name for the observer, not the product.

## The Three Pillars

### 1. Watch
Capture the observed agent's activity in real time and normalize every tool call, message,
subagent dispatch, and lifecycle event into one canonical event stream. Read-only is a hard
constraint — we never write files or act on the observed agent's behalf. *(This works today:
the app live-tails Claude Code JSONL transcripts.)*

### 2. Interpret
A separate AI model — the "shadow" — consumes the event stream and produces structured
interpretation: current phase, risk signals, file attention, predicted next actions,
confidence. This is the differentiator: it *thinks about* the session, it doesn't just
replay it. *(Wired today; local-only by default, off-host inference is opt-in.)*

### 3. Render
Everything is displayed as a **living, beautiful visualization** — a graph of the agent's
work with state-colored nodes, particle trails for data flow, glass panels, and ambient
motion. **Visual fidelity is priority #1.** When facing a tradeoff, choose visual quality.
*(Functional today: a Canvas2D + D3-Force graph and a glass-panel dashboard. Bringing it to
its full ambition is the main work ahead — see the roadmap.)*

## Where the Look Comes From

Two reference projects each solved half the problem; we absorbed their patterns into the app
(the original `third_party/` checkouts have been removed now that the patterns are ported):

- **agent-flow** — visualizing an agent session as a live holographic graph: Canvas2D
  rendering, D3-Force physics, particles, hexagonal nodes, glass cards. The renderer descends
  from this.
- **sidecar** — running a separate model alongside the primary agent: provider/auth chain,
  session management, MCP server, the shadow-interpretation architecture. The inference engine
  descends from this.

The **UI ambition** is captured separately in [`docs/ideas/repoviz/`](ideas/repoviz/) — a
preserved idea bank of ~40 exhibit-grade visualization concepts (gravity wells, thermal
cameras, seismographs, constellation maps) plus a working React prototype. That is the bar the
Render pillar is aiming for; the roadmap mines it deliberately.

## What This Is Not

- **Not a dashboard.** Dashboards passively display metrics. This actively interprets.
- **Not a chat window.** The output is visual, not conversational.
- **Not a replay tool.** Replay is a capability, not the product. The product is live interpretation.
- **Not an intervention system (v1).** It watches and interprets. It never acts for the observed agent.

## Success Looks Like

You open AgentVisualCrazy next to Claude Code. As Claude works, you see:
- A living graph: nodes pulsing cyan (thinking), amber (tool calling), green (done).
- Particle trails along edges showing where work is flowing.
- A panel: "Phase: Implementation — auth module, 0.87 confidence."
- Risk signals: "⚠ Repeated reads on config.ts (6×) — possible confusion."
- A prediction: "Will likely run tests next (0.72)."

…and you understand the session at a glance.

## What's Hardest

The **interpretation engine** — model-assisted reasoning that produces genuinely useful
insights with calibrated confidence — is the research frontier. The rendering is complex but
well-understood (agent-flow proved it). The two together, polished, is the product.
