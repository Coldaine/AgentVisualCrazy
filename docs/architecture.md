# Architecture — AgentVisualCrazy v1

Technical map for the v1 rebuild. Product intent lives in [`north-star.md`](north-star.md);
requirements in [`plans/req-v1-curator.md`](plans/req-v1-curator.md); substrate inventory in
[`plans/visual-gui-donors.md`](plans/visual-gui-donors.md); the forward plan in
[`plans/forward.md`](plans/forward.md).

## Doctrine

- **Copied substrate:** [patoles/agent-flow](https://github.com/patoles/agent-flow) (1.4k stars) `web/` is copied into this repo as our renderer code. We own and edit it. We do **not** vendor it under `third_party/`. We do **not** harvest patterns into a research doc and rebuild a thinner imitation (the v0 sin).
- **Curator layer:** Mastra curator agent + ChatGPT Pro OAuth (Codex endpoint) sit on top of the substrate.
- **Shell:** Electron hosts the Vite renderer; Mastra runs in the **main process**.
- **Naming:** curator / AgentVisualCrazy / `~/.agentvisualcrazy/`. No "shadow" language.
- **Layout:** `web/` (copied substrate, built with Vite), `electron/` (shell + main-process hosts), `host/` (curator / ingestion / mcp — each its own `package.json` so vitest deps stay isolated). At build time `electron/tsconfig.json` compiles `host/ingestion`, `host/curator`, and six `extension/src/*.ts` files as one program, so the workspace split is a test-time convenience, not a build boundary.

## Target system map

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
│  — living graph, panels   │   │   Codex endpoint)        │
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

## As built (2026-07-27)

All five milestones have been touched in the same feature branch
(`feat/v1-mcp-live-exhibits`). The scaffold is in; the loop runs end-to-end in **mock**.
What stands between scaffold and a real v1 is integration work, not new architecture.

| Piece | Status | Where |
|-------|-------|-------|
| **Copied agent-flow renderer** | Done — full canvas + panels + hooks inherited from the copy | `web/components/agent-visualizer/`, `web/hooks/`, `web/lib/` |
| **Electron shell** | Done — main + preload + IPC, loads renderer via Vite dev or `dist-web` | `electron/main.ts`, `electron/preload.ts`, `electron/ipc-channels.ts` |
| **ObservationStore + HarnessDriver** | Done — Claude Code transcript auto-discovery under `~/.claude/projects`, fixture fallback, batch + live forwarding | `host/ingestion/`, `electron/ingestion-host.ts` |
| **Mastra curator agent** | Scaffolded + runs in mock — agent, lookback tools, gallery memory, single-flight runner, prompt + artifact parser | `host/curator/src/agent.ts`, `tools.ts`, `gallery-memory.ts`, `runner.ts`, `parse-artifacts.ts` |
| **ChatGPT Pro Codex OAuth** | Code-complete, **UX not wired** — device-code + browser PKCE + token store + Codex fetch rewrite all implemented; no menu/settings surface to trigger login | `host/curator/src/auth/`, `electron/curator-host.ts` |
| **Exhibit Stage** | Wired but **fragmented** — all 7 typed exhibits + stage + primitives + types + fixture gallery present; live artifacts swap in via `useLiveExhibitArtifacts`; `live_graph` is a **placeholder** in the stage, not the composed canvas | `web/components/exhibits/`, `web/lib/live-exhibits.ts` |
| **MCP server** | Done — stdio `curator_status` / `curator_events` / `curator_ask`, auto-loads curator facade | `host/mcp/` |

### What "runs" today

- Launch Electron → renderer loads → ingestion auto-discovers the latest Claude transcript (or replays the fixture) → events flow into the canvas.
- `CuratorHost` fires on a 45s timer and on event-count threshold; in mock mode it publishes deterministic `ExhibitArtifact[]` over IPC.
- `LiveExhibitStrip` renders the top-6 artifact titles over the canvas; `?mode=exhibits` swaps to `ExhibitGalleryApp` which mounts the full stage with the fixture gallery until live artifacts arrive.
- `npm run mcp` exposes the read-only `curator_*` tools to other agents.

### Gaps to close for v1

These are the integration tasks that turn scaffold into product. Detail and sequencing
live in [`plans/forward.md`](plans/forward.md).

1. **OAuth login UX.** The auth code is complete but unreachable from the app. Without it the curator is permanently in mock mode and the "reasoning curator" promise is unverified.
2. **`live_graph` composition.** The agent-flow canvas and the exhibit gallery are two separate app modes today; the north star requires the canvas to be *one exhibit in rotation* inside the stage.
3. **End-to-end curator loop on real inference.** Once OAuth lands, verify the lookback → hypothesis → evidence → typed artifact flow against a real session, not just the mock text.
4. **Idea bank transfer.** Only `exhibit-prototype.jsx` made it over from the pin. The ~40 concept `.md` files in `docs/ideas/repoviz/` and `docs/plans/plan-exhibit-floor.md` are still pin-only — the M9 "expansion source" is unreachable from the rebuild branch.
5. **Domain docs.** The old `docs/domain-{gui,inference,events}.md` set was deleted with the v0 tree and not yet rewritten for the rebuild. The substrate, curator, and ingestion domains deserve their own reference docs.
6. **Live evals (S4).** `npm run test:live` is a stub. Golden-session evals scoring gallery quality are required before v1 ships.
7. **PR cut.** `feat/v1-mcp-live-exhibits` is 10 commits ahead of `origin/feat/v1-mcp-live-exhibits` and `main` is branch-protected. The branch needs to become one or more PRs.

## Attribution (Apache-2.0)

- Preserve agent-flow's `LICENSE` (Apache-2.0) at the repo root.
- Add a `NOTICE` file stating derivation from [patoles/agent-flow](https://github.com/patoles/agent-flow).
- Keep existing copyright notices in copied source files.

## Runtime layout

- App code: `web/` (substrate), `electron/` (shell), `host/` (curator / ingestion / mcp).
- User data / config / OAuth tokens: `~/.agentvisualcrazy/`.
- Read-only toward the observed agent: watch and interpret only (except user-initiated replay export).

## Explicit non-goals (architecture)

- Pattern-harvest → rewrite of the agent-flow renderer
- Vendoring agent-flow under `third_party/` without treating it as owned source
- Fixed Phase / Risk / Next dashboard as the primary UI
- "Shadow model" / "shadow prompt" naming or packaging
- An `OPENAI_API_KEY` / Platform API auth path of any kind
