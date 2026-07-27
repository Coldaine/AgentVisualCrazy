# Visual Substrate & Reference Inventory (v1 rebuild)

> **Status:** rewritten 2026-07-27 after the nuke-and-restart decision.
> **Companion:** [`req-v1-curator.md`](req-v1-curator.md).
> **Key change from prior version:** agent-flow is no longer a "donor" whose patterns we harvest. It is the **copied substrate** — its code becomes our code. Everything else is reference material, recoverable from the `v0-classifier-snapshot` pin.

---

## 1. The substrate: agent-flow (copied, not harvested)

**agent-flow** — [patoles/agent-flow](https://github.com/patoles/agent-flow) (1.4k stars), Apache-2.0.

We copy its `web/` tree as the new repo root. We do **not** vendor it under `third_party/`, and we do **not** harvest its patterns into a research doc and rebuild from scratch (that was the v0 sin). The agent-flow source *is* our source now; we own it and edit it freely.

### What we inherit from the copy
- **Canvas2D + D3-Force** renderer (hexagon agent nodes, tapered bezier edges, particle comet trails, tool-call cards, discoveries, bloom post-processing).
- **Holographic / cyberpunk** design language (the cyan/amber/green/crimson state vocabulary, glass cards, heavy alpha transparency).
- **Panel layout** (full-screen canvas + floating panels: message feed, agent detail, chat, control bar, timeline, file attention, transcript).
- **Event model** (`agent_spawn`, `agent_complete`, `tool_call_start`, `subagent_dispatch`, etc.) — we adapt our ObservationStore to feed this.
- **Next.js** as the renderer bundler, run as a static export inside Electron.

### Attribution
- `LICENSE` (Apache-2.0) preserved in the repo root.
- `NOTICE` file stating derivation from [patoles/agent-flow](https://github.com/patoles/agent-flow).
- Existing copyright notices in copied source files preserved.

### What we change from upstream
See `req-v1-curator.md` §4 for the full deviation list. Summary: VS Code extension → Electron; hook-only input → transport-pluggable; add the entire curator/exhibit/MCP/OAuth layer that agent-flow doesn't have.

---

## 2. Reference material (recoverable from the pin)

The v0 pin (`v0-classifier-snapshot` / `archive/v0-classifier` branch) preserves everything we're deleting. When the rebuild needs a reference, pull it from the pin — do not re-derive from memory.

### Exhibit prototype + concept bank
| Path in pin | What it is |
|-------------|------------|
| `docs/ideas/repoviz/exhibit-prototype.jsx` | ~800–1100 line Framer Motion prototype with 5 exhibit views (DAG, narrative timeline, walkthrough, concern map, momentum). The clearest "beautiful UI we threw out of the product" artifact. Port views into typed exhibit components when needed. |
| `docs/ideas/repoviz/*.md` | ~40 exhibit-grade visualization concepts (gravity wells, thermal cameras, seismographs, constellation maps) + specs + build prompts. The expansion source beyond v1. |

### Exhibit components (on sibling branches in the v0 object database)
| Path in pin | What it is |
|-------------|------------|
| `src/renderer/exhibits/RelationshipDag.tsx` | Typed exhibit |
| `src/renderer/exhibits/ActivityNarrative.tsx` | Typed exhibit |
| `src/renderer/exhibits/Walkthrough.tsx` | Typed exhibit |
| `src/renderer/exhibits/ConcernSnapshot.tsx` | Typed exhibit |
| `src/renderer/exhibits/Momentum.tsx` | Typed exhibit |
| `src/renderer/exhibits/Seismograph.tsx` | Typed exhibit |
| `src/renderer/exhibits/ThermalMap.tsx` | Typed exhibit |
| `src/renderer/exhibits/ExhibitStage.tsx` | Gallery stage / rotation |
| `src/renderer/exhibits/primitives.tsx` | Shared Frame / glass / motion primitives |
| `src/renderer/exhibits/types.ts` | Exhibit contracts |
| `docs/plans/plan-exhibit-floor.md` | Design that wires curator → exhibits |

These exist on sibling branches (`feat/exhibit-floor`, `feat/exhibit-components`, `feat/exhibit-gallery-run`) reachable from the pin. Pull them when implementing the Exhibit Stage.

### Pattern harvests (research docs in the pin)
| Path in pin | What it is |
|-------------|------------|
| `docs/research/visual-patterns-agent-flow.md` | Pattern harvest from agent-flow. Useful for *enhancing* the copied code. |
| `docs/research/visual-patterns-sidecar.md` | Pattern harvest from sidecar (inference/auth/MCP reference). |
| `docs/research/visual-patterns-citadel.md` | Pattern harvest from Citadel (ambient layer reference). |
| `docs/research/visual-inspiration-catalog.md` | Visual inspiration catalog. |
| `docs/research/visual-design-strategy.md` | Design strategy. |

### Old architecture (archaeology, not target)
| Path in pin | What it is |
|-------------|------------|
| `docs/research/shadow-inference-architecture.md` | The v0 classifier inference architecture. Reference for what we're *not* doing. |
| `docs/research/harness-ingestion-matrix.md` | Harness ingestion research. Reference for the `HarnessDriver` abstraction. |
| `docs/architecture.md` | The v0 architecture doc (encodes the "patterns absorbed" doctrine). Reference for understanding the drift. |

---

## 3. What we are NOT doing

- **Not harvesting patterns and rebuilding.** That was the v0 sin. We copy the code.
- **Not vendoring agent-flow under `third_party/`.** We copy it as our root.
- **Not keeping any v0 docs on the rebuild branch.** The pin is the archive. Pull from it when needed.
- **Not treating the exhibit prototype as shelf art.** It's a porting source for typed exhibit components, pulled from the pin when we implement the Exhibit Stage.

---

## 4. Re-activation sequence

1. **Copy agent-flow** as the repo root (M1). Get its canvas rendering inside Electron via Next.js static export (M2).
2. **Adapt event ingestion** — write the ObservationStore → agent-flow event model adapter (M3 prep).
3. **Stand up the Mastra curator** in the Electron main process (M3, M11).
4. **Implement ChatGPT Pro OAuth** via the Codex endpoint (M10).
5. **Pull exhibit components from the pin** and wire the Exhibit Stage (M4, M8). `live_graph` (agent-flow's canvas) is one exhibit in rotation.
6. **Pull the exhibit prototype** from the pin as look/feel reference for the typed exhibits.
