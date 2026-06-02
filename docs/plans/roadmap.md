# Roadmap — making AgentVisualCrazy real

The canonical forward plan. Read [`../north-star.md`](../north-star.md) for *what* and
*why*; this is *what's next, in order*. Older `plan-*.md` files in this folder are historical
context from the pre-reset era — this document supersedes them.

## Baseline (where we actually are, 2026-05-30)

After the great-cleanup reset, this is one flat Electron app — no monorepo, no `third_party/`,
no dead scaffolding. Verified facts, not aspirations:

- **Builds** from the repo root (`npm run build`, exit 0) and **launches** (`npm start`).
- **47 test files / 427 tests pass** (`npm test` = `tsc --noEmit` + vitest).
- **It renders.** The built app mounts the dashboard and live-tails a real Claude Code
  session (the `file://` asset-path + index-path bugs that left it blank are fixed).
- **Watch** works against Claude Code JSONL. **Interpret** is wired (local-only default).
  **Render** is a functional Canvas2D + D3-Force graph + glass-panel dashboard.

What's *not* done: it has never been driven against a live model end-to-end by a human; the
visual layer is functional, not yet the exhibit-grade ambition; only Claude Code is a real
capture driver.

## Guiding goal

The thing you'd actually open beside Claude and *enjoy* looking at. Usable + beautiful.
Visual fidelity is priority #1 (per the north star).

## Milestones

### M1 — Make it genuinely usable (close the "never really used it" gap)
- **Live inference acceptance.** Point `SHADOW_INFERENCE_PROVIDER` / `OPENAI_BASE_URL` /
  `SHADOW_INFERENCE_MODEL` at a real endpoint, enable off-host opt-in, confirm model insights
  actually render against a live session. (This is `docs/todo.md`'s open manual-acceptance item.)
- **Session picker.** Right now it auto-picks the most-recently-modified `~/.claude/projects`
  transcript. Let the user choose which session to watch.
- **Run ergonomics.** A dev-run that's one command and obvious; document it in the README.
- *Exit criteria:* a human watches a live Claude session, sees correct insights, and it feels solid.

### M2 — Visual fidelity pass (the reason this project exists)
- Bring the Canvas2D graph up to the agent-flow bar: hexagonal nodes, state-colored glow,
  particle trails, tapered bezier edges, bloom, ambient dot-grid pulse.
- Mine [`../ideas/repoviz/repovis-creative-alternatives.md`](../ideas/repoviz/repovis-creative-alternatives.md)
  (~40 concepts) and the `exhibit-prototype.jsx` for the exhibit visual language; pick the
  views that fit live agent observation and build them for real.
- *Exit criteria:* a screenshot that looks like the north-star "success" description.

### M3 — Interpretation depth
- Real, calibrated model insights: phase detection, risk signals, file-attention, next-action
  prediction with confidence — not just rule-based stand-ins.
- The realtime flowchart / insight surfaces (the unbuilt `#83` idea).
- *Exit criteria:* insights are accurate and trustworthy enough to glance at instead of reading the transcript.

### M4 — Reach
- Multi-harness capture beyond Claude Code via the existing `HarnessDriver` registry +
  a hook-receiver transport (Codex, Cursor, Gemini all expose `transcript_path` in hooks).
- Embed surfaces (the `build:web` bundle / custom element) if wanted.

## Housekeeping (do alongside, not blocking)

- **Doc-path sweep.** ~117 stale `shadow-agent/` path references remain in domain docs,
  `getting-started.md`, research, and archived plans. Update the live ones; leave history/ alone.
- **Naming decision.** Decide whether to fully rename the internal `shadow`/`SHADOW_*`
  identifiers, `~/.shadow-agent/` storage, and `shadow_*` MCP tool names to match the
  AgentVisualCrazy product name. This is a behavior-affecting refactor (credential paths, env
  vars) — deliberate, not casual. Deferred until someone decides it's worth the churn.
- **CI green check.** Confirm the flattened `.github/workflows/ci.yml` passes on the first push.
- **Logger interface + DI redesign.** `StructuredLogger` has no interface and module-scope
  singletons force tests to spy on `console.log` with `vi.hoisted` hacks. Extract `interface
  Logger`, thread it via constructor parameters, add `createTestLogger()` for in-memory
  assertion. See `docs/plans/plan-testing-observability.md#logging-architecture-redesign`.
- **Remaining weak test cleanup.** After PR #100 eliminated all FICTION tests, 4 D-grade and
  3 WEAK files remain (see `docs/audits/README.md`). Strengthen: IPC bridge (2 tests for 145
  lines), host.ts (1 test), renderer-surface-adapter (1 test), record-2d-context (tests the
  helper, not production code).
