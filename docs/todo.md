# Todo

> Pending tasks. Each entry has a date. Non-trivial tasks also have a GitHub issue.
> When completed, remove from here and add a brief note to `docs/history/`.

## Implementation

- 2026-04-13: ~~**Port agent-flow Canvas2D renderer**~~ ✅ DONE — `shadow-agent/src/renderer/canvas/CanvasRenderer.tsx` + `types.ts` + `theme/colors.ts`. SVG GraphView replaced with Canvas2D + D3-Force. Hexagonal nodes, tapered bezier edges, particle trails, hex grid background. Branch: `work/repovis-canvas-port`. Next: wire Three.js dot-grid background, then GlassCard components.

- 2026-04-13: ~~**GlassCard + react-spring panels**~~ ✅ DONE — `GlassCard.tsx` (CVA variants: size, glow, slide), `TimelineScrubber.tsx` (event markers + playhead + spring animation), `ShadowPanel.tsx` (confidence rings, risk signals, next moves). 3-column CSS Grid layout wired in App.tsx. Done.

- 2026-04-13: ~~**Shadow canvas overlays**~~ ✅ DONE — `drawRiskVignette`, `drawShadowNode`, `drawPredictionTrail` in CanvasRenderer. Risk vignette keyed to risk level, ghost hexagon with 🔮, dashed prediction trail with label + confidence.

- 2026-04-13: **Wire Three.js dot-grid background** — Optional Citadel-style canvas dot-grid OR @react-three/fiber ParticleField as Layer 0 behind the Canvas2D visualization. Subtle parallax, very low opacity. LOW PRIORITY — canvas looks fine without it.

- 2026-04-01: **Implement Phase 2 live transcript watcher** — Create `shadow-agent/src/adapters/session-watcher.ts`. FileSystemWatcher on Claude Code JSONL session directory. Stream new events to renderer via IPC.

- 2026-04-01: ~~**Implement inference auth loader**~~ — Completed 2026-04-18. `src/inference/auth.ts` implements priority chain: `process.env` → `~/.shadow-agent/.env` → OpenCode `auth.json`. Merged via PR #28.

- 2026-04-01: **Implement OpenCode inference client** — Create `src/inference/opencode-client.ts`. Copy sidecar's `opencode-client.js`. Start server, create session, send prompt, poll completion. Not yet implemented — direct Anthropic API fallback exists as an interim path.

- 2026-04-01: ~~**Build shadow context packager**~~ — Completed 2026-04-18. `src/inference/context-packager.ts` exports `buildContextPacket` and `packContext`. Merged via PR #28.

- 2026-04-01: ~~**Build shadow prompt builder**~~ — Completed 2026-04-18. `src/inference/prompt-builder.ts` exports `ShadowContextPacket` type, `buildUserMessage`, and `buildInferenceRequest`. Merged via PR #28.

- 2026-04-01: ~~**Wire inference trigger engine**~~ — Completed 2026-04-18. `src/inference/trigger.ts` implements event-count, time, and specific-event triggers. Merged via PR #28.

- 2026-04-01: ~~**Wire inference engine**~~ — Completed 2026-04-18. `src/inference/shadow-inference-engine.ts` orchestrates trigger → context → prompt → client → parser. Merged via PR #28.

- 2026-04-01: ~~**Build shadow MCP server**~~ — Completed 2026-04-18. `src/mcp/shadow-mcp-server.ts` exposes `shadow_status`, `shadow_events`, `shadow_ask`. Merged via PR #28.

- 2026-04-01: ~~**Implement direct Anthropic API fallback**~~ — Completed 2026-04-18. `src/inference/direct-api.ts` implements `InferenceClient` using `@anthropic-ai/sdk`. Merged via PR #28.

## Documentation

- 2026-04-01: **Enable GitHub Issues** on the AgentVisualCrazy repo (currently disabled) and create issues for each implementation task above.

## Testing

- 2026-04-01: **Execute test plan** — See `docs/shadow-agent-test-plan.md` for the full roadmap. Blocked on seam refactors.
