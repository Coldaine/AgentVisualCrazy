# Agent Visual Suite

## Unified visualization for AI agents and code repositories.

---

## The Vision

A monorepo containing visual tools that make invisible software processes visible:

- **Shadow-Agent**: Live observation of AI coding agents (what Claude is doing *right now*)
- **RepoVis**: Repository architecture visualization (what your code *looks like*)

Both share a common visual language: dark cosmic aesthetics, glassmorphism, ambient data display.

---

## Repository Structure

```
agent-visual-suite/
├── apps/
│   ├── shadow-agent/          # Electron desktop app
│   │   ├── src/
│   │   │   ├── renderer/      # React UI
│   │   │   ├── electron/      # Main process
│   │   │   └── shared/        # Types, utilities
│   │   └── package.json
│   │
│   └── repovis/               # VS Code extension + web views
│       ├── src/
│       │   ├── extension.ts   # VS Code extension entry
│       │   ├── webview/       # React components
│       │   └── core/          # Git providers, LLM adapters
│       └── package.json
│
├── packages/
│   ├── ui-core/               # Shared design system
│   │   ├── src/
│   │   │   ├── tokens.css     # Colors, spacing, typography
│   │   │   ├── glass.css      # Backdrop-filter patterns
│   │   │   └── components/    # Card, Panel, Badge
│   │   └── package.json
│   │
│   ├── viz-core/              # Visualization utilities
│   │   ├── src/
│   │   │   ├── color-scales.ts    # Thermal, heat colors
│   │   │   ├── layouts.ts         # Graph algorithms
│   │   │   └── animation.ts       # Shared transitions
│   │   └── package.json
│   │
│   └── event-schema/          # Shared types
│       └── src/
│           └── index.ts
│
├── docs/
│   ├── design/
│   │   ├── repovis-visualization-spec.md      # Ambient/cosmology design
│   │   ├── repovis-vscode-panel-spec.md       # Guided tour pattern
│   │   ├── repovis-implementation-plan.md     # 12-week build plan
│   │   └── codebase-comparison-matrix.md      # Shadow-Agent vs RepoVis analysis
│   │
│   └── north-star.md          # Unified vision (merge with existing)
│
└── package.json               # Workspace root
```

---

## Design System

### Color Palette (from both projects)

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg-primary` | `#0a0a12` | Main background |
| `--color-bg-secondary` | `#0d0d1a` | Card backgrounds |
| `--color-accent-cyan` | `#00e5c8` | Primary accent, active states |
| `--color-accent-purple` | `#a78bfa` | Secondary accent, links |
| `--color-accent-pink` | `#f472b6` | Highlights, special states |
| `--color-accent-red` | `#ff6b6b` | Danger, errors, high heat |
| `--color-accent-orange` | `#f97316` | Warnings, medium heat |
| `--color-accent-green` | `#22c55e` | Success, docs, stable |
| `--color-accent-blue` | `#3b82f6` | Info, tests, cool |
| `--color-text-primary` | `#e8e8f5` | Main text |
| `--color-text-secondary` | `#64748b` | Muted text |
| `--color-border` | `#2a2a55` | Card borders |

### Glass Aesthetic

```css
.glass-panel {
  background: rgba(26, 26, 50, 0.3);
  backdrop-filter: blur(8px);
  border: 1px solid var(--color-border);
  border-radius: 16px;
}

.glass-card-hover:hover {
  background: rgba(26, 26, 50, 0.5);
  border-color: var(--color-accent-cyan);
  transform: translateY(-4px);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}
```

### Animation Timing

| Duration | Use Case |
|----------|----------|
| 150ms | Button hovers, small transitions |
| 300ms | Card hovers, state changes |
| 400ms | Expansion animations (easing: `cubic-bezier(0.16, 1, 0.3, 1)`) |
| 5000ms | Auto-cycling between artifacts |

---

## Current Status

### Shadow-Agent (Existing)
- ✅ Electron + React architecture
- ✅ Event-driven state management
- ✅ SVG-based graph visualization
- ✅ LLM inference layer ready
- ✅ File I/O, persistence

### RepoVis (New)
- 📄 Design specifications complete
- 📄 Implementation plan ready (12 weeks)
- 📄 VS Code panel spec with guided tour pattern
- ❌ Code not yet written
- ❌ Needs migration from static HTML to React

### Shared Infrastructure
- ❌ Design tokens not yet extracted
- ❌ Shared components not created
- ❌ Workspace configuration not set up

---

## Next Steps

See `docs/design/repovis-implementation-plan.md` for detailed 12-week roadmap.

High-level phases:

1. **Week 1-2**: Monorepo setup, design system extraction
2. **Week 3-4**: RepoVis MVP (File Train in VS Code panel)
3. **Week 5-6**: LLM integration (Tier 1-2-3 analysis)
4. **Week 7-8**: Enhanced visualizations (Dependency Graph, Timeline)
5. **Week 9-10**: Cosmology view (WebGL/Three.js)
6. **Week 11-12**: Polish, testing, VS Code Marketplace

---

## Getting Started

```bash
# Clone and setup
gh repo clone Coldaine/AgentVisualCrazy agent-visual-suite
cd agent-visual-suite
git checkout repovis-integration

# Install dependencies
npm install

# Development
npm run dev:shadow-agent    # Start Electron app
npm run dev:repovis         # Start VS Code extension host

# Build
npm run build
```

---

## Design Philosophy

**Ambient First**: Information should find you. You don't hunt for it.

**Temporal Progressive Disclosure**: Artifacts rotate into view automatically. You glance, absorb, continue.

**Holographic Aesthetic**: Software processes as physical phenomena — stars, heat, weather, organisms.

---

*Unified visualization suite for the age of AI-augmented development.*
