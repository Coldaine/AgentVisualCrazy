# Todo

> Pending tasks. Each entry has a date. Non-trivial tasks also have a GitHub issue.
> When completed, remove from here and add a brief note to `docs/history/`.

## Implementation

- 2026-04-13: **Wire Three.js dot-grid background** — Optional Citadel-style canvas dot-grid OR @react-three/fiber ParticleField as Layer 0 behind the Canvas2D visualization. Subtle parallax, very low opacity. LOW PRIORITY — canvas looks fine without it.

- 2026-04-01: **Implement OpenCode inference client** — Create `src/inference/opencode-client.ts`. Copy sidecar's `opencode-client.js`. Start server, create session, send prompt, poll completion. Not yet implemented — direct Anthropic API fallback exists as an interim path.

## Testing

- 2026-04-01: **Execute remaining visual/performance test plan** — See `docs/plans/plan-testing-observability.md` for the remaining roadmap beyond the current green suite (`232` tests passing on 2026-04-20).
