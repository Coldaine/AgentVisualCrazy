# Shadow-Agent Visual Design Strategy

> Unified visual direction synthesized from agent-flow, sidecar, and Coldaine portfolio.
> This is the opinionated design spec for shadow-agent's UI upgrade.

---

## Core Thesis

Shadow-agent is a **passive visual observer** — a window into the mind of an AI coding agent.
The visual experience must feel like looking through a **holographic observation deck**.
Not a dashboard. Not a terminal. A living, breathing visualization where you can **see the agent think**.

---

## 1. Aesthetic: Cold Canvas, Warm Controls

Blend agent-flow's cyberpunk holographic canvas with sidecar's warm, minimal controls.

### Canvas Layer (Cold)
- Background: `#050510` void black with subtle hex grid pattern
- Nodes and edges: cyan/amber/green holographic palette from agent-flow
- Particle trails, glow effects, bloom post-processing
- This is the "stage" — cold, precise, alien

### Control Layer (Warm)
- Panel backgrounds: `rgba(45, 43, 42, 0.85)` warm charcoal with blur
- Text: `#E8E0D8` cream
- Accent buttons: `#D97757` burnt orange (sidecar)
- Interactive controls feel human, tactile, workshop-like
- This is the "cockpit" — warm, grounded, functional

### The Contrast Creates Depth
Cold visualization + warm controls = the feeling of a human operator watching an alien intelligence work.

---

## 2. Color System

```css
:root {
  /* Canvas palette (cold, from agent-flow) */
  --void:               #050510;
  --hex-grid:           #0d0d1f;
  --holo-base:          #66ccff;
  --holo-bright:        #aaeeff;
  --holo-hot:           #ffffff;

  /* Agent state colors */
  --state-idle:         #66ccff;    /* cyan */
  --state-thinking:     #66ccff;    /* cyan, pulsing */
  --state-tool:         #ffbb44;    /* amber — expensive */
  --state-complete:     #66ffaa;    /* neon green */
  --state-error:        #ff5566;    /* crimson */
  --state-paused:       #888899;    /* gray */
  --state-waiting:      #ffaa33;    /* orange */
  --state-subagent:     #cc88ff;    /* purple */

  /* Risk signal colors */
  --risk-low:           #66ffaa;    /* green */
  --risk-medium:        #ffbb44;    /* amber */
  --risk-high:          #ff5566;    /* crimson */
  --risk-critical:      #ff2244;    /* hot red + pulse */

  /* Control palette (warm, from sidecar) */
  --surface:            #2D2B2A;
  --surface-raised:     #3A3836;
  --text-primary:       #E8E0D8;
  --text-secondary:     #888380;
  --accent:             #D97757;
  --accent-hover:       #E89070;
  --border:             #4A4744;

  /* Glass effects */
  --glass-bg:           rgba(10, 15, 30, 0.7);
  --glass-border:       rgba(100, 200, 255, 0.15);
  --glass-blur:         20px;
  --glass-glow:         rgba(100, 200, 255, 0.08);
}
```

---

## 3. Rendering Stack

```
Layer 0: Three.js particle field (subtle depth backdrop)
Layer 1: Canvas2D main visualization (D3-Force graph)
Layer 2: HTML/CSS overlay panels (glass cards)
Layer 3: Modal overlays (setup wizard, fold-style processing)
```

### Why Canvas2D + D3-Force (not React Flow)

1. **Performance**: Canvas2D handles 100+ animated nodes with particles at 60fps
2. **Visual control**: Full pixel control for glow, bloom, tapered edges, particle trails
3. **Proven**: agent-flow already demonstrates this stack works beautifully for agent viz
4. **Physics**: D3-Force gives organic, self-organizing layout without manual positioning

### Three.js Background Layer

A subtle particle field behind the Canvas2D layer creates depth:
- 5,000-10,000 particles in very slow drift
- Subtle parallax on mouse movement
- Extremely low opacity (0.03-0.08) — atmosphere, not distraction
- Optional: disable for performance

---

## 4. Graph Visualization

### Node Types

| Node | Shape | Visual |
|------|-------|--------|
| **Agent** (observed) | Large hexagon | Glow ring matching state color, context donut |
| **Phase** | Rounded rectangle | Phase name, progress bar, time elapsed |
| **Tool call** | Small card | Tool name, args summary, spinning ring while active |
| **File** | Diamond | File path, attention score heat color |
| **Shadow interpretation** | Hexagon (ghost) | Semi-transparent, dashed border — shadow's own thoughts |

### Node States

```
idle       → steady cyan glow, slow breathing animation
thinking   → cyan pulse (0.5s), expanding rings
tool_call  → amber glow, spinning ring, tool card attached
complete   → green flash → fade to steady green
error      → crimson flash → steady crimson + shake
paused     → gray, reduced opacity
```

### Edges

- **Tapered bezier curves** (thick at source, thin at target) — from agent-flow
- Color matches the parent node's state color at low opacity
- Active edges have **particle flow** (comet trails with labels)

### Physics (D3-Force)

```typescript
const simulation = d3.forceSimulation(nodes)
  .force('charge', d3.forceManyBody().strength(-300))
  .force('link', d3.forceLink(edges).distance(150))
  .force('center', d3.forceCenter(width/2, height/2))
  .force('collide', d3.forceCollide(60))
  .alphaDecay(0.02);   // Slow cooling for organic feel
```

---

## 5. Panel Layout

```
┌─────────────────────────────────────────────────────────┐
│ Status Bar: session name │ phase │ elapsed │ risk level  │
├────────┬────────────────────────────────┬───────────────┤
│        │                                │               │
│ Event  │       CANVAS                   │  Shadow       │
│ Feed   │   (full-screen graph)          │  Interpre-    │
│        │                                │  tation       │
│ (left  │   hexagons + particles +       │  Panel        │
│  slide)│   tool cards + edges           │               │
│        │                                │  (right       │
│        │                                │   slide)      │
│        │                                │               │
├────────┴────────────────────────────────┴───────────────┤
│ Timeline Scrubber: [◀ ▶ ⏸ 1x] ═══●═══════════════════  │
├─────────────────────────────────────────────────────────┤
│ Detail Drawer (slide-up): file attention │ risk │ next   │
└─────────────────────────────────────────────────────────┘
```

### Panel Behaviors

- **Event Feed** (left): Glass panel, slides in/out. Shows canonical events as compact cards with timestamp + icon + one-line summary. Auto-scrolls.
- **Shadow Interpretation** (right): Glass panel. Shows derived state — current phase, risk signals, confidence, next predicted moves. This is shadow-agent's unique value.
- **Timeline Scrubber** (bottom): Horizontal timeline with event markers. Playback controls. Brush selection for time ranges. Event clustering for dense periods.
- **Detail Drawer** (bottom, expandable): Tabbed drawer with file attention heatmap, risk signal details, and next-move predictions.
- **Status Bar** (top): Minimal. Session name, current phase, elapsed time, overall risk level indicator.

### Panel Animations

```typescript
// Mount: slide in from edge + fade
{ transform: 'translateX(-100%)', opacity: 0 }
  → { transform: 'translateX(0)', opacity: 1 }
  duration: 300ms, easing: ease-out

// Unmount: reverse
// New content: crossfade (150ms)
// Risk escalation: brief red flash on status bar
```

---

## 6. Shadow-Specific Visual Elements

These are visual patterns **unique to shadow-agent** — not borrowed from any reference.

### Shadow Interpretation Overlay

When the shadow engine produces an interpretation, render it as a **ghost overlay** on the canvas:
- Semi-transparent hexagon node labeled "Shadow" or "🔮"
- Connected to the agent node with a dashed edge
- Contains: confidence %, interpretation text, predicted next action
- Fades in with a "materialization" animation (scale 0.8 → 1.0, opacity 0 → 0.7)

### Risk Heatmap

Overlay the canvas with a subtle color wash indicating risk level:
- Low risk: no overlay (clean canvas)
- Medium risk: faint amber vignette at edges
- High risk: amber vignette intensifies + subtle pulse
- Critical risk: red vignette + canvas slight shake (1px, 100ms) + status bar flash

### File Attention Constellation

Instead of a boring list, render the file attention map as a **constellation**:
- Each file is a star, size proportional to attention score
- Files recently touched glow brighter
- Files with high churn (many edits) pulse
- Clustering: related files (same directory) form constellation groups
- Lines connecting files that were edited together

### Prediction Trail

When shadow-agent predicts the next action, render a **ghost trail** on the graph:
- A faint, dashed path from the current position to the predicted next node
- Multiple predictions = multiple ghost trails, opacity scaled by confidence
- When the agent actually moves, the correct trail "solidifies" (flash → solid)

---

## 7. Animation Standards

| Animation | Duration | Easing | Trigger |
|-----------|----------|--------|---------|
| Node enter | 300ms | ease-out | New agent/event |
| Node exit | 200ms | ease-in | Agent complete |
| Panel slide | 300ms | ease-out | Toggle |
| Status flash | 150ms | linear | Risk change |
| Particle speed | 2-5s | linear | Continuous |
| Breathing glow | 2s | ease-in-out | Idle state |
| Pulse ring | 500ms | ease-out | Thinking state |
| Shake | 100ms | linear | Error/critical |

---

## 8. Technology Choices

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Graph rendering | Canvas2D | Performance, pixel control, proven by agent-flow |
| Graph physics | D3-Force | Self-organizing layout, agent-flow reference |
| Background depth | Three.js (@react-three/fiber) | Particle field, post-processing |
| UI panels | React 19 + Tailwind | Already in shadow-agent, fast development |
| Component variants | CVA (class-variance-authority) | Type-safe variant system |
| Animations | react-spring + CSS | Physics-based mount/unmount + simple transitions |
| Primitives | Radix UI | Accessible dialogs, dropdowns, tooltips |
| Electron shell | Electron (existing) | Desktop app, tray integration |

### New Dependencies to Add

```json
{
  "d3-force": "^3.0.0",
  "@react-three/fiber": "^9.0.0",
  "three": "^0.170.0",
  "react-spring": "^9.7.0",
  "class-variance-authority": "^0.7.0",
  "@radix-ui/react-dialog": "^1.1.0",
  "@radix-ui/react-tooltip": "^1.1.0",
  "@radix-ui/react-dropdown-menu": "^2.1.0"
}
```

---

## 9. Implementation Order

1. **Color system + glass cards** — Replace current CSS variables, implement glass card component
2. **Canvas2D rendering layer** — Replace SVG graph with Canvas2D + D3-Force
3. **Agent nodes + edges** — Hexagons with state glow, tapered bezier edges
4. **Particle system** — Data flow particles along edges
5. **Panel layout overhaul** — CSS Grid named areas, slide-in panels
6. **Timeline scrubber** — Horizontal timeline with playback controls
7. **Three.js background** — Subtle particle field behind canvas
8. **Shadow-specific visuals** — Interpretation overlay, risk heatmap, prediction trails
9. **Animations + polish** — react-spring, mount/unmount, state transitions
10. **Setup wizard** — First-run configuration flow

---

## 10. Design Principles

1. **Show, don't tell**: Prefer visual indicators over text labels
2. **Alive, not static**: Everything should breathe — subtle animations, particle flow, gentle pulses
3. **Information density**: Pack information into visual encoding (color, size, position, opacity, animation speed) rather than text
4. **Progressive disclosure**: Overview first (graph + particles), details on demand (panels, drawers)
5. **The shadow is visible**: Shadow-agent's own interpretations should be visually distinct (ghost/transparent) from the observed agent's actual state
