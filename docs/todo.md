# Todo

> Pending tasks. Each entry has a date. Non-trivial tasks also have a GitHub issue.
> When completed, remove from here and add a brief note to `docs/history/`.

## Implementation

- 2026-04-13: ~~**Port agent-flow Canvas2D renderer**~~ ✅ DONE — `shadow-agent/src/renderer/canvas/CanvasRenderer.tsx` + `types.ts` + `theme/colors.ts`. SVG GraphView replaced with Canvas2D + D3-Force. Hexagonal nodes, tapered bezier edges, particle trails, hex grid background. Branch: `work/repovis-canvas-port`. Next: wire Three.js dot-grid background, then GlassCard components.

- 2026-04-13: ~~**GlassCard + react-spring panels**~~ ✅ DONE — `GlassCard.tsx` (CVA variants: size, glow, slide), `TimelineScrubber.tsx` (event markers + playhead + spring animation), `ShadowPanel.tsx` (confidence rings, risk signals, next moves). 3-column CSS Grid layout wired in App.tsx. Done.

- 2026-04-13: ~~**Shadow canvas overlays**~~ ✅ DONE — `drawRiskVignette`, `drawShadowNode`, `drawPredictionTrail` in CanvasRenderer. Risk vignette keyed to risk level, ghost hexagon with 🔮, dashed prediction trail with label + confidence.

- 2026-04-13: **Wire Three.js dot-grid background** — Optional Citadel-style canvas dot-grid OR @react-three/fiber ParticleField as Layer 0 behind the Canvas2D visualization. Subtle parallax, very low opacity. LOW PRIORITY — canvas looks fine without it.

- 2026-04-01: **Implement Phase 2 live transcript watcher** — Create `shadow-agent/src/adapters/session-watcher.ts`. FileSystemWatcher on Claude Code JSONL session directory. Stream new events to renderer via IPC.

- 2026-04-01: **Implement inference auth loader** — Create `src/inference/auth.ts`. Copy sidecar's `auth-json.js` pattern. Priority: `process.env` > `~/.shadow-agent/.env` > OpenCode `auth.json`.

- 2026-04-01: **Implement OpenCode inference client** — Create `src/inference/opencode-client.ts`. Copy sidecar's `opencode-client.js`. Start server, create session, send prompt, poll completion.

- 2026-04-01: **Build shadow context packager** — Create `src/inference/context-packager.ts`. Takes `DerivedState` + recent events → `ShadowContextPacket`. Token budget ~10k.

- 2026-04-01: **Build shadow prompt builder** — Create `src/inference/prompt-builder.ts`. System prompt from `docs/prompts/shadow-system-prompt.md`. User message from context packet.

- 2026-04-01: **Wire inference trigger engine** — Create `src/inference/trigger.ts`. Triggers on: N events, 30s timer, risk escalation, specific event kinds.

- 2026-04-01: **Wire inference engine** — Create `src/inference/shadow-inference-engine.ts`. Connects trigger → context packager → prompt builder → OpenCode/direct API → response parser → ShadowInsight events.

- 2026-04-01: **Build shadow MCP server** — Create `src/mcp/shadow-mcp-server.ts`. Tools: `shadow_status`, `shadow_events`, `shadow_ask`. stdio transport.

- 2026-04-01: **Implement direct Anthropic API fallback** — Create `src/inference/direct-api.ts`. Fallback when OpenCode not available.

## Documentation

- 2026-04-01: **Enable GitHub Issues** on the AgentVisualCrazy repo (currently disabled) and create issues for each implementation task above.

## Testing

- 2026-04-01: **Execute test plan** — See `docs/shadow-agent-test-plan.md` for the full roadmap. Blocked on seam refactors.
