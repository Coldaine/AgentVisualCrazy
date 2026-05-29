# Todo

> Pending tasks. Each entry has a date. Non-trivial tasks also have a GitHub issue.
> When completed, remove from here and add a brief note to `docs/history/`.

## Implementation

- 2026-05-29: **Realtime LLM-observer flowchart panel** - GitHub #83 (`flowchart-tracer.ts` + mermaid cursor panel) remains outstanding. The INTERPRET→RENDER wire (model insights → holographic graph) is a prerequisite and is now done; #83's dedicated flowchart surface is still to build.
- 2026-05-29: **Optional dedicated `shadow:insights` IPC channel** - the model→renderer refresh currently rides an empty `shadow:events` dirty-flush; a dedicated channel could decouple insight latency from event batches if needed.

## Testing

- 2026-05-29: **Real-network OpenAI-compatible acceptance** - manual check: point `OPENAI_BASE_URL`/`SHADOW_INFERENCE_MODEL` at a live OpenAI-compatible endpoint, enable off-host inference, and confirm model insights render. Not in CI.

- 2026-04-01: **Manual visual/performance acceptance** - Glow quality, panel composition, motion timing, sustained replay perf. See `docs/reports/phase2-landing-status.md`.
- 2026-05-19: **Pixel snapshot regression (deferred)** - 4-6 canonical scenes per `plan-testing-observability.md`; command-record suite landed (258 tests on `main`).
