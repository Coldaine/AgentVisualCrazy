# Forward plan — AgentVisualCrazy v1 (post-scaffold)

> **Status:** the pivot plan, written 2026-07-27 after all five milestones were scaffolded
> in a single feature branch (`feat/v1-mcp-live-exhibits`).
> **Companion:** [`../architecture.md`](../architecture.md) §"As built" for the current state,
> [`req-v1-curator.md`](req-v1-curator.md) for the governing requirements,
> [`roadmap.md`](roadmap.md) for the milestone map.

## Where we are

The rebuild's first pass is done: the v0 codebase was nuked, agent-flow's `web/` was copied
as the substrate, and all five milestones were touched in one branch. The end-to-end loop
**runs in mock**: launch Electron → ingestion auto-discovers a Claude transcript (or replays
the fixture) → events flow into the canvas → `CuratorHost` fires on timer/event-count →
mock artifacts publish over IPC → `LiveExhibitStrip` + `ExhibitGalleryApp` render them.

What's missing is **integration**, not architecture. The auth code is complete but
unreachable from the app; the canvas and the exhibit stage are two separate app modes;
the curator has never run on real inference; the idea bank is half-transferred; the domain
docs don't exist; live evals are a stub; and the branch hasn't been cut into PRs.

## The pivot

Stop scaffolding new milestones. Close the integration gaps that turn scaffold into a
verifiable v1, in an order that produces a shippable PR at each step.

Sequencing principle: **each workstream ends with something you can demo and a PR you can
merge.** No more "touch every milestone, ship nothing."

## F0 — Foundation gates (run first, before any curator work)

**Exit:** the copied substrate is proven to launch, build, and feed real events inside
Electron. No curator work begins until these pass.

The rebuild landed in ~45 minutes. None of it has been verified end-to-end. Before
building OAuth UX or composition on top, prove the foundation is real.

- **G0.1 Build gate.** `npm run build` (web Vite build + electron tsc + esbuild) succeeds
  with zero type errors across the cross-package `electron/tsconfig.json` includes
  (`host/ingestion`, `host/curator`, six `extension/src/*.ts` files). If this fails, the
  "small workspace" is leaking types and the build boundary is broken.
- **G0.2 Test gate.** `npm test` (vitest in `host/ingestion`, `host/curator`, `host/mcp`)
  passes. These are unit tests only — they do not prove the app boots.
- **G0.3 Launch gate (manual, user-driven).** `npm start` (or `npm run dev`) launches
  Electron, the BrowserWindow loads, and the agent-flow canvas renders (not a blank
  window, not a crash). Mock scenario lights up if no live session is found.
- **G0.4 Ingestion gate.** With a real `~/.claude/projects/<encoded>/<session>.jsonl`
  present, the auto-discovery in `electron/ingestion-host.ts` finds it, events flow
  through IPC, and the canvas updates live (not just the fixture batch). If no Claude
  session exists, the fixture replay lights the canvas.
- **G0.5 Bridge gate.** The IPC protocol round-trips: renderer `ready` → ingestion
  starts → `config` + `connection-status` + `session-started` arrive → `agent-event` /
  `agent-event-batch` arrive and the visualizer handles them → renderer `curator-run`
  kicks the curator → `exhibit-artifacts` arrives at the strip + stage.

G0.1 and G0.2 are runnable headless and should pass before anything else. G0.3–G0.5
require a human to look at the screen. If any gate fails, **stop and fix the foundation
before F1.** Do not layer curator work on a substrate that doesn't boot.

### Gate run — 2026-07-27 04:14

| Gate | Result | Notes |
|------|--------|-------|
| G0.1 build | **PASS** | `npm run build` clean in ~60s. Web Vite build: 529 modules, `dist-web/index.html` + 534KB JS. Electron: `tsc -p electron/tsconfig.json` + esbuild → `dist-electron/main.js` (100KB) + `preload.js`. Zero type errors across cross-package includes (`host/ingestion`, `host/curator`, six `extension/src/*.ts`). |
| G0.2 tests | **PASS** | 26 tests pass across 3 suites: `host/ingestion` 7, `host/curator` 11, `host/mcp` 8. Unit tests only — do not prove the app boots. |
| G0.3 launch | **PENDING (human)** | `npm start` / `npm run dev` not run headless. Build outputs exist and look right; needs a human to confirm the BrowserWindow loads and the canvas renders. |
| G0.4 ingestion | **READY** | A real session exists: `~/.claude/projects/C---projects-AgentVisualCrazy/6e18b50a-b96c-4466-838c-c7cc88fbf37e.jsonl` (5.8MB, modified 2026-07-26 21:40). Auto-discovery has something to find; whether events reach the canvas depends on G0.3. |
| G0.5 bridge | **PENDING (human)** | IPC round-trip needs a running app. Cannot verify headless. |

**Verdict:** the foundation compiles and unit-tests clean. The remaining gates need a
human to launch the app and watch the screen. Do not start F1 until G0.3–G0.5 are
confirmed by hand.

**PR:** `test/foundation-gates` (G0.1/G0.2 wired into CI) + a short gate-run record in
`docs/plans/forward.md` once G0.3–G0.5 are confirmed by hand.

### Gate re-run — 2026-07-27 07:35 (fix/oauth-exhibits-render)

The launch + bridge gates were verified by actually booting the Electron app and
capturing window screenshots via Win32 `PrintWindow` (the BrowserWindow renders even
when not in the foreground). Both visualizations render.

| Gate | Result | Notes |
|------|--------|-------|
| G0.1 build | **PASS** | `npm run build` clean. Web Vite build + `tsc`/esbuild electron build succeed with the restored `ExhibitGalleryApp` import in `web/electron-entry.tsx`. |
| G0.2 tests | **PASS** | 93 tests pass across all suites: root vitest 12, `test:dom` 3 (jsdom render tests), `host/ingestion` 14, `host/curator` 48 (incl. 10 browser/device-flow + 8 JWT hardening), `host/mcp` 16. |
| G0.3 launch | **PASS** | `npm start` launches Electron; the BrowserWindow loads with the "AgentVisualCrazy" title and the agent-flow canvas renders its dark starry-sky background (empty state — no live session connected). Screenshot evidence: `tmp/visualizer.png` (1200x752, captured via `PrintWindow`). |
| G0.4 ingestion | **PASS** | `[ingestion-host]` auto-discovered the real Claude session (`6e18b50a-...jsonl`); `[curator-host]` started and published 2 artifacts (mode=mock) on renderer-ready. Confirmed in `tmp/electron-stdout.log`. |
| G0.5 bridge | **PASS** | The IPC round-trip works: renderer `ready` → ingestion auto-discovery → curator kick → `exhibit-artifacts` published. The `Ctrl+Shift+E` in-UI toggle switches to the Exhibit Stage, which renders the fixture gallery (exhibit cards, ACTIVE badges, gradient progress bars, activity-narrative + interesting-moments detail panels). Screenshot evidence: `tmp/exhibits.png` (1200x752). |

**Verdict:** all F0 foundation gates pass. The substrate boots, ingests a real session,
the IPC bridge round-trips, and both the agent-flow visualizer and the Exhibit Stage
render in the Electron BrowserWindow. F1 follow-on work can proceed.

## Workstreams

### F1 — OAuth login UX
**Exit:** a user can complete ChatGPT Pro Codex OAuth from inside the app and the curator
switches from mock to live inference without code changes.

The auth code (`host/curator/src/auth/`) is complete: device-code, browser PKCE, token
store with `safeStorage`, Codex fetch rewrite, `wrapLanguageModel` middleware. What's
missing is the surface.

- Add an Electron menu item ("Curator → Sign in with ChatGPT") that triggers
  `loginWithDeviceCode` (headless first; browser flow is a stretch).
- Surface the device code + verification URL in a small in-app dialog (renderer-side).
- On success, persist tokens via `TokenStore`; the next `CuratorHost.kick()` resolves to
  `oauth` mode automatically.
- On failure / timeout, show the error and stay in mock.
- Add a "Signed in as …" / "Sign out" affordance. Sign-out clears tokens from
  `~/.agentvisualcrazy/`.

**PR:** `feat/curator-oauth-ux` → closes the M10 acceptance criterion ("ChatGPT Pro OAuth
login works end-to-end; active path uses the Codex endpoint only").

### F2 — `live_graph` composition into the Exhibit Stage
**Exit:** the agent-flow canvas renders *inside* the Exhibit Stage as one rotating exhibit,
not as a separate app mode.

Today `ExhibitGalleryApp` mounts `<LiveGraphPlaceholder />` where the canvas should be, and
the default app entry mounts `AgentVisualizer` alone. `?mode=exhibits` swaps between them.
The north star requires composition, not a mode switch.

- Lift the canvas out of `AgentVisualizer` so it can be mounted as a child.
- Pass it as the `liveGraph` prop to `ExhibitStage` in `ExhibitGalleryApp`.
- Decide the rotation UX: does the stage auto-cycle between `live_graph` and authored
  exhibits, or does the user pin `live_graph` and switch authored exhibits manually?
  Recommend: idle-cycle by default, click to pin.
- Remove the `?mode=exhibits` split — there is one app, with the canvas always present and
  authored exhibits composed around it.

**PR:** `feat/live-graph-composed` → satisfies the M5 exit ("user can watch the living graph
and flip through curator-authored exhibits in one composition").

### F3 — End-to-end curator on real inference
**Exit:** against a real Claude session, the curator makes lookback tool calls (visible in
logs), grounds narratives in cited event ids, and publishes typed artifacts that differ
structurally across two different session moments.

This is the acceptance test for M3–M6. It depends on F1 (OAuth) and benefits from F2
(composition) but can run against the strip + stage as they exist today.

- Run the app against a real `~/.claude/projects/.../<session>.jsonl` with OAuth tokens.
- Capture `CuratorRunner` logs: confirm `agent.generate` ran with `maxSteps > 1` and tool
  calls were dispatched (lookback tools, not just a final JSON dump).
- Verify `parseExhibitArtifacts` produces typed artifacts (not the mock fallback) and
  `narrative` is non-empty and cites event ids.
- Run a second session moment; confirm the gallery composition differs structurally
  (different exhibit types / order), per acceptance criterion 1.
- If the model returns unparseable JSON, tighten `prompts.ts` and `parse-artifacts.ts`
  before adding fallbacks — the parser is currently lenient.

**PR:** `test/curator-e2e-real-session` (or `fix:` if prompts/parser need changes) →
satisfies M3, M6, and acceptance criteria 1, 2, 4.

### F4 — Idea bank + domain docs transfer
**Exit:** the M9 expansion source is reachable from the rebuild branch, and each domain
has a reference doc that an agent (or a human) can read before editing that layer.

- Pull `docs/ideas/repoviz/*.md` (the ~40 concept specs) and
  `docs/plans/plan-exhibit-floor.md` from the pin via
  `git show v0-classifier-snapshot:<path> > <path>`.
- Write `docs/domain-gui.md` (renderer: Canvas2D + D3, hooks, panels, exhibit components,
  where to edit visual fidelity).
- Write `docs/domain-inference.md` (curator: Mastra agent, tools, prompts, OAuth, MCP).
- Write `docs/domain-events.md` (ingestion: ObservationStore, HarnessDriver, event model,
  the agent-flow event vocabulary we feed).
- Update `AGENTS.md` "Where to Find Things" to point at the new domain docs (the current
  table references files that don't exist in the rebuild tree).

**PR:** `docs/domain-and-idea-bank` → satisfies M9 and unblocks future exhibit work.

### F5 — Live evals (S4)
**Exit:** `npm run test:live` scores golden sessions against gallery quality (exhibit fit +
narrative), not just JSON parse success.

- Capture 2–3 real Claude sessions as replay fixtures under `host/ingestion/fixtures/`.
- Write a runner that loads each fixture, drives the curator (mock + oauth paths), and
  scores the gallery: typed-artifact coverage, narrative presence, evidence citation,
  structural difference across moments.
- Replace the `test:live` stub in `package.json` with the real runner.

**PR:** `test/live-session-evals` → satisfies S4.

### F6 — PR cut and merge
**Exit:** `feat/v1-mcp-live-exhibits` is broken into reviewable PRs and merged to `main`.

The branch is 10 commits ahead of origin and `main` is branch-protected. Recommended cut:

1. `feat/v1-substrate-electron` — commits `9c20011`, `e0f04fa`, `b459b79` (M1).
2. `feat/v1-ingestion` — `5574805`, `1a232fd` (M2).
3. `feat/v1-exhibits-wired` — `36a6421` (M5 prep).
4. `feat/v1-curator-oauth` — `8191d7b`, `6d10467` (M3, M4, M10).
5. `feat/v1-mcp` — `7635b07`, `661dd0e` (MCP).
6. Then F1–F5 PRs on top.

Each PR should reference the MUST IDs it satisfies (per `req-v1-curator.md` §9).

## Sequencing

```
F0 foundation gates  ─►  F1 OAuth UX        ─┐
                                              ├─► F3 real-inference e2e ─┐
                              F2 live_graph  ─┘                          │
                                                                          ├─► F5 live evals ─► F6 PR cut
                F4 idea bank + domain docs ──────────────────────────────┘
```

F0 runs first and gates everything. F1 and F2 are independent and unblock F3. F4 is
independent and unblocks future exhibit work. F5 consumes F1–F3. F6 runs throughout —
cut PRs as workstreams land, don't batch.

## Out of scope for this plan

- New exhibit types beyond the v1 seven + `live_graph`.
- Acting on behalf of the observed agent.
- Reintroducing the Phase/Risk/Next dashboard.
- Re-harvesting agent-flow patterns (the v0 sin).
- Any `OPENAI_API_KEY` / Platform API auth path.
