# Domain: GUI & Rendering

> **Status: Implementation Reference** — This document describes the Canvas2D + D3-Force
> rendering targeted by PR #26. Current main uses simplified React + SVG panels. The
> full Canvas2D renderer is on the feature branch.

The rendering layer is shadow-agent's identity. Everything here is ported from or inspired
by agent-flow (`third_party/agent-flow/`), adapted to shadow-agent's data model.

Full visual spec: `docs/research/visual-design-strategy.md`
Agent-flow source patterns: `docs/research/visual-patterns-agent-flow.md`
Implementation plan: `docs/plans/plan-gui-rendering.md`

## Rendering Stack

Canvas2D for the main graph visualization. D3-Force (`d3-force@^3.0.0`) for physics-based
layout. Three.js (`@react-three/fiber`) for a subtle particle field background. React 19 +
Tailwind for the glass panel overlays. All bundled via Vite inside Electron.

The draw loop runs per-frame via requestAnimationFrame:
`drawAgents()` → `drawEdges()` → `drawParticles()` → `drawToolCalls()` → bloom post-processing.

## Color System: Cold Canvas, Warm Controls

The canvas uses agent-flow's holographic palette — void black (`#050510`), cyan (`#66ccff`),
amber (`#ffbb44`), neon green (`#66ffaa`), crimson (`#ff5566`). Heavy alpha transparency
(0.03–0.25) for glass/holographic effects.

The control panels use sidecar's warm palette — charcoal (`#2D2B2A`), cream text
(`#E8E0D8`), burnt orange accent (`#D97757`). This contrast (cold visualization + warm
controls) creates the feeling of a human operator watching an alien intelligence.

Full CSS variable definitions in `visual-design-strategy.md` §2.

## Node Types

| Node | Shape | Visual |
|------|-------|--------|
| Agent (observed) | Large hexagon | Glow ring matching state color, context donut |
| Phase | Rounded rectangle | Phase name, progress bar, time elapsed |
| Tool call | Small floating card | Tool name, spinning ring while active |
| File | Diamond | File path, attention score as heat color |
| Shadow interpretation | Ghost hexagon | Semi-transparent, dashed border — shadow's thoughts |

Agent states map to colors: idle/thinking → cyan, tool_call → amber, complete → green,
error → crimson, paused → gray, subagent → purple. Each state has a distinct animation
(breathing glow, expanding rings, spinning ring, etc.).

## Edges and Particles

Edges are **tapered bezier curves** — thick at the source, thin at the target. Color matches
the parent node's state at low opacity. Active edges have **particle flow**: comet trails
with labels (e.g., "auth.ts 142 lines") flowing along the path. Particles have progress
(0→1), speed, trail length, and color. They spawn on `tool_started` and `subagent_dispatched`
events.

## Panel Layout

```
┌─────────────────────────────────────────────────────┐
│ Status Bar: session name │ phase │ elapsed │ risk    │
├────────┬────────────────────────────────┬───────────┤
│ Event  │       CANVAS                   │ Shadow    │
│ Feed   │   (full-screen graph)          │ Interp.   │
│ (left) │   hexagons + particles + edges │ Panel     │
│        │                                │ (right)   │
├────────┴────────────────────────────────┴───────────┤
│ Timeline Scrubber: playback controls + event markers │
└─────────────────────────────────────────────────────┘
```

Panels are glass cards (`backdrop-filter: blur(20px)`) that slide in/out. The canvas fills
the center and renders behind the translucent panels. CSS Grid named areas for layout.

## Shadow-Specific Visuals

These are unique to shadow-agent, not ported from agent-flow:

- **Interpretation overlay**: Ghost hexagon ("🔮") connected to agent with dashed edge.
  Materializes when inference returns (scale 0.8→1.0, opacity 0→0.7).
- **Risk heatmap**: Ambient color wash on canvas edges. Amber vignette at medium risk,
  red + subtle shake at critical.
- **Prediction trail**: Dashed ghost path to predicted next node. Multiple trails with
  opacity scaled by confidence. Correct prediction "solidifies" on match.
- **File attention constellation**: Stars sized by attention score, lines connecting
  co-edited files. Clustered by directory.

## Key Dependencies

```
d3-force@^3.0.0, three@^0.170.0, @react-three/fiber@^9.0.0,
react-spring@^9.7.0, class-variance-authority@^0.7.0,
@radix-ui/react-dialog, @radix-ui/react-tooltip
```
