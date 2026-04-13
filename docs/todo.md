# Todo

> Pending tasks. Each entry has a date. Non-trivial tasks also have a GitHub issue.
> When completed, remove from here and add a brief note to `docs/history/`.

## Implementation

- 2026-04-13: ~~**Port agent-flow Canvas2D renderer**~~ ✅ DONE — `shadow-agent/src/renderer/canvas/CanvasRenderer.tsx` + `types.ts` + `theme/colors.ts`. SVG GraphView replaced with Canvas2D + D3-Force. Hexagonal nodes, tapered bezier edges, particle trails, hex grid background. Branch: `work/repovis-canvas-port`. Next: wire Three.js dot-grid background, then GlassCard components.

- 2026-04-01: **Implement Phase 2 live transcript watcher** — Build the `shadow-agent/src/capture/` pipeline from `docs/plans/plan-event-capture.md`: session discovery, transcript watcher, incremental parser, normalizer, event buffer, IPC bridge, and session manager. [In Progress - PR #27](https://github.com/Coldaine/AgentVisualCrazy/pull/27)

- 2026-04-01: ~~**Implement inference auth loader**~~ — Completed 2026-04-18. `src/inference/auth.ts` implements priority chain: `process.env` → `~/.shadow-agent/.env` → OpenCode `auth.json`. Merged via PR #28.

- 2026-04-01: **Implement OpenCode inference client** — Create `src/inference/opencode-client.ts`. Copy sidecar's `opencode-client.js`. Start server, create session, send prompt, poll completion. Not yet implemented — direct Anthropic API fallback exists as an interim path.

- 2026-04-01: ~~**Build shadow context packager**~~ — Completed 2026-04-18. `src/inference/context-packager.ts` exports `buildContextPacket` and `packContext`. Merged via PR #28.

- 2026-04-01: ~~**Build shadow prompt builder**~~ — Completed 2026-04-18. `src/inference/prompt-builder.ts` exports `ShadowContextPacket` type, `buildUserMessage`, and `buildInferenceRequest`. Merged via PR #28.

- 2026-04-01: ~~**Wire inference trigger engine**~~ — Completed 2026-04-18. `src/inference/trigger.ts` implements event-count, time, and specific-event triggers. Merged via PR #28.

- 2026-04-01: ~~**Wire inference engine**~~ — Completed 2026-04-18. `src/inference/shadow-inference-engine.ts` orchestrates trigger → context → prompt → client → parser. Merged via PR #28.

- 2026-04-01: ~~**Build shadow MCP server**~~ — Completed 2026-04-18. `src/mcp/shadow-mcp-server.ts` exposes `shadow_status`, `shadow_events`, `shadow_ask`. Merged via PR #28.

- 2026-04-01: ~~**Implement direct Anthropic API fallback**~~ — Completed 2026-04-18. `src/inference/direct-api.ts` implements `InferenceClient` using `@anthropic-ai/sdk`. Merged via PR #28.

## Observability

- 2026-04-12: ~~**Harden logger behavior and sinks**~~ — Completed 2026-04-18. Structured logger with level filtering, memory ring, file sink, redaction, and circular-reference handling. Merged via PR #30.

- 2026-04-12: **Finish instrumentation coverage** — Extend logging across capture, IPC, inference, and persistence boundaries with consistent event names and redacted context payloads. [Partially done — core seams instrumented; capture pipeline not yet on main]

## Documentation

- 2026-04-01: **Enable GitHub Issues** on the AgentVisualCrazy repo (currently disabled) and create issues for each implementation task above.

## Testing

- 2026-04-12: ~~**Expand Phase 1 edge coverage**~~ — Completed 2026-04-18. Transcript-adapter, derive, replay-store, and persistence edge/corruption tests plus integration tests. Merged via PR #29.

- 2026-04-12: **Add Phase 2 capture tests before shipping the watcher** — Cover incremental parsing, session discovery, ring buffer behavior, temp-file append/truncation/rotation, and session-manager integration with fake IPC. [Blocked — capture pipeline not yet on main]

- 2026-04-12: ~~**Add Electron and renderer contract tests**~~ — Completed 2026-04-18. Preload bridge API, main-process replay/export, and renderer state machine tests. Merged via PR #31.

- 2026-04-12: ~~**Add inference contract tests with a fake client**~~ — Completed 2026-04-18. Context packing, prompt building, parser fallback, trigger thresholds, and `FakeInferenceClient`. Merged via PR #32.

- 2026-04-12: **Add Canvas2D command tests and selective visual regressions** — Protect node/edge/particle semantics with a recorded 2D context and add a small curated screenshot suite for canonical scenes. [Blocked — Canvas2D renderer not yet on main]

- 2026-04-12: ~~**Maintain a shared replay fixture corpus**~~ — Completed 2026-04-18. Transcript and replay fixtures under `shadow-agent/tests/fixtures/`. Merged via PR #29.

## Infrastructure

- 2026-04-19: **Fix broken test suite on main** — `buildUserMessage` and `ShadowContextPacket` were imported from generated `prompts.ts` but never exported; `packContext` was imported from `context-packager.ts` but didn't exist. Fixed by moving `ShadowContextPacket` and `buildUserMessage` to `prompt-builder.ts` and adding `packContext` to `context-packager.ts`. See branch `fix/test-remediation-and-docs-consistency`.

- 2026-04-19: **Add test execution to CI** — The `prompt-parity.yml` workflow only checked prompt sync. Updated to also run `npm test` and `npm run build`. See branch `fix/test-remediation-and-docs-consistency`.

- 2026-04-19: **Add test execution to pre-commit hook** — The Husky pre-commit hook only ran `prompts:check`. Updated to also run `npm test`. See branch `fix/test-remediation-and-docs-consistency`.
