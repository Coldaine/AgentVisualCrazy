# Plan: Codex Ingestion + Deterministic Corpus Replay

Status: **design accepted, implementation in flight** (PR series below).
Date: 2026-07-23.

## Goal

Make the harness able to (1) parse and attend to **Codex rollout** shapes as a first-class
`HarnessDriver`, and (2) **deterministically replay** a captured real session — starting with
`tests/fixtures/transcripts/codex/rollout-2026-07-23-homelab-coordinator.jsonl` — through the
full capture → derive → shadow-inference pipeline at controllable speed, with instrumentation
that answers: *does interpretation happen fast enough, and does it say the right things at the
right times?* Ground truth for "right things" is the fixture's companion
`rollout-2026-07-23-homelab-coordinator.ground-truth.md`.

The deterministic corpus is the show *stage*; the pluggable shadow model is the *show*. The
replay runner must therefore keep the deterministic part (parsing, normalization, derive,
trigger timing) byte-reproducible while letting the inference client be swapped: `none`
(heuristics only), `live` (real provider via Doppler), or `recorded` (future).

## Decisions

### D1 — Codex driver: file-tail + line-framer + new normalizer (no new transport)

`docs/plans/plan-multi-harness-mvp.md` already established Codex is "structurally the same
path" as Claude Code (JSONL tail). The driver slots into the existing registry
(`src/capture/drivers/index.ts`) with:

- **id:** `codex` · **source:** `codex-rollout` · **driverVersion:** `0.1.0`
- **Discovery:** walk `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (newest-mtime wins via
  the existing `discoverActiveSession` race). `sessionId` = the UUID suffix of the filename
  (fallback: full basename). Honors `CODEX_SESSIONS_DIR` override for tests.
- **Framer:** existing `createIncrementalParser` (generic JSONL) — no change.

**Normalizer mapping** (`normalizeEntry` switches on top-level `type`, then `payload.type`):

| Codex shape | CanonicalEvent |
|---|---|
| `session_meta` | `session_started` — payload `{cwd, originator, cliVersion, modelProvider}`; actor `codex` |
| `response_item / message` role `user`/`developer` | `message` actor `user` (developer = injected user intent) |
| `response_item / message` role `assistant` | `message` actor `agent` |
| `event_msg / user_message` | `message` actor `user` (dedupe note below) |
| `event_msg / agent_message` | `message` actor `agent` |
| `response_item / reasoning` | `message` actor `agent`, payload `{thinking: true, summary}` |
| `response_item / custom_tool_call` (incl. `exec`) | `tool_started` payload `{toolName, toolUseId, args}` |
| `response_item / function_call` | `tool_started` (same payload shape; args JSON-parsed if string) |
| `response_item / *_tool_call_output` / `function_call_output` | `tool_completed`, or `tool_failed` when output signals error (non-zero exit / `"success": false`) |
| `event_msg / patch_apply_end` | `tool_completed`/`tool_failed` toolName `apply_patch` |
| `event_msg / mcp_tool_call_end` | `tool_completed`/`tool_failed` toolName from payload |
| `event_msg / web_search_end` | `tool_completed` toolName `web_search`, payload `{query}` |
| `event_msg / task_started` | `agent_spawned` (turn lifecycle; carries `turn_id`) |
| `event_msg / task_complete` | `agent_completed` (fires the trigger's immediate path — end of turn is the highest-value interpretation moment) |
| `event_msg / turn_aborted` | `agent_idle` payload `{aborted: true}` |
| `event_msg / token_count` | `context_snapshot` payload `{tokens…}` (rate-limited: emit ~1 in 10; 770 raw would drown the buffer) |
| `event_msg / context_compacted`, top-level `compacted` | `context_snapshot` payload `{compacted: true}` |
| `event_msg / thread_goal_updated` | `message` actor `system`, payload `{goalUpdate: true, objective}` — a gift to the interpreter; must not be dropped |
| `turn_context`, `world_state`, `thread_settings_applied`, `item_completed` | dropped (v1) — noted in driver doc comment |
| `custom_tool_call` name `wait` | `tool_started` **plus** capability note: this is the coordinator-idle signature |

Dedup rule: Codex often mirrors the same user text as both `event_msg/user_message` and a
`response_item/message`. Normalizer keeps `event_msg` (has the earlier timestamp) and skips a
`response_item` user message whose text matches the immediately preceding user event.

**Capabilities:** `emitsSubagentEvents: false` (v1 — Codex subagent tool calls surface as
tools; upgrading `wait`/spawn calls to `subagent_dispatched`/`subagent_returned` is a
follow-up), `fileAttention: 'tool-args'`, `riskHeuristics: ['tool_failures',
'shell_churn', 'exploration_volume']`, plus new heuristic id `'repeated_searches'`
(the GHCR-403 stuck signature: n≥3 near-identical web_search queries in a window) — implemented
capability-driven in `derive.ts`, no driver branching.

Every event gets `harnessId: 'codex'`. IDs must be **deterministic** for replay: derived from
`sessionId + line number + intra-line index` (unlike the Claude driver's random IDs — see D3).

### D2 — Thread `harnessId` through interpretation

`src/inference/context-packager.ts` hardcodes `observedAgent: 'claude-code'`. Fix: take the
dominant `harnessId` from the event window (fallback `'claude-code'`). The system prompt
already tolerates this field varying; no prompt change in this plan.

### D3 — Deterministic replay runner (headless), pacing from event timestamps

New `src/replay/replay-runner.ts` + CLI entry `npm run replay -- <file> [flags]`:

- **Input:** either a raw harness transcript (routed through driver normalization — this is
  the deterministic-parse test) or a `.replay.jsonl` of CanonicalEvents (`parseReplay`).
- **Pacing:** virtual clock scheduled from event timestamps. `--speed N` (default 60×;
  `--speed 1` = real-time; `--speed 0` = as-fast-as-possible). The trigger's time gate
  (`timeBetweenMs`) reads the **virtual clock**, so trigger decisions are identical at every
  speed — that is what makes the replay deterministic even though wall-clock varies.
- **Pipeline:** replay scheduler → event buffer → `deriveState` → `createInferenceTrigger`
  (virtual-clock injected) → inference engine with `--infer none|live` (live = existing
  provider chain under Doppler, same as `test:live:infer`).
- **Instrumentation (the "is it fast enough" answer):** JSON report with, per trigger firing:
  virtual session time, event index, wall-clock inference latency, insight payload; plus
  aggregates (p50/p95 latency, triggers fired vs. events, buffer depth over time) and
  **checkpoint scoring**: ground-truth moments (drift-detectable-by 07:54Z abort; phase pivot
  13:39→14:04Z; GHCR stall 16:12–16:26Z; final not-done status) matched against the first
  insight that surfaces each, reporting lead/lag in virtual minutes vs. the human.
- **Renderer replay** comes free: the runner can `serializeEvents` the normalized stream to
  `.replay.jsonl`, which the existing Electron `open-replay-file` path already loads.

### D4 — AgentsView (kenn-io/agentsview, MIT, Go): reference + warehouse, not the live path

Alignment with homelab issue Coldaine/coldaine-homelab#26 (`observability-01`,
central AgentsView PostgreSQL, `pg push --watch` / `pg serve`, LLM Archiver read-only):

- **Use as parser reference:** AgentsView ships battle-tested Go parsers for 40+ harnesses
  including Codex. MIT license permits porting logic. Our normalizer's shape table (D1) should
  be cross-checked against their Codex provider before PR-2 merges; divergences documented.
- **Use as corpus warehouse (later):** an `agentsview-pg` *replay source* — read sessions
  from the central Postgres and replay them through the harness — turns every session the
  fleet ever runs into corpus. This is read-only and matches #26's correlation contract
  (machine, runtime, session ids). Follow-up, not in this PR series.
- **Not the live path:** `pg push --watch` batches with seconds-scale latency; local file
  tail is milliseconds. Live observation stays on file tail.
- We do **not** rebuild session browsing (that's `pg serve`'s job); we interpret and render.

### Latency budget (to be validated empirically in the replay report)

Fixture cadence: 3,677 lines / ~4.5 h ≈ one line per 4.4 s average, with bursts of several
events/s during patch chains. Trigger defaults (≥10 events + ≥30 s, force at 50, immediate on
`tool_failed`/`agent_completed`) imply at 1× roughly one inference per 30–60 s of session
time. The shadow must therefore sustain p95 latency **< 30 s** to never fall behind at 1×;
at 60× replay only `--infer none` or sparse sampling is realistic for live providers. The
replay report makes these numbers instead of guessing them.

## PR series

1. **PR-1 `feat: codex replay corpus + design`** — this doc, the sanitized fixture, ground
   truth, fixtures README. (Fixture is sanitized: 17 secrets → `REDACTED_*`; see ground-truth
   header for provenance.)
2. **PR-2 `feat: codex rollout harness driver`** — driver per D1, D2 packager fix,
   `repeated_searches` heuristic, unit tests against the fixture (event-count/shape
   assertions from the ground-truth profile), discovery tests. *(Sonnet subagent; spec above
   is the contract.)*
3. **PR-3 `feat: deterministic replay runner`** — D3 runner + virtual-clock trigger
   injection + report + `npm run replay`. *(Opus subagent; owns virtual-clock design.)*
4. **Replay execution report** — run the corpus at `--speed 0 --infer none` (determinism +
   throughput) and `--speed 60`/`--speed 1 --infer live` (latency + checkpoint scoring);
   findings recorded in `docs/history/log.md`.

## Non-goals (v1)

- Codex subagent graph reconstruction (`emitsSubagentEvents: true`) — follow-up.
- Live tailing of `~/.codex/sessions` in the Electron app UI (driver + discovery make it
  *possible*; enabling/UX is a separate decision).
- AgentsView Postgres reader driver.
- Prompt changes teaching the shadow Codex-specific vocabulary.
