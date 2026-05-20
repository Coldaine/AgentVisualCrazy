# Phase 2 Landing Status Report

**Date:** 2026-05-19  
**Branch:** `main` (local commits through `0d7c7c5`)  
**Audience:** Read without running the app — executive summary, evidence, gaps, and how to verify.

---

## Executive summary

Shadow-agent Phase 2 delivers the north-star loop: **watch** (capture), **interpret** (inference), **render** (Canvas2D holographic graph). Core product lines merged in April–May 2026 (#26–#28, #37, #44). This landing pass refreshed docs, closed superseded PRs #41/#42, added theme/GlassCard/citadel motion polish, and introduced canvas command-record tests.

| Pillar | Status | Evidence |
|--------|--------|----------|
| **Watch** | Done | File-tail + HTTP/WebSocket/socket transports (#27, #44) |
| **Interpret** | Done | OpenCode-first + Anthropic fallback, MCP (#28, #44) |
| **Render** | Substantially done | Canvas2D + D3-Force (#26); hex grid + pulse API; glass panels |

**Test suite:** 258 Vitest tests passing locally (`npm test` in `shadow-agent/`).  
**Build:** `npm run build` succeeds (web + renderer + Electron).  
**CI:** Last GitHub Actions run on remote `main` was green at `b4029f3` ([run 26129724915](https://github.com/Coldaine/AgentVisualCrazy/actions/runs/26129724915)); push these commits to refresh CI on `0d7c7c5`.

---

## What landed in this landing pass

| Commit | Summary |
|--------|---------|
| `a951396` | Docs: getting-started accuracy, todo refresh |
| `8da8f37` | Refactor: descriptive locals (replaces PR #42) |
| `0d7c7c5` | Renderer: theme helpers, animated `GlassCard`, Citadel CSS subset, `triggerCanvasPulse`, tests |

**Closed PRs:** [#41](https://github.com/Coldaine/AgentVisualCrazy/pull/41) (superseded by selective port), [#42](https://github.com/Coldaine/AgentVisualCrazy/pull/42) (merged as `8da8f37`).

---

## Visual design ledger

| Item | Before landing | After landing |
|------|----------------|---------------|
| Canvas2D + D3-Force | Done (#26) | Done |
| Color tokens | Partial (`theme/colors.ts`) | Extended + `withAlpha` / `getStateColor` in `theme/helpers.ts` |
| GlassCard mount animation | CVA only | `GlassCard` React wrapper + `TIMING.glassAnimMs` |
| Citadel CSS @keyframes | Missing | `card-breathe`, `cl-reveal`, tier timing vars in `styles.css` |
| Canvas event pulse API | Ambient sine only | `triggerCanvasPulse('burst' \| 'ripple')` in `canvas-pulse.ts` |
| Command-record canvas tests | Missing | `record-2d-context.ts` + `canvas-draw.test.ts` |
| Pixel screenshot regression | Missing | **Still deferred** |
| Manual glow/perf checklist | Missing | **Still deferred** |
| Bloom / split `draw-*.ts` modules | Missing | **Deferred** (Phase 3+ polish) |
| Full Citadel dot-grid physics | Missing | **Deferred** (canvas hex grid remains) |

---

## How to run and verify

```bash
cd shadow-agent
npm install
npm test          # 258 tests, headless
npm run build
npm start         # Electron desktop app (built bundle)
```

**Fixture replay:** Open the app → use bootstrap/fixture flow documented in `docs/getting-started.md`. Replay fixture: `shadow-agent/tests/fixtures/replays/happy-path.replay.jsonl`.

**Live capture:** Point file-tail transport at an active Claude/Cursor JSONL session (see `docs/domain-events.md`).

**Inference smoke:** Requires credentials (`~/.shadow-agent/credentials.enc.json` or env). CI uses fake clients only — no live model calls in automated tests.

---

## Visual evidence

| Method | Result |
|--------|--------|
| Automated pixel screenshots | Not implemented — no Playwright/Electron smoke in CI |
| Command-record tests | **8 new tests** across `theme-helpers`, `canvas-pulse`, `canvas-draw` |
| Manual Electron screenshots | **Not captured in this pass** — agent environment did not produce checked-in PNGs under `docs/reports/assets/phase2-landing/`. Run `npm run build && npm start` locally for human visual sign-off. |

Substitute evidence: green test suite + successful production build + command-record assertions on palette and pulse API.

---

## Risk register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Issue #24 closed before screenshot regression existed | Medium | Re-open or track in `docs/todo.md` manual acceptance item |
| No Playwright Electron smoke | Medium | Planned in `plan-testing-observability.md` — not blocking Phase 2 close |
| Visual fidelity judged only via unit tests | Low | Schedule manual acceptance pass |
| Remote CI not yet run on landing commits | Low | Push `main` and confirm workflow green |

---

## Recommended Phase 3 entry

1. VS Code webview / custom-element embedding (`build:web` already exists).
2. Wire `triggerCanvasPulse` to canonical `EventKind` values on tool/subagent events.
3. Playwright Electron smoke (launch + fixture load).
4. Curated 4–6 pixel snapshot scenes (fixed canvas size, frozen fixtures).
5. Deeper OpenCode bidirectional integration per `docs/architecture.md`.

---

## Key file map

| Area | Path |
|------|------|
| Canvas renderer | `shadow-agent/src/renderer/canvas/CanvasRenderer.tsx` |
| Pulse API | `shadow-agent/src/renderer/canvas/canvas-pulse.ts` |
| Theme | `shadow-agent/src/renderer/theme/colors.ts`, `helpers.ts`, `timing.ts` |
| GlassCard | `shadow-agent/src/renderer/components/GlassCard.tsx` |
| Capture | `shadow-agent/src/capture/` |
| Inference | `shadow-agent/src/inference/` |
| Test helper | `shadow-agent/tests/helpers/record-2d-context.ts` |
| Plans | `docs/plans/plan-gui-rendering.md`, `plan-testing-observability.md` |
