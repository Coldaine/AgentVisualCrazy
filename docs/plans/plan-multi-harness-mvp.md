# Multi-Harness MVP Refactor Plan

> **Status: in progress (2026-07-21).** PRs 2–5 landed (schema widen, HarnessDriver, pluggable discovery, capability-driven derive). PR 6 (Cursor driver + hook-receiver) is implemented in-tree. Tracks the refactor from a Claude-Code-only capture pipeline to a harness-agnostic ingestion + interpretation architecture, plus one second concrete driver (Cursor via hook receiver) wired end-to-end.
>
> Reference: [`docs/research/harness-ingestion-matrix.md`](../research/harness-ingestion-matrix.md) — the durable matrix of which harness exposes which observability surface.

---

## Scope

Shadow-agent's north star ([`docs/north-star.md`](../north-star.md)) names Claude Code, Codex, OpenCode and "whatever comes next" as observation targets. Today the codebase makes a transport-pluggability claim it doesn't deliver:

- `shadow-agent/src/capture/capture-transport.ts:30-34` — `CaptureTransport` (file-tail, http-stream, websocket, socket) is generic for **byte delivery**.
- `shadow-agent/src/capture/normalizer.ts:27` — hard-codes `source: 'claude-transcript'` and parses Claude's specific `tool_use` / `tool_result` block shape.
- `shadow-agent/src/capture/session-discovery.ts:18` — hard-codes `~/.claude/projects/`.
- `shadow-agent/src/shared/schema.ts:1` — `EventSource` is a closed union of Claude flavors.

Bytes-in is generic; *interpretation* and *discovery* are single-harness. Every additional harness today means forking the pipeline. This refactor closes that gap before more code locks in Claude assumptions, and lands a durable capabilities matrix so future decisions (which harness next, which transport to build) have grounded answers instead of guesses.

The refactor covers both ingestion (events flowing IN from the observed agent) and insight output (interpretations flowing OUT to the renderer).

---

## Approach

### Three-layer separation + harness driver registry

```
Transport       bytes / chunks / frames                     (existing; harness-blind)
Framer          chunks -> records                           (line / SSE / OTLP / ANSI)
Adapter         records -> HarnessEvent[]                   (NEW; per-harness format)
Normalizer      HarnessEvent[] -> CanonicalEvent[]          (per-harness; existing one becomes the Claude driver's instance)
HarnessDriver   bundles discovery + transport + framer + adapter + normalizer + capability flags
DriverRegistry  resolves a driver by id; exposes capability metadata to derive + renderer
```

Why two layers (Adapter and Normalizer) instead of one: harnesses with very different wire formats (Anthropic blocks vs. OpenAI rollout vs. OTel spans vs. ANSI) need real parsers, but several harnesses converge on similar canonical mappings (tool_started / tool_completed). Splitting lets normalizers be shared/composed without duplicating parsers.

**Redaction stays where it is** (`prepareEventsForStorage` in `event-buffer.ts` + `sanitizeTranscriptText` in `derive.ts`). Operates on `CanonicalEvent`, post-normalize, single source of truth. Drivers do NOT re-implement redaction.

### Mechanism → layer mapping

| Mechanism | Transport | Framer | Adapter |
|---|---|---|---|
| JSONL transcript tail | file-tail (existing) | line | per-harness JSONL adapter |
| Hook receiver (HTTP/socket POST) | http-stream / socket (existing) | line | per-harness hook adapter |
| OpenTelemetry (OTLP) | otlp-http (NEW) | otlp-framer (NEW) | otel-span adapter |
| SSE event bus (OpenCode) | http-stream (existing) | sse-framer (NEW) | opencode-bus adapter |
| PTY / stdout (Aider) | pty (NEW) | ansi-framer (NEW) | pty-shell adapter |
| MCP self-report | http / ws (existing) | json-rpc framer (NEW) | mcp adapter |

The matrix concludes that three transports (JSONL tail, hook receiver, OTLP receiver) cover 8 of the 9 surveyed harnesses.

### Schema changes (additive, non-breaking)

In `shadow-agent/src/shared/schema.ts`:

- Widen `EventSource` from closed union to `string` alias + a runtime `KnownEventSources` constant + `HarnessDriverRegistry` lookup. Existing literals like `'claude-transcript'` keep working without churn. Spill-to-disk in `event-buffer.ts` does not validate the union, so widening is safe at persistence.
- `CanonicalEvent.payload` stays `Record<string, unknown>`. Renderer and derive already treat it structurally. Per-driver typed payload aliases live inside each driver module for adapter-internal type safety only.
- Add three OPTIONAL fields on `CanonicalEvent`: `harnessId?: string`, `driverVersion?: string`, `correlationId?: string`. Optional preserves replay fixture compat; registry assigns `harnessId = 'claude-code'` default when missing.
- Add `harnessId?: string` to `AgentNode` so the renderer can apply a per-harness palette accent without forking layout.
- **Session identity:** two concurrently observed harnesses are **two distinct `sessionId`s**. `correlationId` (e.g., shared cwd) optionally groups them. Sharing a single sessionId across harnesses would corrupt the spill directory layout (`event-buffer.ts` uses `encodeURIComponent(sessionId)` as the dir name).

### Insight-output flexibility (no switch statements)

`derive.ts` becomes **capability-driven, not branched**. Each driver exposes:

```ts
interface HarnessCapabilities {
  emitsSubagentEvents: boolean
  fileAttention: 'tool-args' | 'explicit-event' | 'inferred-from-text'
  toolNameMap?: (toolName: string) => string
  riskHeuristics: RiskHeuristic[]   // additive, not exclusive
}
```

`derive.ts` iterates events and asks `registry.get(event.harnessId).capabilities` for extractors. Renderer **does not fork** — it still reads `DerivedState`, with each `AgentNode.harnessId` driving a palette accent only. Visual fidelity ([`AGENTS.md`](../../AGENTS.md) line 29) is preserved because the geometry/layout pipeline stays single-track.

---

## PR Sequence

Each PR: conventional commit prefix; `Co-authored-by: Copilot` trailer; branch off `claude/plan-observability-harnesses-4Hq1p`; draft PR.

| # | Title | Scope | Blocks |
|---|---|---|---|
| 1 | `docs: land harness ingestion matrix and multi-harness plan` | `docs/research/harness-ingestion-matrix.md` + this plan. No code. | unblocks all |
| 2 | `refactor(schema): widen EventSource and add harness identity fields` | `schema.ts` only. Widen union to `string`, add optional `harnessId` / `driverVersion` / `correlationId` on `CanonicalEvent`, `harnessId?` on `AgentNode`. Fixtures still pass. | unblocks 3+ |
| 3 | `refactor(capture): introduce HarnessDriver + Adapter/Normalizer split` | Extract Claude logic from `normalizer.ts` + `transcript-adapter.ts` into `shadow-agent/src/capture/drivers/claude-code/`. Introduce `HarnessDriverRegistry`. `session-manager.ts` calls registry. Old `normalizer.ts` becomes a `@deprecated` shim. | unblocks 4-7 |
| 4 | `refactor(capture): pluggable session discovery per driver` | Move `~/.claude/projects/` into the Claude driver. Add `DiscoveryStrategy` interface. Generic dispatcher in `session-discovery.ts`. | unblocks 6 |
| 5 | `feat(derive): capability-driven derivation` | `derive.ts` becomes capability-aware. Registry supplies extractors. Existing Claude behavior preserved as default capability set. High test density. | unblocks 6, 7 |
| 6 | `feat(capture): cursor driver via hook receiver` | Concrete second driver: Cursor, ingested via a new hook-receiver transport. Adds local HTTP/Unix-socket endpoint + a stock shell-wrapper script that any command-type hook can forward to (Cursor hooks are stdio JSON via command, per matrix). Adapter, normalizer, discovery (`.cursor/hooks.json` presence), capability flags, fixture, e2e test. | unblocks 7, 8 |
| 7 | `feat(renderer): per-harness visual accent` | Renderer reads `AgentNode.harnessId`, applies palette. Multi-session side-by-side layout. Canvas-scene fixtures updated. | unblocks 8 |
| 8 | `test: cross-harness e2e fixture + replay` | Replay with two distinct `sessionId`s + `harnessId`s. Final acceptance gate. | — |

---

## Critical Files

**Created:**

- `docs/research/harness-ingestion-matrix.md` — durable matrix
- `docs/plans/plan-multi-harness-mvp.md` — this plan
- `shadow-agent/src/capture/drivers/harness-driver.ts` — `HarnessDriver`, `HarnessCapabilities`, `HarnessDriverRegistry` types
- `shadow-agent/src/capture/drivers/index.ts` — registry seed + exports
- `shadow-agent/src/capture/drivers/claude-code/{index,adapter,normalizer,discovery,capabilities}.ts`
- `shadow-agent/src/capture/drivers/cursor/{index,adapter,normalizer,discovery,capabilities}.ts`
- `shadow-agent/src/capture/transports/hook-receiver.ts` — local HTTP/Unix-socket endpoint that Cursor command hooks forward to (also reusable by Codex, Claude HTTP hooks, Gemini)
- `shadow-agent/scripts/hooks/forward-to-shadow.{sh,ps1}` — stock wrapper installable in `.cursor/hooks.json` that pipes stdin JSON to the hook-receiver endpoint
- `shadow-agent/tests/capture/drivers/{claude-code,cursor}.test.ts`
- `shadow-agent/tests/fixtures/transcripts/cursor-*.jsonl`
- `shadow-agent/tests/fixtures/replays/cross-harness.replay.jsonl`
- `shadow-agent/tests/derive-capabilities.test.ts`

**Modified:**

- `shadow-agent/src/shared/schema.ts` — widen `EventSource`; add optional harness fields on `CanonicalEvent` + `AgentNode`
- `shadow-agent/src/shared/derive.ts` — capability-driven
- `shadow-agent/src/shared/renderer-input-adapter.ts` — propagate harness metadata
- `shadow-agent/src/shared/transcript-adapter.ts` — thin re-export of claude-code driver
- `shadow-agent/src/capture/session-manager.ts` — driver-aware orchestration
- `shadow-agent/src/capture/normalizer.ts` — `@deprecated` shim re-exporting from claude driver
- `shadow-agent/src/capture/session-discovery.ts` — dispatch to driver discovery
- `shadow-agent/src/capture/{http-stream,socket,websocket}-transport.ts` — remove hardcoded `source: 'claude-hook'`; receive source from driver context
- `shadow-agent/src/capture/transcript-watcher.ts` — remove hardcoded `source: 'claude-transcript'`
- `shadow-agent/src/renderer/*` — read `AgentNode.harnessId`, apply palette accent only
- `shadow-agent/tests/transcript-adapter.test.ts` — import from driver path
- `docs/domain-events.md` — document driver contract
- `docs/architecture.md` — updated layering diagram

**Reused (do not duplicate):**

- `shadow-agent/src/capture/capture-transport.ts` — keep contract as-is
- `shadow-agent/src/capture/incremental-parser.ts` — generic JSONL line framer; reused by JSONL-tail drivers
- `shadow-agent/src/capture/event-buffer.ts` — `EventBufferLike` (`inference-client.ts:37-50`) — already harness-agnostic; do not touch
- `shadow-agent/src/inference/shadow-inference-engine.ts` — subscribes to buffer; no changes needed

---

## Risks

- **Replay fixture compat.** Existing `tests/fixtures/replays/*.replay.jsonl` lack `harnessId`. Mitigated by optional fields + registry default → `claude-code`. Add explicit test that loads a v1 fixture in a v2 build.
- **IPC contract stability.** `ShadowAgentBridge` in `schema.ts:123-135` accepts `CanonicalEvent[]`. Adding optional fields is contract-compatible. Method signatures must NOT change in this refactor.
- **Spill-to-disk cross-version.** JSON spill format is robust to new optional fields. Capability dispatch in `derive.ts` must tolerate `harnessId === undefined`. Explicit test.
- **Hardcoded `source: 'claude-hook'` in HTTP/socket/WS transports.** Must be removed in PR 3 or non-Claude harnesses over HTTP get mis-stamped.
- **Prompt-sync workflow.** Previously [`AGENTS.md`](../../AGENTS.md) enforced sync between `prompts/shadow-system-prompt.json`, `docs/prompts/shadow-system-prompt.md`, and `shadow-agent/src/inference/prompts.ts` via `npm run prompts:check`. That pipeline was removed (May 2026) in favor of a single-file source of truth at `shadow-agent/src/inference/prompts.ts`. See `docs/tooling-philosophy.md` for the principle. This refactor does not touch prompts; harness-awareness in the system prompt is **out of scope for MVP**, flagged as a follow-up — when added, the doc comment in `prompts.ts` should grow a "Per-harness considerations" section in the same edit.
- **Inference packager assumptions.** Verify `inference/context-packager.ts` + `prompt-builder.ts` make no implicit assumptions about `source` strings before merging PR 2.
- **Branch-protected `main`.** Each PR via feature branch + draft PR.

---

## Verification

1. **No-regression baseline (after PR 2):** `npm test` green; all `tests/fixtures/replays/*.replay.jsonl` produce identical `DerivedState` snapshots before/after. Add snapshot test if missing.
2. **Driver-equivalence (after PR 3):** Claude driver via registry produces byte-identical `CanonicalEvent[]` (modulo new optional fields) vs. legacy normalizer for every fixture in `tests/fixtures/transcripts/`.
3. **Discovery injection (after PR 4):** Fake driver with in-memory discovery proves dependency injection is complete.
4. **Capability parity (after PR 5):** Claude fixtures through capability-driven derive equal PR 2 snapshots. Canvas-scene fixtures unchanged.
5. **Second-harness ingest (after PR 6):** Cursor driver consumes its fixture, produces non-empty `agentNodes`, `transcript`, `fileAttention`. Tool-name roundtrip verified.
6. **Cross-harness scene (after PR 8):** Replay-load multi-harness fixture; two clusters render with distinct palette accents; shared timeline; manual smoke + scene snapshot.
7. **Spill migration test:** v1 spill (no `harnessId`) read by v2 buffer; registry assigns default; no crash.
8. **End-to-end manual:** Run Claude Code + Cursor concurrently against the same repo; both render; no dropped events.

---

## Decisions Locked

- **Second harness:** Cursor, via a new hook-receiver transport (matrix: Cursor exposes a rich command-type hook system in `.cursor/hooks.json`; no native HTTP, so we ship a stock forwarder script). The hook-receiver transport is then reusable for Claude HTTP hooks, Codex command hooks, and Gemini hooks — paying for itself across four harnesses.
- **PTY / Aider:** out of scope for MVP. The abstraction must admit it later (do not introduce design choices that exclude a future `pty` transport); do not build it now.

## Follow-ups (out of scope for MVP)

- Promote `harnessId` to required after one release cycle + a fixture migration script.
- Make the inference system prompt harness-aware (e.g., the shadow's interpretation prompt should know whether it's reading Claude vs. Cursor events). Will need a "Per-harness considerations" section added to the doc comment in `shadow-agent/src/inference/prompts.ts`.
- OTLP receiver transport (covers VS Code Copilot + Gemini CLI; matrix's second pillar).
- PTY transport (Aider; the one harness uncovered by the JSONL/hooks/OTLP trio).

## Rejected Alternatives

Documented here so future-me (or a future contributor) doesn't re-litigate decisions
that were already considered and discarded. See `docs/tooling-philosophy.md` Principle 2.

### Why not Codex CLI as the second harness in PR 6?

Codex's ingestion path (JSONL transcript tail under `~/.codex/sessions/YYYY/MM/DD/`)
is structurally the same as the Claude Code path. Wiring Codex as the second driver
would exercise the registry but not the new layers we actually need — same transport
(file-tail), same framer (line), broadly similar normalizer shape. The abstraction
would land but remain unproven where it matters most (different transport, different
format, different session-discovery convention).

Cursor was chosen instead because it forces a genuinely new transport
(hook receiver) that pays for itself across four harnesses (Cursor, Codex command
hooks, Claude HTTP hooks, Gemini hooks). Cost: ~1.5x the PR 6 size; benefit:
the abstraction is stress-tested by a categorically different ingestion path.

### Why not Gemini CLI / OTLP receiver as the second harness?

Strongest strategic value (OTLP is the long-term unifying surface for next-gen
harnesses per `docs/research/harness-ingestion-matrix.md` Implications section).
Rejected for PR 6 because the OTLP transport + framer is materially more code
than a hook receiver: protobuf decoding, gRPC server option, span/log/metric
shape mapping. PR 6 would balloon. Deferred to a follow-up PR once the
abstraction has shaken out on a smaller surface (Cursor).

### Why not PTY / Aider in MVP scope?

PTY is the only path for Aider per the matrix, but Aider is also the most
poorly-instrumented harness on the list (no hooks, no API, no OTel, no native
MCP). PTY transport requires `node-pty` and ANSI-stream parsing, both of which
are substantial undertakings. The abstraction must *admit* a future PTY transport
(do not bake design choices that exclude it), but building it now would consume
disproportionate effort relative to the user benefit (single harness, the
lowest-fidelity ingestion path).

### Why not promote `harnessId` to required immediately in PR 2?

Optional preserves backward compatibility with the existing replay JSONL
fixtures (`tests/fixtures/replays/*.replay.jsonl`) without a migration step.
Adding an optional field is a zero-risk schema change; flipping it to required
is a separate, deliberate decision with its own migration script and PR. The
plan keeps these phased so neither change can break the other.

### Why not a generated EventSource enum auto-derived from the registry?

Tempting (eliminates a manual constant), but generated code reintroduces the
exact drift-pipeline pattern just removed for prompts (see
`docs/tooling-philosophy.md`). The widened `string` type plus a runtime
`KnownEventSources` constant is honest about what the union actually is — open,
extensible at runtime, validated where it matters (drivers register themselves).
No generator, no parity check, no third file.

### Why not a managed observability platform for shadow-agent's own inference?

Shadow-agent itself is the harness-around-other-agents product, and there's a
meta-temptation to eat the dogfood and route the shadow's own inference calls
through a real observability platform (LangFuse, Braintrust). Rejected for
MVP because there's no user complaining about shadow inference quality yet —
adding observability infrastructure before there's a signal to act on is
exactly the "ritual without consumers" anti-pattern in
`docs/tooling-philosophy.md`. Re-evaluate when the first regression complaint
or cost-attribution question lands.
