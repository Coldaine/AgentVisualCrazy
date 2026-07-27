# Architecture — AgentVisualCrazy v1

Technical map for the v1 rebuild. Product intent lives in [`north-star.md`](north-star.md);
requirements in [`plans/req-v1-curator.md`](plans/req-v1-curator.md); substrate inventory in
[`plans/visual-gui-donors.md`](plans/visual-gui-donors.md).

## Doctrine

- **Copied substrate:** [patoles/agent-flow](https://github.com/patoles/agent-flow) (1.4k stars) `web/` is copied into this repo as our renderer code. We own and edit it. We do **not** vendor it under `third_party/`. We do **not** harvest patterns into a research doc and rebuild a thinner imitation — that path is rejected.
- **Curator layer:** Mastra curator agent + ChatGPT Pro OAuth (Codex endpoint) sit on top of the substrate.
- **Shell:** Electron hosts the Next/Vite renderer; Mastra runs in the **main process**.
- **Naming:** curator / AgentVisualCrazy / `~/.agentvisualcrazy/`. No "shadow" language.

## System map

```
Observed agent transcript / harness events
        │
        ▼
┌───────────────────────────┐
│  HarnessDriver /          │
│  ingestion adapter        │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│  ObservationStore         │  (main process)
└───────────┬───────────────┘
            │
            ├──────────────────────────────┐
            ▼                              ▼
┌───────────────────────────┐   ┌───────────────────────────┐
│  Copied agent-flow        │   │  Mastra curator agent     │
│  renderer (Next/Vite)     │   │  (ChatGPT Pro OAuth /     │
│  — living graph, panels   │   │   Codex endpoint)         │
└───────────┬───────────────┘   └───────────┬───────────────┘
            │                              │
            │                              ▼
            │                   ┌───────────────────────────┐
            │                   │  Exhibit artifacts /      │
            │                   │  briefings                │
            │                   └───────────┬───────────────┘
            │                              │
            └──────────────┬───────────────┘
                           ▼
                ┌───────────────────────────┐
                │  Exhibit Stage            │
                │  (live_graph = one exhibit)│
                └───────────────────────────┘
                           ▲
                           │
                ┌───────────────────────────┐
                │  Electron shell           │
                │  (hosts renderer; Mastra  │
                │   in main)                │
                └───────────────────────────┘
```

## Major pieces

| Piece | Role |
|-------|------|
| **Copied agent-flow renderer** | Canvas2D + D3-Force living visual, holographic panels, event-driven graph. This *is* our renderer source — not a reference sketch. |
| **Electron shell** | Desktop host; loads the Next/Vite renderer; owns main-process services. |
| **ObservationStore + ingestion adapter** | Normalize harness/transcript events into the store the renderer and curator consume. `HarnessDriver` is the pluggable transport boundary. |
| **Mastra curator** | Reasoning agent in main: investigate session, author exhibit artifacts, compose briefings. Not a classifier. |
| **Exhibit Stage** | Surface that presents curated exhibits; the living agent-flow graph is one exhibit (`live_graph`) among others the curator can stage. |

## Attribution (Apache-2.0)

- Preserve agent-flow's `LICENSE` (Apache-2.0) at the repo root.
- Add a `NOTICE` file stating derivation from [patoles/agent-flow](https://github.com/patoles/agent-flow).
- Keep existing copyright notices in copied source files.

## Runtime layout

- App code: flat repo root (copied substrate + Electron/main additions).
- User data / config / OAuth tokens: `~/.agentvisualcrazy/`.
- Read-only toward the observed agent: watch and interpret only (except user-initiated replay export).

## Explicit non-goals (architecture)

- Pattern-harvest → rewrite of the agent-flow renderer
- Vendoring agent-flow under `third_party/` without treating it as owned source
- Fixed Phase / Risk / Next dashboard as the primary UI
- "Shadow model" / "shadow prompt" naming or packaging
