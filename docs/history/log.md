# History

> Append-only log of completed work. Each PR adds an entry. The PR itself is the detailed record.

## 2026-03-26 — PR#3: Initial shadow-agent prototype

- Phase 1 (Schema + Replay MVP) completed
- Canonical event schema (14 event types) defined
- Transcript adapter for Claude Code JSONL
- Deterministic derive layer (phase, risk, file attention, next moves)
- Replay store with JSONL serialization
- File-backed persistence layer
- Electron + React renderer with 5 panels
- Built-in payment-refactor fixture session
- Tests for derive, persistence, replay-store, transcript-adapter

## 2026-03-31 — Session history recovery

- Extracted global AI CLI session history (4,400+ messages, 25 daily files)
- Extracted project-specific history (347 messages from 15 Codex + 1 Claude session)
- Restored accidentally deleted global history

## 2026-04-01 — Documentation structure overhaul

- Created `docs/north-star.md` — project vision and pillars
- Created `docs/architecture.md` — ADR-style decision log with domain references
- Created `docs/prompts/shadow-system-prompt.md` — canonical prompt with inline commentary
- Created `AGENTS.md` — governance rules (prompt workflow, visual priority, read-only constraint)
- Created `CLAUDE.md` — thin router to AGENTS.md
- Created `.claude/settings.json` — Claude Code project settings
- Created `.github/rules.md` + domain rules — VS Code / Copilot rules with applyTo frontmatter
- Created `.vscode/copilot-instructions.md` — VS Code Copilot project instructions
- Created `docs/todo.md` — pending task tracker (mirrors GitHub issues)
- Created `docs/history/` — append-only completed work log
- Moved research docs to `docs/research/`

## 2026-04-01 — Visual research and design documentation

- Deep audit of agent-flow rendering patterns (Canvas2D, D3-Force, particles, glass cards)
- Deep audit of sidecar runtime patterns (Electron, OpenCode SDK, MCP, fold, drift detection)
- Visual inspiration catalog from 8 portfolio + open-source references
- Unified visual design strategy document
- Shadow inference engine architecture spec (OpenCode harness + direct API fallback)

## 2026-04-12 — Phase 1 implementation PRs

- Opened PR #26 (Canvas2D renderer with D3-Force layout)
- Opened PR #27 (Event capture pipeline: watcher, parser, buffer)
- Opened PR #28 (Inference engine: OpenCode + fallback)
- Opened PR #29 (Fixtures + Phase 1 Tests)
- Opened PR #30 (Observability: structured logging, metrics, health checks)
- Opened PR #31 (Renderer core testing suite)
- Opened PR #32 (Inference contract tests with fake client)
- All 18 issues (#8-#25) opened to track remaining work

## 2026-04-18 — Master coordination + architecture assessment

- Investigated 9 architectural critique claims from external GPT-5 Pro review
- 5 of 9 already addressed, 3 partially addressed, 1 valid (doc drift)
- Wrote Master Plan A (must-do forward items): PR comment fixes, merge order, doc cleanup
- Wrote Master Plan B (architecture opinion): honest assessment, what not to over-engineer
- Added implementation status headers to `docs/domain-events.md`, `docs/domain-gui.md`, `docs/domain-inference.md`
- Archived RepoVis docs (separate product, wrong repo location)
- Created `docs/getting-started.md`
- Opened documentation PRs #33 (Finish-line Plan) and updated metadata-sync workflows
- Finalized Phase 1 remediation checklist

## 2026-04-19 — Phase 2 foundation PRs merged

- PR #29 merged: shared replay fixture corpus (happy-path, tool-heavy, risk-escalation, subagent-flow, corrupt-partial) plus transcript-adapter and derive edge-case tests (closes #20, #25)
- PR #31 merged: renderer refactored to `useReducer` state machine with 16 transition tests and 7 expanded preload/IPC contract tests (closes #22)
- PR #32 merged: `FakeInferenceClient` seam, deterministic context packager, prompt-builder character-equality checks, parser fallback tests (closes #23)
- PR #34 merged: master-plan remediation landed `docs/getting-started.md`, architecture phase split, `docs/todo.md` sync, and history log update
- PR #35 merged: fixed 14 failing tests on main by adding `packContext`, `buildUserMessage`, and `ShadowContextPacket` exports; added coverage tooling; re-aligned docs with current codebase

## 2026-04-20 — Secure credential storage hardening

- Reworked `src/inference/auth.ts` to prefer an Electron `safeStorage` encrypted local store at `~/.shadow-agent/credentials.enc.json`
- Added explicit consent gating for legacy plaintext fallbacks via `SHADOW_ALLOW_FILE_CREDENTIAL_FALLBACK=1`
- Added automatic migration of consented legacy provider keys into the encrypted store
- Added auth-focused tests covering secure store loading, env precedence, fallback consent, migration, and POSIX permission enforcement
- Updated active docs to describe the new auth chain and secure permission guidance

## 2026-05-19 — Phase 2 visual landing

- Closed superseded PRs #41 and #42; ported selective renderer ideas onto current `main`
- Theme helpers (`withAlpha`, `getStateColor`, `TIMING`), animated `GlassCard`, Citadel CSS keyframes subset, `triggerCanvasPulse` API
- Canvas command-record tests (`record-2d-context`, 258 tests passing)
- Status report: `docs/reports/phase2-landing-status.md`

## 2026-05-19 — Pluggable capture transport + OpenCode client (PR #44)

- PR #44 merged: pluggable capture transports (file-tail, HTTP stream, WebSocket, TCP socket), privacy-aware queue spill, and session-manager refactor
- OpenCode inference client (`opencode-client.ts`) plus `inference-client-factory.ts` (OpenCode first, Anthropic fallback); closes #38
- Review fixes: session pinning in file-tail reads, override-path rediscovery, reconnect delay validation, per-connection TextDecoder, inference checkpoint drain hardening
- Canvas dot-grid atmosphere pulse and heavy-scene quality-tier regression test; partial closeout for #39 and #40
- 250 tests passing on main after merge

## 2026-05-20 — Phase 2 manual visual/performance acceptance (#61)

- Completed manual visual/performance acceptance pass for Phase 2 features
- Build passes (web lib, renderer, electron) — 250/250 tests passing
- All 6 checklist items reviewed: hex grid readability, edge glow, GlassCard mount timing, pulse visibility, timeline scrub smoothness, sustained replay performance
- Quality auto-adjustment system (4 tiers: ultra/high/medium/low) with EMA frame-time tracking
- GlassCard glass-morphism with 3 sizes, 3 glow variants, 3 slide directions with 300ms ease-out animation
- Canvas2D renderer with D3-Force simulation, hexagonal nodes, quadratic bezier edges, particle trails via Web Worker
- Created `docs/reports/phase2-landing-status.md` with detailed acceptance findings
- Created `docs/reports/assets/phase2-landing/` directory for future screenshot captures
- Removed manual acceptance entry from `docs/todo.md`
- All items PASS code review; no critical or high-severity issues found

- PR #26 merged: Canvas2D + D3-Force renderer landed on main for the live graph view
- PR #27 merged: transcript watcher, bounded event queue, IPC bridge, and session manager landed on main
- PR #30 merged: logger hardening and subsystem instrumentation landed on main
- PR #33 merged: finish-line coordination plans and architecture assessment landed on main
- Main now carries the full Phase 2 foundation; remaining work is provider depth, optional visual atmosphere, and follow-up polish

## 2026-05-20 — Wire canvas pulse to EventKind milestones

- Added `triggerPulseForEventKind` and `triggerPulsesForEvents` to `canvas-pulse.ts` mapping canonical EventKind values (tool_started, tool_completed, tool_failed, subagent_dispatched, subagent_returned, agent_spawned, agent_completed, session_started, permission_requested) to burst/ripple pulse types with per-kind debounce (100ms)
- Wired pulses into the renderer event path: live events (`App.tsx` `onLiveEvents` callback), snapshot loads (`useEffect` on snapshot changes), and CanvasRenderer draw frame (`tickCanvasPulses` + `sampleCanvasPulseBoost` in grid opacity)
- Pulse origin uses node position when available, falls back to canvas center (0.5, 0.5)
- Pulse mapping documented inline in `canvas-pulse.ts` with rationale table
- 285 tests passing

## 2026-07-23 — First deterministic replay of the Codex corpus (heuristic + live shadow)

- Replayed `tests/fixtures/transcripts/codex/rollout-2026-07-23-homelab-coordinator.jsonl`
  (2,885 canonical events, 276.8 virtual minutes) through the new replay runner twice:
  `--speed 0 --infer none` and `--speed 60 --infer live` (DeepSeek via openai-compatible).
- Determinism proven: identical `sha256:4c82bd11e8c9…` event/trigger hash in both modes —
  278 trigger firings (194 normal, 84 immediate) regardless of inference or speed.
- Latency (live, DeepSeek): p50 10.5 s, p95 16.7 s, max 20.1 s per inference. Against the
  design budget (p95 < 30 s for 1× real-time observation): PASS — live shadowing of a real
  Codex coordinator is feasible at "not real time but pretty close" fidelity.
- At 60×, single-flight collapsed 278 triggers into 24 inference calls (one per ~11 virtual
  minutes); insight staleness p50 9.4 virtual minutes. High-speed replay is a corpus-sweep
  mode; fidelity measurement needs ≤10× or 1×.
- Checkpoints (heuristics-only): 0/4 surfaced. With live shadow: plan-pivot surfaced
  (26.8 min lag at 60×); GHCR stall and final-not-done "surfaced" only via loose text
  matches (matcher precision follow-up); scope-drift abort missed at 60× (window flew by in
  <40 s wall). The shadow model is the show; heuristics alone see almost nothing.
- Follow-ups filed from findings: checkpoint matcher precision; windowed (not cumulative)
  failed-tool risk counts; 1×/10× fidelity run; pre-push Doppler gate still references the
  renamed `ai-models` project (now `ai-automation`) and silently skips live inference.
