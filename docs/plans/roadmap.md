# Roadmap — AgentVisualCrazy v1

Canonical forward plan for the v1 rebuild. Vision: [`../north-star.md`](../north-star.md).
Architecture: [`../architecture.md`](../architecture.md).

## Governing companions

These specs govern implementation detail and must stay in sync with this roadmap:

- [`req-v1-curator.md`](req-v1-curator.md) — copied substrate + Mastra curator requirements
- [`visual-gui-donors.md`](visual-gui-donors.md) — substrate & reference inventory (agent-flow is copied code, not a pattern harvest)

## Doctrine reminder

- agent-flow is **copied** as the renderer substrate (not vendored under `third_party/`, not pattern-harvested and rebuilt).
- Mastra curator + ChatGPT Pro OAuth (Codex) layer on top; Electron hosts Next/Vite; Mastra in main.
- Reject "absorb patterns and rebuild." Prefer curator / AgentVisualCrazy / `~/.agentvisualcrazy/` naming.

## Milestones

### M1 — Copy agent-flow + Electron shell

- Copy agent-flow `web/` as the new repo substrate; preserve Apache-2.0 `LICENSE` and add `NOTICE`.
- Wrap with an Electron shell that hosts the Next/Vite renderer.
- Establish root `npm run build` / `npm test` and the governing docs on the rebuild branch.
- **Exit:** app launches; living graph substrate runs inside Electron.

### M2 — Ingestion adapter / HarnessDriver

- ObservationStore + pluggable `HarnessDriver` / ingestion adapter.
- Feed normalized events into the copied agent-flow event model.
- **Exit:** a live (or replayed) harness stream drives the graph without curator yet.

### M3 — Mastra curator

- Mastra curator agent in the Electron main process.
- Curator investigates the session (look back, hypothesis → evidence) and authors exhibit artifacts / briefings — reasoning agent, not classifier.
- **Exit:** curator can produce structured exhibit artifacts from ObservationStore state.

### M4 — ChatGPT Pro OAuth

- ChatGPT Pro OAuth against the Codex endpoint for curator inference.
- Tokens and local config under `~/.agentvisualcrazy/`.
- **Exit:** curator runs authenticated end-to-end via ChatGPT Pro Codex OAuth only (no `OPENAI_API_KEY` / Platform API path).

### M5 — Exhibit Stage

- Exhibit Stage surface; `live_graph` is one exhibit among curator-staged exhibits.
- Compose living graph + curated exhibits (not Phase/Risk/Next dashboard slots).
- **Exit:** user can watch the living graph and flip through curator-authored exhibits in one composition.

## Sequencing

```
M1 substrate + shell
 → M2 ingestion
   → M3 curator
     → M4 OAuth
       → M5 Exhibit Stage
```

M3 may use a temporary inference path until M4 lands; M5 consumes curator artifacts from M3+.

## Out of scope for this roadmap

- Acting on behalf of the observed agent
- Reintroducing the v0 classifier / Phase–Risk–Next dashboard as the product core
- Pattern-harvest rebuild of the renderer
