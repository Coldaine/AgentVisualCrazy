# Requirements: AgentVisualCrazy v1 — Copied Substrate + Curator

> **Status:** governing requirements for the v1 rebuild (spec-based development).
> **Date:** 2026-07-27 (rewritten after the nuke-and-restart decision).
> **Supersedes:** the dump→JSON→dashboard path, the "port exhibits back onto HEAD" framing, and all prior `plan-*.md` governing docs (recoverable from the `v0-classifier-snapshot` pin).

---

## 1. Intent

**We are deleting our current code and starting over from agent-flow's code as the copied substrate.**

The v0 line drifted because it *harvested agent-flow's patterns into a research doc, threw away the code, and rebuilt a thinner imitation.* The fix is not to patch the imitation — it is to copy agent-flow's actual renderer in as our own code, then layer a reasoning curator agent on top.

The curator is the **reasoning agent**, not a classifier. It investigates the session (look back, hypothesis → evidence), authors **exhibit artifacts**, and composes briefings on the fly. The renderer is a living visual surface inherited from agent-flow — not a fixed Phase/Risk/Next dashboard.

---

## 2. The Nuke

Before the rebuild:

1. **Pin v0.** Tag `v0-classifier-snapshot` on current HEAD; push `archive/v0-classifier` branch. The entire current codebase + all docs are permanently recoverable from the pin.
2. **Open `feat/v1-agentflow-rebuild`** off the pin.
3. **Nuke our code.** Delete `src/`, `tests/`, `package.json`, `tsconfig*`, build/electron config, the **entire `docs/` tree**, `AGENTS.md`, and all root-level files belonging to the old line. Keep `.git/` only.
4. **Copy agent-flow's `web/` over** as the new repo root. Bring `LICENSE` (Apache-2.0); add `NOTICE` attributing [patoles/agent-flow](https://github.com/patoles/agent-flow).
5. **Rewrite governing docs** from scratch on the rebuild branch (this file, `AGENTS.md`, `north-star.md`, `architecture.md`, `roadmap.md`).

**Nothing from the old tree survives onto the rebuild branch except `.git/`.** When old reference material is needed (research harvests, the exhibit prototype, old architecture notes), pull it from the pin via `git show v0-classifier-snapshot:<path>`.

---

## 3. Architecture (target)

```
agent-flow renderer (copied, Next.js static export)
        │  runs inside Electron renderer process (Chromium)
        ▼
CanonicalEventStream ──► live_graph (agent-flow's canvas, reframed as one exhibit)
         │
         ▼
MastraCuratorAgent ──lookback tools──► ObservationStore
         │
         ▼
 ExhibitArtifact[] ──► ExhibitStage ──► typed exhibit components
```

| Layer | Owner | Role |
|-------|-------|------|
| Renderer / `live_graph` | Copied agent-flow code | The living visual surface; hex nodes, particles, bloom, glass panels. One exhibit in rotation. |
| Electron shell | New, minimal | Hosts the renderer (Chromium), runs Mastra in the main process (Node), provides native file access + `safeStorage`. |
| Event ingestion | New adapter | Translates our ObservationStore events into agent-flow's event model. Transport-pluggable (JSONL tail default; HTTP/WS/socket/replay open). |
| Curator | Mastra agent | Investigate, look back, curate gallery. Multi-step, with tools over the observation substrate. |
| Exhibit Stage | Pre-built React | Beauty + safety; renders typed contracts. Components pulled from the pin when needed. |

---

## 4. Deviations from agent-flow upstream

agent-flow is copied as-is, then adapted. The intended deviations (sourced from `docs/research/visual-patterns-agent-flow.md` §6 and the v0 architecture):

### Shell / deployment
1. **VS Code extension → standalone Electron app.** agent-flow ships as a VS Code webview extension; we host its renderer inside Electron's Chromium, with the renderer kept host-agnostic so a web bundle stays possible.

### Event ingestion
2. **Hook server as sole input → transport-pluggable.** Keep JSONL tailing as default; add streaming HTTP, WebSocket, raw socket, and replay fixtures through one parser → normalizer → bounded-queue → IPC pipeline.
3. **Single Claude Code source → per-harness `HarnessDriver` abstraction.** Claude Code implemented first; other observed agents pluggable.

### The interpretation layer (agent-flow has none)
4. **Add a curator agent (Mastra)** that investigates the session — multi-step, with lookback tools over the ObservationStore.
5. **Curator authors typed exhibit artifacts** — the v1 vocabulary (§6). agent-flow's canvas becomes `live_graph`, one exhibit in rotation.
6. **Session memory across triggers** — refresh, retire, update gallery artifacts; later runs refer to prior conclusions.
7. **Hypothesis → evidence with cited event ids.**
8. **Read-only tool surface** — observation tools only; never Write/Edit/Bash against the watched repo.
9. **ChatGPT Pro OAuth via the Codex endpoint** (`chatgpt.com/backend-api/codex/responses`) only. No Platform API key path.
10. **MCP server** exposing `curator_status` / `curator_events` / `curator_ask` to other agents.

### Privacy / safety
11. **Local-only default.** Off-host inference and raw-transcript storage each require explicit opt-in. OAuth tokens stored under `~/.agentvisualcrazy/` via Electron `safeStorage`.

### Visual reframe
12. **agent-flow's canvas is one exhibit, not the product.** The curator composes briefings around it via the Exhibit Stage.

---

## 5. Requirements

### MUST

| ID | Requirement |
|----|-------------|
| M1 | **Copied substrate.** agent-flow's `web/` is copied as the repo root (not vendored, not pattern-harvested). Apache-2.0 `LICENSE` + `NOTICE` attribution preserved. |
| M2 | **Electron shell.** Renderer runs inside Electron's Chromium via Next.js static export (`output: 'export'`). Mastra runs in the main process (Node). IPC bridges renderer ↔ main. |
| M3 | **Investigate / look back.** Curator is a multi-step Mastra agent with tools over the observation substrate (events, tool failures, file attention, prior artifacts, focused transcript search). May dispatch sub-investigations. |
| M4 | **Curate exhibits.** Primary output is `ExhibitArtifact[]` for the typed vocabulary — not Phase/Risk/Next form fields. |
| M5 | **Session memory.** Refresh, retire, and update gallery artifacts across triggers; later runs may refer to prior conclusions. |
| M6 | **Hypothesis → evidence.** Narratives and payloads are grounded in queried history; evidence cites real event ids where applicable. |
| M7 | **Read-only tool surface.** Observation tools only. Never Write / Edit / Bash against the watched agent's repo. |
| M8 | **Exhibit Stage UI.** Render a curated gallery with Exhibit Floor design language (Frame, glass, idle cycling). `live_graph` (agent-flow's canvas) is one exhibit in rotation. |
| M9 | **Idea bank as palette.** The RepoVis concept bank (recoverable from the pin at `docs/ideas/repoviz/`) is the expansion source beyond v1. |
| M10 | **ChatGPT Pro OAuth only.** Model auth is ChatGPT Plus/Pro Codex OAuth (browser + device-code), hitting the Codex backend, adapted from Mastra Code / OpenCode patterns into `@mastra/core` Agent via AI SDK `LanguageModel`. **No `OPENAI_API_KEY` / Platform API fallback.** |
| M11 | **Mastra in Electron main.** `@mastra/core` Agent + tools + memory; no dependency on the Mastra Code TUI as a runtime. |
| M12 | **Triggers + single-flight.** Keep event/time/risk triggers; at most one curator investigation in flight. |
| M13 | **Privacy.** Local-only default; off-host and raw-transcript opt-in. OAuth tokens under `~/.agentvisualcrazy/` via Electron `safeStorage`. |

### SHOULD

| ID | Requirement |
|----|-------------|
| S1 | Raise `live_graph` to the full agent-flow bar (hex nodes, glow, particles, bloom) — inherited from the copy, keep it there. |
| S2 | Restore Citadel-class ambient layer (dot-grid + event-driven pulse/ripple). |
| S3 | Observability: log/trace curator tool calls and artifact publish events. |
| S4 | Evals: golden sessions scoring gallery quality (exhibit fit + narrative), not merely JSON parse success. |

### Non-goals

- The curator intervening on or correcting the observed agent.
- Model emitting arbitrary HTML / JSX / CSS.
- Fixed dashboard slots as the Interpret product.
- Requiring Mastra Code TUI as a runtime dependency.
- Replacing event-sourced graph topology with model-hallucinated graphs.
- Re-harvesting agent-flow's patterns into a doc and rebuilding from scratch. (This is the doctrine we are explicitly rejecting.)

---

## 6. Exhibit vocabulary (v1)

Typed contracts recovered from the pin (`docs/ideas/repoviz/` + sibling `feat/exhibit-*` branches in the v0 object database):

| `exhibitType` | Role |
|---------------|------|
| `relationship_dag` | Curated entity map (goals, turns, tools, files, incidents) |
| `activity_narrative` | Interesting beats on a folding timeline |
| `walkthrough` | Deep-dive on one turn/task |
| `concern_snapshot` | Work abstracted into concerns + flows |
| `momentum` | Gauge, stats, inferred next, curation actions |
| `seismograph` | Session as seismic trace |
| `thermal_map` | File/subsystem heat treemap |
| `live_graph` | agent-flow's canvas, reframed as one exhibit in rotation |

### Artifact envelope

```ts
interface ExhibitArtifact {
  id: string;
  exhibitType: ExhibitType;
  title: string;
  narrative: string;           // MANDATORY — meaning, not raw dump
  relevance: number;           // 0..1
  decayClass: 'fast' | 'medium' | 'slow';
  createdAtEvent: number;
  refreshedAtEvent?: number;
  status: 'fresh' | 'active' | 'stale' | 'retired';
  payload: /* discriminated by exhibitType */;
}
```

---

## 7. Auth — ChatGPT Pro via OAuth

| Path | Behavior |
|------|----------|
| Only | Codex OAuth (ChatGPT Plus/Pro): browser callback and device-code. Custom fetch rewrites Responses/chat calls to the Codex endpoint; tokens refresh automatically. |
| Forbidden | `OPENAI_API_KEY` / Platform API billing / stock `openai/*` API-key router as a product auth path. |

Without OAuth credentials the curator must refuse live inference (offline mock/fixture for UI/dev only — not an API-key substitute).

Feasibility: `@mastra/core` Agent accepts AI SDK language models. Mastra Code's `openaiCodexProvider()` pattern (`wrapLanguageModel` + OAuth fetch) is the adaptation target — not "use Mastra Code as a subprocess."

---

## 8. Acceptance criteria

1. Two different session moments produce **structurally different** gallery compositions (different exhibit types / order), not the same four dashboard sections with new strings.
2. Curator **tool-calls lookbacks** before publishing artifacts (visible in logs/trace).
3. ChatGPT Pro OAuth login works end-to-end; active path uses the Codex endpoint only. No API-key auth path exists in code or docs.
4. At least the v1 seven exhibits + `live_graph` render from typed contracts with **mandatory narrative**.
5. No filesystem-mutation tools are registered on the curator.
6. agent-flow's renderer runs inside Electron via Next.js static export; the canvas is live and fed by real events.
7. Apache-2.0 `LICENSE` + `NOTICE` attribution to [patoles/agent-flow](https://github.com/patoles/agent-flow) are present in the repo root.

---

## 9. Spec-based development notes

- Implement against MUST IDs; mark PRs with the IDs they satisfy.
- Do not expand scope into Watch/Render redesigns beyond exhibit stage + the deviations listed in §4.
- Old reference material (research harvests, exhibit prototype, prior architecture notes) is recoverable from the pin — do not re-derive from memory; pull from `git show v0-classifier-snapshot:<path>`.
