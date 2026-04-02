---
status: archived
note: >
  This document is archived. It represents early planning and should not be
  treated as the current plan. See docs/plans/ for current implementation plans
  and docs/architecture.md for current decisions.
---

# Shadow Agent Visualizer

## Working idea

Combine the useful parts of `sidecar` and `agent-flow`, but do **not** make the second agent primarily a chat surface.

Instead, the secondary runtime acts as a **shadow agent**:

- It watches the main agent session from the side.
- It gathers context from one or more other agents or model runs.
- It prepares structured observations, alternative ideas, warnings, and hypotheses.
- It renders those results into a rich visual surface instead of competing for the main text thread.

## Core differentiator

The visual interface is **not** produced by the main agent.

The important distinction is:

- The main agent keeps doing the main work.
- A separate hidden or "secret" shadow agent interprets what is happening.
- That shadow agent drives the visualization layer and can enrich it with extra context from other model passes.

This makes the visualization feel like an intelligent observer rather than a thin replay of logs.

## Desired behavior

- Queue background analysis as if the system had gained context from other agents.
- Let the shadow runtime write to a window surface continuously.
- Use the surface to show what is happening, what might happen next, and what alternative paths exist.
- Support preparatory or synthesis tasks that do not interrupt the main agent.
- Potentially use MCP or a future MCP-oriented layer for some of the background preparation work.

## Why the two repos matter

`sidecar` contributes:

- the parallel runtime model
- the separate window surface
- independent model execution
- context capture and folding

`agent-flow` contributes:

- live event visualization
- session watching and hooks
- graph-oriented rendering of agent activity

The combined direction is:

1. Observe the main agent like `agent-flow`.
2. Run a separate parallel intelligence layer like `sidecar`.
3. Feed the visual layer with both raw activity and shadow-agent interpretation.

## Early product shape

Possible first version:

- Keep the main coding agent untouched.
- Add one shadow agent process that consumes the same session context.
- Give that shadow agent read-only observational responsibilities at first.
- Render a live visual dashboard that mixes:
  - agent activity
  - inferred intent
  - possible next moves
  - risks or drift
  - alternate solution ideas

## Open questions

- Should the shadow agent be read-only, or eventually be allowed to spawn helper agents?
- Should the visualization be strictly live, or also persist as a replayable session artifact?
- Should sidecar folding become structured event emission instead of only summary output?
- Should the visual surface be Electron, VS Code webview, or both?
