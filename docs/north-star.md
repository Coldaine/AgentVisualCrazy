# North Star

Shadow-agent is a **passive visual observer** for AI coding agents.

It sits beside a working agent — Claude Code, Codex, OpenCode, whatever comes next — and shows you what that agent is *thinking*. Not what it typed. Not its raw logs. What it is doing, why, what's risky, and what it will probably do next.

## The Three Pillars

### 1. Watch

Shadow-agent captures the observed agent's transcript in real-time. It normalizes every tool call, message, subagent dispatch, and lifecycle event into a canonical event stream. It never touches the observed agent's work. Read-only is a hard constraint.

### 2. Interpret

A separate AI model (the "shadow") consumes the event stream and produces structured interpretations: current phase, risk signals, file attention, predicted next actions, confidence scores. This is the differentiator — the shadow agent *thinks about* what the observed agent is doing, it doesn't just replay it.

### 3. Render

Everything is displayed through a **rich holographic visualization** ported from agent-flow's Canvas2D + D3-Force renderer. Hexagonal agent nodes with state-colored glow. Particle trails showing data flow. Tapered bezier edges. Glass panels with `backdrop-filter: blur(20px)`. The visual experience is the #1 priority.

## What This Is Not

- **Not a dashboard.** Dashboards are passive displays of metrics. Shadow-agent is an active interpretation system.
- **Not a chat window.** The shadow agent's output is visual, not conversational.
- **Not a replay tool.** Replay is a capability, not the product. The product is live interpretation.
- **Not an intervention system (v1).** The shadow watches and interprets. It does not act on behalf of the observed agent. Suggestions come later.

## The Two Source Repos

This project exists because two repos — vendored in `third_party/` — each solved half the problem:

- **agent-flow** (`third_party/agent-flow/`): Proved that you can visualize an AI agent session as a live holographic graph. Canvas2D rendering, D3-Force physics, particles, hexagonal nodes, glass cards. **We port this rendering stack almost verbatim.**

- **sidecar** (`third_party/sidecar/`): Proved that you can run a separate AI model alongside the primary agent, build context from its transcript, and produce structured output. OpenCode SDK, MCP server, auth chain, session management, drift detection. **We port these runtime patterns almost verbatim.**

Shadow-agent combines them: agent-flow's eyes with sidecar's brain.

## Success Looks Like

You open shadow-agent alongside Claude Code. As Claude works, you see:
- A living graph with hexagonal nodes pulsing in cyan (thinking), amber (tool calling), green (completed)
- Particle trails flowing along edges showing data movement
- A side panel saying "Phase: Implementation — working on auth module, 0.87 confidence"
- Risk indicators: "⚠ Repeated reads on config.ts (6x) — possible confusion"
- Predicted next action: "Will likely run tests next (0.72 confidence)"
- File attention constellation showing which files matter most

You glance at it and immediately understand what the agent is doing, without reading a single line of its transcript.

## What's Hardest

The **shadow interpretation engine** (Phase 3–4). Rule-based phase detection and risk signals are straightforward. Real model-assisted interpretation — where the shadow AI actually reasons about the observed session and produces insights with calibrated confidence — is the hard technical problem. The rendering is complex but understood (agent-flow already works). The interpretation is the research frontier.
