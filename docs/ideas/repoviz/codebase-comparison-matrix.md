# Codebase Comparison Matrix: Shadow-Agent vs RepoVis

## Executive Summary

| Attribute | Shadow-Agent (AgentVisualCrazy) | RepoVis (Kimi Agent) |
|-----------|--------------------------------|----------------------|
| **Primary Purpose** | Desktop observer for live AI agent sessions | Web-based repository architecture visualizations |
| **Target User** | Developer monitoring AI coding agents | Technical stakeholders exploring codebase structure |
| **Data Source** | Live/transcript agent events | Repository metadata (git history, file structure) |
| **Runtime** | Electron desktop app | Static HTML in browser |

---

## Detailed Comparison Matrix

### 1. Tech Stack

| Component | Shadow-Agent | RepoVis | Overlap Assessment |
|-----------|-------------|---------|-------------------|
| **Rendering Engine** | SVG (for graph) + DOM React components | Pure CSS animations + DOM manipulation | **LOW** - Different approaches; Shadow-Agent uses React+SVG, RepoVis uses vanilla JS+CSS |
| **UI Framework** | React 19.1.0 + TypeScript | Vanilla JavaScript (ES6+) | **LOW** - Fundamental architectural difference |
| **State Management** | React useState/useEffect, derived state pattern | Direct DOM manipulation, minimal state | **LOW** - Shadow-Agent has formal state layer |
| **Build Tool** | Vite 7.0 + esbuild | None (static HTML) | **NONE** - RepoVis requires no build |
| **Runtime Environment** | Electron 37.0 (Chromium + Node) | Browser-native | **MEDIUM** - Both web-tech based, different packaging |
| **Package Manager** | npm with package.json | N/A (no dependencies) | **NONE** |

### 2. Visual Design System

| Element | Shadow-Agent | RepoVis | Overlap Assessment |
|---------|-------------|---------|-------------------|
| **Primary Background** | `#07111d` → `#0b1626` gradient with radial glows | `#0a0a12` with radial gradient center | **HIGH** - Both use very dark blue-purple backgrounds |
| **Color Palette** | Cyan (`#7be0ff`), Purple (`#ab5cc3`), Danger (`#ff758f`) | Cyan (`#00e5c8`), Purple (`#a78bfa`), Red (`#ff6b6b`) | **HIGH** - Nearly identical accent colors |
| **Typography** | Segoe UI Variable, system sans-serif | SF Mono, Courier New monospace | **LOW** - Different font philosophies |
| **Border Radius** | Large (14px-26px for cards, 18px-22px for panels) | Medium (8px-16px) | **MEDIUM** - Shadow-Agent more rounded |
| **Glass/Card Aesthetic** | `backdrop-filter: blur(18px)` with semi-transparent backgrounds | `backdrop-filter: blur(8px)` on satellite cards | **HIGH** - Both use glassmorphism |
| **Glow Effects** | Fixed positioned blur circles (34vw) | Box-shadow glows on center sun | **MEDIUM** - Both use glow, different implementations |
| **Spacing Rhythm** | 16px base grid with 22px padding | 20px-40px padding, 4px-16px gaps | **MEDIUM** - Similar density |

### 3. Architecture Patterns

| Pattern | Shadow-Agent | RepoVis | Overlap Assessment |
|---------|-------------|---------|-------------------|
| **Data Flow** | Event sourcing → Derived state → React render | Static data → Direct DOM update | **LOW** - Shadow-Agent has sophisticated pipeline |
| **Event Model** | Canonical events with schema (`CanonicalEvent<T>`) | None (data embedded in HTML) | **NONE** |
| **Update Patterns** | Reactive via React state changes | Timer-based cycling (`setInterval`) | **LOW** - Different reactivity models |
| **Modularity** | Well-structured (shared/, renderer/, electron/) | Single-file HTML pages | **LOW** - Shadow-Agent modular, RepoVis monolithic |
| **Schema Definition** | Full TypeScript interfaces (`schema.ts`) | None (implicit in data structures) | **NONE** |
| **LLM Integration** | Designed for shadow AI interpretation | None (static visualizations) | **NONE** - Shadow-Agent has inference layer |

### 4. Interaction Design

| Pattern | Shadow-Agent | RepoVis | Overlap Assessment |
|---------|-------------|---------|-------------------|
| **Progressive Disclosure** | Static panels with scrollable content | In-place expansion on click/active cycling | **MEDIUM** - Different approaches to showing detail |
| **User Controls** | Buttons for load/export/reload | Click to expand, auto-cycling | **MEDIUM** - Shadow-Agent more control-heavy |
| **Auto-Cycling** | None | 3-second interval cycling through elements | **NONE** - RepoVis only |
| **Hover States** | Subtle border color changes | Transform translate, color shifts | **MEDIUM** - Similar subtlety |
| **Loading States** | Explicit busy states (`'booting' \| 'loading'`) | None (instant render) | **LOW** |

### 5. Visualization Components

| Component | Shadow-Agent | RepoVis | Overlap Assessment |
|-----------|-------------|---------|-------------------|
| **Graph/Nodes** | SVG-based tree layout with rounded rects | CSS orbital animations (satellites) | **MEDIUM** - Both node-based, different layouts |
| **Particles** | Planned (per north-star) but not in current code | None | **LOW** |
| **File Representation** | Bar chart in file attention panel | Thermal grid cells, orbital satellites | **LOW** - Different visual metaphors |
| **Risk/Heat Indicators** | Text badges with color coding (`pill--danger`) | Full thermal camera color gradient | **MEDIUM** - Both use color for intensity |
| **Timeline** | Scrollable event list | Seismograph visualization (separate file) | **MEDIUM** - Different timeline representations |
| **State Visualization** | Node stroke colors (active/idle/completed) | Orbital ring positions (inner/middle/outer) | **MEDIUM** - Both encode state visually |

### 6. Component Patterns

| Pattern | Shadow-Agent | RepoVis | Overlap Assessment |
|---------|-------------|---------|-------------------|
| **Panel/Card** | `panel` class with header/body structure | `exhibit-card` with hover expansion | **HIGH** - Similar container pattern |
| **Badge/Pill** | `pill` with tone variants (neutral/accent/danger) | No equivalent | **LOW** |
| **Status Strip** | 4-column grid of metrics | No equivalent | **NONE** |
| **Empty State** | Explicit `empty-state` class | No equivalent (always has data) | **NONE** |
| **Button Styles** | Ghost and primary variants | Primary/secondary CTA buttons | **MEDIUM** - Similar hierarchy |
| **Grid Layout** | CSS Grid for panels (2-col, responsive) | CSS Grid for thermal/exhibit cards | **HIGH** - Both use modern CSS Grid |

### 7. Animation Patterns

| Animation | Shadow-Agent | RepoVis | Overlap Assessment |
|-----------|-------------|---------|-------------------|
| **Transitions** | 150ms ease for buttons, 150ms for borders | 0.3s-0.4s cubic-bezier(0.16, 1, 0.3, 1) | **MEDIUM** - RepoVis uses more sophisticated easing |
| **Hover Effects** | translateY(-1px) on buttons | translateY(-4px) on cards | **HIGH** - Same lift pattern |
| **Continuous Animation** | None currently | Orbital rotation (20s-90s), pulsing sun | **LOW** - RepoVis more animation-heavy |
| **Expansion Animation** | None (static panels) | Scale + opacity fade on card expansion | **LOW** |

### 8. Data Structures

| Structure | Shadow-Agent | RepoVis | Overlap Assessment |
|-----------|-------------|---------|-------------------|
| **Agent/Node** | `{ id, label, parentId, state, toolCount }` | `{ name, ring, angle, speed, ... }` | **MEDIUM** - Similar entity concept |
| **Event/Timeline** | Rich event schema with 15+ event kinds | Simple timestamped actions | **LOW** |
| **File Attention** | `{ filePath, touches }` with sorting | `{ name, temp, changes, commits, history }` | **MEDIUM** - Both track file activity |
| **Session Metadata** | Full session record with IDs | No session concept | **NONE** |

---

## Key Differences Summary

### Shadow-Agent Strengths
1. **Production-ready architecture** - Modular, typed, testable
2. **Desktop integration** - File I/O, native dialogs via Electron
3. **Event-driven reactivity** - Real-time updates from live sources
4. **LLM integration ready** - Inference layer with prompts
5. **Export/import capabilities** - JSONL replay format

### RepoVis Strengths
1. **Zero dependencies** - Runs anywhere with just a browser
2. **Rich animations** - Orbital mechanics, thermal visualization
3. **Creative visual metaphors** - Gravity wells, tectonic plates, seismographs
4. **Self-contained** - Each visualization is a complete experience
5. **No build step** - Instant deployment

---

## Overlap Analysis Heat Map

```
                    NONE  LOW   MED   HIGH
Tech Stack           [====|=====|=====|====]
Visual Design              [====|==========]
Architecture         [==========|====|    ]
Interaction                [====|=====|===]
Visualizations             [====|=====|===]
Components                 [===|==========]
Animations           [====|=====|=====|   ]
Data Structures      [====|=====|=====|   ]
```

---

## Recommendation: Monorepo Structure

### Verdict: **YES, but with clear boundaries**

These projects share significant **visual design language** and **conceptual goals** (making invisible software processes visible). A monorepo would enable sharing the design system while keeping runtime architectures separate.

### Proposed Monorepo Structure

```
agent-visual-crazy/
├── apps/
│   ├── shadow-agent/          # Electron desktop app (existing)
│   │   ├── src/
│   │   ├── package.json
│   │   └── ...
│   └──
│   └── repovis/               # Web visualizations (migrated from Kimi)
│       ├── exhibits/
│       │   ├── 01-focus-gravity-well/
│       │   ├── 02-drift-tectonic-plates/
│       │   ├── 03-timeline-seismograph/
│       │   ├── 04-churn-thermal/
│       │   └── 05-relationships-river/
│       ├── index.html
│       └── package.json       # Minimal build for deployment
│
├── packages/
│   ├── ui-core/               # Shared design system
│   │   ├── src/
│   │   │   ├── styles/
│   │   │   │   ├── tokens.css     # Colors, spacing, radii
│   │   │   │   ├── glass.css      # Backdrop-filter patterns
│   │   │   │   └── animations.css # Shared transitions
│   │   │   └── components/
│   │   │       ├── Card.tsx
│   │   │       ├── Badge.tsx
│   │   │       └── Panel.tsx
│   │   └── package.json
│   │
│   ├── visualization-core/    # Shared viz utilities
│   │   ├── src/
│   │   │   ├── color-scales.ts    # Thermal/heat color logic
│   │   │   ├── layouts.ts         # Graph layout algorithms
│   │   │   └── animation.ts       # Shared animation configs
│   │   └── package.json
│   │
│   └── event-schema/          # Shared types (if cross-pollination)
│       ├── src/
│       │   └── schema.ts
│       └── package.json
│
├── docs/
│   ├── north-star.md
│   └── design-system.md
│
└── package.json               # Root workspace config
```

### Benefits of Monorepo

1. **Design Consistency**: Single source of truth for colors, spacing, glass effects
2. **Component Reuse**: RepoVis cards could become Shadow-Agent panel variants
3. **Cross-Pollination**: 
   - Shadow-Agent could adopt RepoVis thermal view for file attention
   - RepoVis could adopt Shadow-Agent's event schema for live data
4. **Unified Documentation**: Single north-star for both tools

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| RepoVis loses "zero dependency" simplicity | Keep packages/ui-core CSS-only (no React requirement) |
| Build complexity for static HTML | Use lightweight bundler (Vite) with multi-page config |
| Version coupling | Use workspace:^ for internal deps, strict semver |
| Different release cycles | Independent versioning per app |

### Migration Path

1. **Phase 1**: Extract shared CSS tokens to `packages/ui-core`
2. **Phase 2**: Port RepoVis HTML files to `apps/repovis` with shared styles
3. **Phase 3**: Create hybrid visualizations (thermal view in Shadow-Agent)
4. **Phase 4**: Optional - add live data adapter to RepoVis exhibits

### Final Assessment

| Criteria | Score | Notes |
|----------|-------|-------|
| Shared Code Potential | 7/10 | Design tokens, color utilities, layout algorithms |
| Architectural Alignment | 4/10 | Different runtimes (Electron vs static web) |
| Team Velocity Benefit | 8/10 | Single PR can update both apps' design |
| Maintenance Overhead | 6/10 | Monorepo tooling adds complexity |
| Strategic Value | 9/10 | Unified "agent visualization" product line |

**Overall Recommendation: PROCEED with monorepo, keeping apps loosely coupled via shared packages.**
