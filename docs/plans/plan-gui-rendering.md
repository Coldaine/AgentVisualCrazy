# GUI & Rendering Implementation Plan

> Recommended order across all plans: **GUI Rendering → Event Capture → Inference Engine**
>
> The renderer is the product's identity and can be developed against fixture data.
> Event capture unlocks live data but needs a renderer to display it.
> Inference requires both live events and a renderer for its output.

---

## Scope

Replace the current SVG-based `GraphView` in `App.tsx` with a Canvas2D + D3-Force rendering stack ported from `third_party/agent-flow/`. Add a glass panel overlay system and the full holographic visual language described in `docs/research/visual-design-strategy.md`.

For the atmospheric background layer, choose exactly one strategy for an implementation pass:
- Citadel canvas dot-grid + pulse API (preferred)
- Optional Three.js particle field (`ParticleField.tsx`) if the team wants deeper parallax

## Visual Primitive Libraries

Three reference libraries are available — use what fits, ignore what doesn't:

| Library | Best for | Research doc |
|---------|----------|-------------|
| `third_party/agent-flow` | Hexagonal nodes, D3-Force, particle trails, tapered bezier edges, bloom | `docs/research/visual-patterns-agent-flow.md` |
| `third_party/sidecar` | Runtime patterns, session management | `docs/research/visual-patterns-sidecar.md` |
| `third_party/citadel` | Spring-damped dot-grid background, pulse API (burst/ripple), 13 CSS @keyframes, tier cascade timing | `docs/research/visual-patterns-citadel.md` |

Notable Citadel patterns for this plan: canvas dot-grid as background (step 8 preferred), `card-breathe` for active node glow, `cl-reveal` for panel element entrances, pulse API wired to agent events.

---

## 1. Dependencies to Add

Install in `shadow-agent/`:

```
d3-force@^3.0.0             # Graph physics simulation
react-spring@^9.7.0          # Physics-based animations for panels
class-variance-authority@^0.7.0   # Type-safe CSS variant system
@radix-ui/react-dialog@^1.1.0    # Accessible modal primitives
@radix-ui/react-tooltip@^1.1.0   # Tooltip primitives
```

Optional (only if choosing Option B in Step 8):

```
three@^0.170.0
@react-three/fiber@^9.0.0
```

---

## 2. Color System & CSS Variables

Create `shadow-agent/src/renderer/theme/colors.ts` exporting the full palette from [`visual-design-strategy.md`](../research/visual-design-strategy.md) — section 2 (Color System). Simultaneously update `styles.css` to define CSS custom properties for both the cold canvas palette (`--void`, `--holo-base`, etc.) and the warm control palette (`--surface`, `--accent`, etc.).

This is the first thing to land — every subsequent component references these tokens.

---

## 3. Glass Card Component

Create `shadow-agent/src/renderer/components/GlassCard.tsx`.

Port the `.glass-card` styles from agent-flow's `globals.css`:
- `background: var(--glass-bg)` with `backdrop-filter: blur(var(--glass-blur))`
- `border: 1px solid var(--glass-border))`
- Inset box-shadow for glowing top edge
- Scale-in / scale-out mount animation (0.2s ease-out)

Use CVA for variant props: `size` (sm, md, lg), `glow` (none, subtle, bright), `slide` (left, right, bottom, none).

---

## 4. Canvas2D Rendering Layer

This is the core port from agent-flow. Create:

| File | Purpose |
|------|---------|
| `src/renderer/canvas/CanvasRenderer.tsx` | React wrapper: `<canvas>` element, resize observer, requestAnimationFrame loop |
| `src/renderer/canvas/draw-loop.ts` | The main draw function called each frame |
| `src/renderer/canvas/draw-agents.ts` | Hexagonal agent nodes with state glow and context donut |
| `src/renderer/canvas/draw-edges.ts` | Tapered bezier curves between nodes |
| `src/renderer/canvas/draw-particles.ts` | Comet-trail particles flowing along edges |
| `src/renderer/canvas/draw-tools.ts` | Tool call floating cards with spinning ring |
| `src/renderer/canvas/bloom.ts` | Additive glow post-processing pass |
| `src/renderer/canvas/types.ts` | Shared types for simulation nodes, edges, particles |

### Agent-flow files to study

Agent-flow's equivalent rendering lives in its webview draw loop. The key patterns to port:
- Hexagon path generation (6-vertex polygon with rounded corners)
- State glow: outer shadow ring with color matching `AgentNode.state`
- Context donut: proportional arc segments around the hexagon
- Tapered bezier: `ctx.beginPath()` with variable `lineWidth` from thick (source) to thin (target)
- Particle system: objects with `progress` (0→1 along edge), `trailLength`, `color`, advancing per frame

### Adaptation for shadow-agent's data model

Agent-flow uses its own `Agent` interface. Shadow-agent uses `AgentNode` and `DerivedState` from `schema.ts`. The mapping:

| agent-flow field | shadow-agent source |
|------------------|-------------------|
| `Agent.state` | `AgentNode.state` (active/idle/completed → map to thinking/tool/complete colors) |
| `Agent.tokensUsed / tokensMax` | Not yet in schema — extend `AgentNode` with optional `tokenUsage` |
| `Agent.toolCalls` | `AgentNode.toolCount` |
| `Agent.x, y, vx, vy` | Managed by D3-Force simulation, stored in `SimulationNode` wrapper |
| `Agent.parentId` | `AgentNode.parentId` |
| `Agent.contextBreakdown` | Future: extend schema when inference provides this |

---

## 5. D3-Force Physics Integration

Create `src/renderer/canvas/simulation.ts`.

Initialize the D3-Force simulation per the spec in [`visual-design-strategy.md`](../research/visual-design-strategy.md) — section 4 (Graph Visualization):

```
forceSimulation(nodes)
  .force('charge', forceManyBody().strength(-300))
  .force('link', forceLink(edges).distance(150))
  .force('center', forceCenter(width/2, height/2))
  .force('collide', forceCollide(60))
  .alphaDecay(0.02)
```

The simulation runs continuously. On each tick, update node positions and trigger a canvas redraw. When new `AgentNode` entries appear in `DerivedState`, add them to the simulation. When nodes complete, let them cool but keep them visible.

Wire into `CanvasRenderer.tsx` via a `useSimulation` hook that owns the `d3.forceSimulation` instance.

---

## 6. Particle System

Create `src/renderer/canvas/particles.ts` (data model) and draw logic in `draw-particles.ts`.

Each particle:
- Belongs to an edge (source → target)
- Has `progress` (0→1), `speed`, `color`, `trailLength`, `label`
- Advances by `speed * dt` each frame
- Renders as a bright dot with a fading comet tail behind it

Particle spawning: when a `tool_started` or `subagent_dispatched` event fires, spawn a particle on the relevant edge. When `tool_completed` / `subagent_returned`, spawn a return particle.

---

## 7. Panel Layout Overhaul

Replace the current `<main className="dashboard">` grid with the layout from [`visual-design-strategy.md`](../research/visual-design-strategy.md) — section 5 (Panel Layout):

| Panel | Position | Component File |
|-------|----------|---------------|
| Status Bar | Top, full width | `StatusBar.tsx` |
| Event Feed | Left, slide-in | `EventFeedPanel.tsx` |
| Shadow Interpretation | Right, slide-in | `InterpretationPanel.tsx` |
| Timeline Scrubber | Bottom, fixed | `TimelineScrubber.tsx` |
| Detail Drawer | Bottom, expandable | `DetailDrawer.tsx` |
| Canvas | Center, fills remaining space | `CanvasRenderer.tsx` |

Use CSS Grid named areas. Panels use `GlassCard` with slide-in/out via react-spring. The canvas fills the center area and renders behind the translucent panels.

---

## 8. Optional Background Atmosphere Layer (Choose One)

Choose one background approach and ship it cleanly before adding a second:

**Option A (preferred): Citadel dot-grid canvas**
- Build a lightweight full-screen canvas background adapted from Citadel patterns
- Wire burst/ripple pulse APIs to shadow-agent events (tool start, phase change, risk)
- Keep opacity low and motion subtle so the graph remains primary

**Option B (optional): Three.js `ParticleField.tsx`**
- Create `src/renderer/background/ParticleField.tsx` using `@react-three/fiber`
- 5,000–10,000 point sprites in very slow drift
- Extremely low opacity (0.03–0.08)
- Subtle parallax on mouse movement
- Render in a `<Canvas>` behind the main Canvas2D via CSS z-index
- Add a performance toggle to disable on weaker machines

The background layer is atmospheric only; it must never reduce graph readability.

---

## 9. Shadow-Specific Visual Elements

These are unique to shadow-agent (not ported from agent-flow):

- **Shadow interpretation overlay**: Ghost hexagon node labeled "🔮" connected to agent with dashed edge. Materializes when inference returns. File: extend `draw-agents.ts`.
- **Risk heatmap**: Ambient color wash on canvas edges. Amber vignette at medium risk, red at critical with subtle shake. File: `draw-risk-overlay.ts`.
- **Prediction trail**: Dashed ghost path from current node to predicted next. Multiple trails with opacity scaled by confidence. File: `draw-predictions.ts`.
- **File attention constellation**: Stars sized by attention score, lines connecting co-edited files. File: `DetailDrawer.tsx` tab or standalone `ConstellationView.tsx`.

---

## 10. Implementation Order (Within This Group)

1. Color system + CSS variables (`theme/colors.ts`, `styles.css`)
2. Glass card component (`GlassCard.tsx`)
3. Canvas2D renderer shell + draw loop (`CanvasRenderer.tsx`, `draw-loop.ts`)
4. D3-Force simulation hook (`simulation.ts`)
5. Hexagonal agent nodes (`draw-agents.ts`)
6. Tapered bezier edges (`draw-edges.ts`)
7. Particle system (`particles.ts`, `draw-particles.ts`)
8. Panel layout overhaul (CSS Grid + all panel components)
9. Timeline scrubber (`TimelineScrubber.tsx`)
10. Bloom post-processing (`bloom.ts`)
11. Optional background layer (Citadel dot-grid or `ParticleField.tsx`, not both in first pass)
12. Shadow-specific overlays (risk heatmap, prediction trails, interpretation ghost)
13. Animation polish (react-spring transitions, mount/unmount)

---

## Cross-Group Dependencies

- **From Event Capture plan**: The renderer can be fully developed against fixture data (`paymentRefactorSession` and replay files). However, the live event feed panel and real-time particle spawning require the IPC bridge from the Event Capture plan (step 4 of that plan).
- **From Inference Engine plan**: The shadow interpretation overlay, risk heatmap, and prediction trails render `ShadowInsight[]` data. Until the inference engine produces real insights, these components display the heuristic outputs from `derive.ts`. No blocking dependency — the schema is already defined.
- **Schema extensions**: The renderer will likely need `AgentNode` extended with `tokenUsage` and `contextBreakdown` fields. This is a shared schema change that should be coordinated but is not blocking.
