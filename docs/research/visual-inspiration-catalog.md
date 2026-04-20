# Visual Inspiration Catalog: Portfolio & Open Source

> **Archived reference (2026-04-20):** Patterns here informed the shipped Canvas2D renderer
> and panel polish. Keep for future inspiration, not as an active implementation checklist.

> Additional visual patterns mined from Coldaine's GitHub portfolio and open-source ecosystem.
> These supplement the two primary references (agent-flow and sidecar).

---

## 1. ui-interactive-viz (Coldaine)

**React Flow + Three.js particle visualization for node graphs**

### Key Patterns

- **Particle edges**: Data flows visualized as particles moving along React Flow edge paths
- **Animated node glow**: Selected/active nodes emit pulsing radial glow
- **Minimap with heat indicators**: React Flow minimap with colored overlays showing activity density
- **Connection animations**: New edges animate in with a "drawing" effect (SVG stroke-dasharray)
- **Zoom-dependent detail levels**: At low zoom → simple circles; medium zoom → labels; high zoom → full detail with metrics

### Steal

```
✓ Particle edge technique (use on Canvas2D instead of React Flow)
✓ Zoom-dependent LOD (level of detail) rendering
✓ Connection "drawing" animation for new edges
```

---

## 2. ui-jules-control-room (Coldaine)

**Control room / mission control panel layout for AI agent monitoring**

### Key Patterns

- **12-panel grid layout**: CSS Grid with named areas, panels resize with the window
- **Activity feed cards**: Compact cards with timestamp, icon, one-line description, status dot
- **Status light indicators**: Small colored circles (green/amber/red) with CSS animation pulse
- **Panel headers with controls**: Each panel has a title bar with minimize/maximize/filter toggles
- **Dark radar aesthetic**: Dark backgrounds (#0a0a12), green scan lines, circular radar sweep animation

### Steal

```
✓ Named CSS Grid panel layout (adaptable to shadow-agent's panels)
✓ Activity feed card design (for shadow-agent's event timeline)
✓ Status light pulse animation
✓ Panel header minimize/maximize pattern
```

---

## 3. Futurismxnostalgiaplayground (Coldaine)

**Three.js + react-spring playground with cyberpunk/glitch effects**

### Key Patterns

- **Three.js particle field background**: 10,000+ particles with subtle drift, parallax on mouse move
- **Glitch text effect**: CSS-only text glitch using clip-path + color channel separation
- **Neon text glow**: Multi-layer text-shadow (0 0 10px, 0 0 20px, 0 0 40px) in accent color
- **react-spring physics animations**: Springy mount/unmount, wobble on interaction
- **CRT scanline overlay**: CSS repeating-linear-gradient creating horizontal scan lines
- **Chromatic aberration**: Offset red/blue channels on text/images

### Steal

```
✓ Three.js particle background (for shadow-agent's canvas backdrop, behind the graph)
✓ Glitch text effect (for error states, risk warnings)
✓ Neon glow text-shadow technique
✓ react-spring springy animations (panel mount/unmount, card interactions)
✗ CRT scanlines (too retro for this project)
```

---

## 4. Uigraphnotes2 (Coldaine)

**Glassmorphism graph nodes with dagre layout**

### Key Patterns

- **GlassNode component**: Frosted glass cards as graph nodes with backdrop-filter
  ```css
  .glass-node {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }
  ```
- **dagre auto-layout**: Hierarchical top-down layout algorithm for directed graphs
- **Minimap**: React Flow minimap styled to match glass theme
- **Edge labels**: Text on edges with glass background pill
- **Node type variants**: Different glass tint/border-color for different node types
- **Drag-and-select**: Lasso selection with glass highlight overlay

### Steal

```
✓ GlassNode styling (foundation already in shadow-agent's CSS — enhance it)
✓ dagre layout as fallback when D3-Force is too chaotic
✓ Edge label pills
✓ Node type color variants (map to shadow-agent's event kinds)
```

---

## 5. Comprehensivestylelibrarycreation (Coldaine)

**Radix UI component library with CVA (class-variance-authority)**

### Key Patterns

- **CVA variant system**: Type-safe component variants
  ```typescript
  const button = cva("base-classes", {
    variants: {
      intent: { primary: "...", danger: "...", ghost: "..." },
      size: { sm: "...", md: "...", lg: "..." },
    },
    defaultVariants: { intent: "primary", size: "md" },
  });
  ```
- **Radix UI primitives**: Accessible dialog, dropdown, tooltip, popover
- **Dark theme tokens**: Design tokens as CSS custom properties
- **Compound components**: Slot-based composition (Header, Body, Footer within Card)
- **Transition presets**: Standardized animation durations and easings

### Steal

```
✓ CVA variant system for shadow-agent's component library
✓ Radix primitives for accessible overlays/dropdowns
✓ Design token architecture (CSS custom properties)
✓ Compound component patterns
```

---

## 6. KnowledgeGraphSystem (Coldaine)

**Knowledge graph with LLM-powered node extraction**

### Key Patterns

- **Force-directed graph with labeled edges**: D3-Force with edge labels and directional arrows
- **Entity type coloring**: Color-coded node rings by entity type
- **Search-to-highlight**: Search query highlights matching nodes, dims others
- **Tooltip on hover**: Rich tooltips with entity metadata
- **Graph legend**: Floating legend panel explaining color codes

### Steal

```
✓ Search-to-highlight interaction (find events/agents in the graph)
✓ Floating legend panel
✓ Entity type ring coloring (maps to EventKind in shadow-agent)
```

---

## 7. the-watchman (Coldaine)

**Visual timeline with Neo4j graph database**

### Key Patterns

- **Horizontal timeline scrubber**: Draggable timeline with event markers at timestamps
- **Time range selection**: Brush selection to zoom into a time range
- **Event clustering**: Events too close together collapse into a count badge
- **Playback controls**: Play/pause/speed buttons to animate through timeline

### Steal

```
✓ Timeline scrubber with event markers
✓ Time range brush selection
✓ Event clustering for dense periods
✓ Playback animation controls
```

---

## 8. Open Source References

### react-flow (xyflow/xyflow)
- Custom node/edge renderers
- Minimap, controls, background patterns
- Huge ecosystem of plugins

### d3-force
- Already used by agent-flow
- forceLink, forceManyBody, forceCenter, forceCollide
- Custom forces possible (e.g., forceCluster for grouping)

### framer-motion / react-spring
- Layout animations (AnimatePresence for mount/unmount)
- Spring physics for natural-feeling interactions
- Gesture support (drag, pinch, etc.)

### Three.js + @react-three/fiber
- For particle background / depth effects behind 2D graph
- Post-processing (bloom, chromatic aberration, vignette)
- Can be layered behind Canvas2D or React Flow

---

## Summary: Pattern Priority Matrix

| Pattern | Source | Priority | Effort |
|---------|--------|----------|--------|
| Holographic color palette | agent-flow | **P0** | Low |
| Canvas2D + D3-Force graph | agent-flow | **P0** | High |
| Particle data flow | agent-flow | **P0** | Medium |
| Glass card panels | agent-flow + graphnotes | **P0** | Low |
| Hexagonal agent nodes | agent-flow | **P1** | Medium |
| Three.js particle background | futurism | **P1** | Medium |
| Timeline scrubber | the-watchman | **P1** | Medium |
| Setup wizard | sidecar | **P1** | Low |
| CVA variant system | stylelib | **P1** | Low |
| Drift detection | sidecar | **P2** | Medium |
| Zoom-dependent LOD | interactive-viz | **P2** | Medium |
| Glitch text for errors | futurism | **P2** | Low |
| dagre fallback layout | graphnotes | **P2** | Low |
| react-spring animations | futurism | **P2** | Medium |
| Search-to-highlight | knowledge-graph | **P3** | Low |
| CRT/retro effects | futurism | **Skip** | — |
