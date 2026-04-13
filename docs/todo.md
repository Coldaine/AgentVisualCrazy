# Todo

> Pending tasks. Each entry has a date. Non-trivial tasks also have a GitHub issue.
> When completed, remove from here and add a brief note to `docs/history/`.

## Implementation

- 2026-04-13: ~~**Port agent-flow Canvas2D renderer**~~ ✅ DONE — `shadow-agent/src/renderer/canvas/CanvasRenderer.tsx` + `types.ts` + `theme/colors.ts`. SVG GraphView replaced with Canvas2D + D3-Force. Hexagonal nodes, tapered bezier edges, particle trails, hex grid background. Branch: `work/repovis-canvas-port`. Next: wire Three.js dot-grid background, then GlassCard components.

- 2026-04-01: **Implement Phase 2 live transcript watcher** — Build the `shadow-agent/src/capture/` pipeline from `docs/plans/plan-event-capture.md`: session discovery, transcript watcher, incremental parser, normalizer, event buffer, IPC bridge, and session manager.

- 2026-04-01: **Implement inference auth loader** — Create `src/inference/auth.ts`. Copy sidecar's `auth-json.js` pattern. Priority: `process.env` > `~/.shadow-agent/.env` > OpenCode `auth.json`.

- 2026-04-01: **Implement OpenCode inference client** — Create `src/inference/opencode-client.ts`. Copy sidecar's `opencode-client.js`. Start server, create session, send prompt, poll completion.

- 2026-04-01: **Build shadow context packager** — Create `src/inference/context-packager.ts`. Takes `DerivedState` + recent events → `ShadowContextPacket`. Token budget ~10k.

- 2026-04-01: **Build shadow prompt builder** — Create `src/inference/prompt-builder.ts`. System prompt from `docs/prompts/shadow-system-prompt.md`. User message from context packet.

- 2026-04-01: **Wire inference trigger engine** — Create `src/inference/trigger.ts`. Triggers on: N events, 30s timer, risk escalation, specific event kinds.

- 2026-04-01: **Wire inference engine** — Create `src/inference/shadow-inference-engine.ts`. Connects trigger → context packager → prompt builder → OpenCode/direct API → response parser → ShadowInsight events.

- 2026-04-01: **Build shadow MCP server** — Create `src/mcp/shadow-mcp-server.ts`. Tools: `shadow_status`, `shadow_events`, `shadow_ask`. stdio transport.

- 2026-04-01: **Implement direct Anthropic API fallback** — Create `src/inference/direct-api.ts`. Fallback when OpenCode not available.

## Observability

- 2026-04-12: **Harden logger behavior and sinks** — Add explicit Error serialization, configurable log levels via environment, and durable file-write backpressure/rotation policies for `shadow-agent/src/shared/logger.ts`.

- 2026-04-12: **Finish instrumentation coverage** — Extend logging across capture, IPC, inference, and persistence boundaries with consistent event names and redacted context payloads.

## Documentation

- 2026-04-01: **Enable GitHub Issues** on the AgentVisualCrazy repo (currently disabled) and create issues for each implementation task above.

## Testing

- 2026-04-12: **Expand Phase 1 edge coverage** — Add transcript-adapter, derive, replay-store, and persistence edge/corruption tests plus one transcript -> canonical events -> derive integration test.

- 2026-04-12: **Add Phase 2 capture tests before shipping the watcher** — Cover incremental parsing, session discovery, ring buffer behavior, temp-file append/truncation/rotation, and session-manager integration with fake IPC.

- 2026-04-12: **Add Electron and renderer contract tests** — Cover preload bridge API drift, main-process replay/export behavior, and renderer busy/error/open/export state transitions.

- 2026-04-12: **Add inference contract tests with a fake client** — Cover context packing, prompt building, parser fallback, trigger thresholds, and orchestrator behavior with no live model dependency in CI.

- 2026-04-12: **Add Canvas2D command tests and selective visual regressions** — Protect node/edge/particle semantics with a recorded 2D context and add a small curated screenshot suite for canonical scenes.

- 2026-04-12: **Maintain a shared replay fixture corpus** — Store representative transcript/replay fixtures under `shadow-agent/tests/fixtures/` for parsing, derive, renderer, and inference regression coverage.
