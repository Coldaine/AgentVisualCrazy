# Architecture

How shadow-agent is built and why. Read `docs/north-star.md` first for what the project is.
This file covers the major technical decisions. Domain-specific detail lives in the
referenced docs — this is the map, not the territory.

## Rendering Stack

We use **Canvas2D with D3-Force physics** for the main visualization, ported from
agent-flow (`third_party/agent-flow/`). Canvas2D gives us full pixel control for glow
effects, bloom post-processing, particle trails, and tapered bezier edges — none of which
are practical in SVG or React Flow. D3-Force handles organic, self-organizing graph layout
so we don't manually position nodes. Agent-flow already proved this exact stack works
beautifully for agent visualization at 60fps with 100+ animated nodes.

An atmospheric background layer sits behind the canvas for depth. The preferred
implementation is a Citadel-style canvas dot-grid with a pulse API (spring-damped,
cheap, no extra runtime dependency beyond Canvas2D). A Three.js particle field
(`@react-three/fiber`) is an optional alternative when deeper parallax is wanted;
see the **Optional Background Atmosphere Layer (Choose One)** step in
[`docs/plans/plan-gui-rendering.md`](plans/plan-gui-rendering.md) for the decision
and tradeoffs. React 19 + Tailwind handle the glass panel overlays. The renderer now
ships as a shared web surface that Electron hosts today and other shells can embed later.

We rejected React Flow (less visual control), Three.js-only (overkill for 2D), and
keeping SVG (can't achieve the target visual quality).

→ See [`docs/domain-gui.md`](domain-gui.md) for the full rendering domain: color
palette, node types, panel layout, animation standards, what we port from agent-flow.

## How the Shadow Model Works

Shadow-agent runs its own AI model alongside the observed agent. We use **OpenCode's SDK**
(`@opencode-ai/sdk`) as the primary inference harness because sidecar
(`third_party/sidecar/`) already solved this exact problem — its `opencode-client.js` is
the complete pattern. OpenCode gives us provider abstraction for free: the user can use
Claude, GPT-4, Gemini, or any OpenRouter model without shadow-agent caring. If the user
already has OpenCode configured, shadow-agent can reuse those provider keys through the
legacy auth files, but only after the user explicitly opts into that file-based fallback
path for migration.

When OpenCode isn't available, we fall back to the Anthropic SDK directly. The auth chain
loads credentials in priority order: `process.env` →
`~/.shadow-agent/credentials.enc.json` (Electron `safeStorage` encrypted local store) →
legacy file-based fallbacks when `SHADOW_ALLOW_FILE_CREDENTIAL_FALLBACK=1` is explicitly set.
Those legacy fallbacks are `~/.shadow-agent/.env` and `~/.local/share/opencode/auth.json`.
When consented legacy credentials are loaded, shadow-agent migrates supported provider keys
into the encrypted store for future runs, so continued plaintext reads are not the steady
state.

On POSIX systems, `~/.shadow-agent/` should be owner-only (`0700`) and
`credentials.enc.json` should be read/write for the owner only (`0600`). On Windows,
keep the store inside the user's profile so it inherits per-user ACL protection; do not
copy it into shared folders.

Inference and transcript handling are local-only by default. Transcript text is sanitized
before it is rendered, exported, persisted, or prepared for prompt delivery. Off-host
inference requires explicit runtime opt-in, and raw transcript storage/export requires its
own explicit opt-in.

We rejected Codex MCP server only (locks to OpenAI), direct API only (forces manual key
management), and heuristics-only (can't produce calibrated confidence scores).

→ See [`docs/domain-inference.md`](domain-inference.md) for the inference domain:
OpenCode integration, auth chain, prompt strategy, trigger logic, MCP server, context
budget.

## Event Capture

Event capture is now transport-pluggable. The default path still watches Claude Code JSONL
files via a filesystem tailer, but the runtime can also ingest streaming HTTP, WebSocket,
and raw socket feeds through the same parser → normalizer → queue → IPC pipeline.

The file-tail path remains the simplest zero-config option for Claude transcripts, and it
now adds checksum-based rotation detection so replaced transcript files replay cleanly even
when the filename stays the same. Network transports trade that convenience for lower-latency
or externally pushed event delivery without changing the downstream consumers.

We rejected direct process attachment (fragile, platform-specific). All supported transports
feed the same bounded event queue with a hot in-memory window, spill-to-disk persistence,
and per-consumer checkpoints.

→ See [`docs/domain-events.md`](domain-events.md) for the event domain: transcript
watcher, canonical schema, normalizer, session discovery, IPC bridge.

## Desktop Shell

Electron is the first host shell, bundled by Vite, because it gives us native file access,
tray integration, and system-level observation. The renderer itself is now host-agnostic:
Electron mounts it today, `build:web` emits a reusable bundle, and custom-element/webview
embedding stays open for future phases.

## Shadow Exposes Itself (MCP Server)

Shadow-agent runs an MCP server (stdio transport) so other agents can query its
interpretations. Three tools: `shadow_status` (current phase/risk/predictions),
`shadow_events` (last N canonical events), and `shadow_ask` (trigger focused inference
with a question). This makes shadow-agent composable — it becomes a tool in larger agent
systems. Pattern lifted from sidecar's `mcp-server.js`.

→ See [`docs/domain-inference.md`](domain-inference.md) — **MCP Server** section — for
tool signatures and implementation.

## Prompt Engineering

The shadow inference system prompt lives in `prompts/shadow-system-prompt.json` with the
canonical prompt text, commentary, and iteration log. The generated documentation lives
in `docs/prompts/shadow-system-prompt.md`, and the generated runtime mirror lives in
`shadow-agent/src/inference/prompts.ts`. See AGENTS.md for the mandatory prompt
generate/check workflow.

## Testing & Observability

Testing and logging are first-class cross-cutting concerns, not cleanup work for later.
Pure logic should be covered with deterministic Vitest tests. Capture, Electron, and
inference boundaries should have focused integration and contract tests with fake clients,
temp files, and mocked IPC. The Canvas2D renderer should use a hybrid strategy: command-
record tests for drawing semantics plus a small curated set of visual regression scenes.

## Current Status & Roadmap

We are currently in **Phase 2 (Substantially Complete)**. The core feature lines are on
main: Canvas2D + D3-Force rendering (PR #26), live transcript capture (PR #27),
inference scaffolding plus MCP exposure (PR #28), and observability hardening (PR #30).
Phase 2 closes when the live capture → inference → renderer loop is polished and the
remaining optional harness work is either implemented or explicitly deferred.

### Phase 1: Core Foundation (Completed)
- Canonical event schema and derivation logic.
- File-based persistence and session replay.
- Initial Electron shell and React renderer.
- Base fixture corpus for testing.
- Logger, privacy sanitization, and observability seams.
- Merged via: #29 (Fixtures), #30 (Observability), #31 (Renderer Tests).

### Phase 2: Live Interaction (Substantially Complete)
- **Inference Engine**: Auth loader, context packager, prompt builder (with
  `ShadowContextPacket` type and `buildUserMessage`), response parser, trigger logic,
  shadow inference engine orchestrator, direct Anthropic API fallback, and MCP server.
  Landed on main via PR #28, #32, and follow-up hardening work on 2026-04-20. OpenCode
  client remains the main deferred item.
- **Live Event Capture**: `fs.watch` transcript tailing, bounded event queue, IPC bridge,
  and session manager landed on main via PR #27.
- **Advanced Rendering**: Canvas2D + D3-Force renderer, overlay panels, and host abstraction
  landed on main via PR #26 and follow-up renderer hardening.
- **Integration**: End-to-end local flow now exists on main; remaining work is fit-and-finish,
  embed surfaces, and deeper inference-provider support.

### Phase 3+: Advanced Features (Planned)
- **OpenCode Integration**: Deep bidirectional communication.
- **VS Code Extension**: Embedding the visualizer as a webview.
- **Live Hooks**: Moving beyond `fs.watch` to direct agent instrumentation.
- **Multi-Agent Views**: Visualizing orchestration between multiple agents.

Runtime diagnostics should use structured local logging with redaction by default. We need
enough signal to explain watcher failures, parser skips, inference triggers, IPC issues,
and performance problems without flooding logs or dumping full transcript content.

→ See [`docs/plans/plan-testing-observability.md`](plans/plan-testing-observability.md)
for the current testing layers, seam refactors, logging requirements, and pre-merge
quality gates.

## The Read-Only Constraint

Shadow-agent never writes files or calls tools on behalf of the observed agent. This is a
hard constraint for v1. It keeps the product boundary clear and makes shadow-agent safe to
trust. Phase 5 may relax this for suggestions, but that's explicitly future work.

## Documentation Layout

```
docs/
  north-star.md              — What and why
  architecture.md            — This file
  domain-gui.md              — Rendering domain decisions
  domain-inference.md         — Inference domain decisions
  domain-events.md           — Event capture domain decisions
  plans/                     — Implementation plans (GUI, events, inference, testing/observability)
  prompts/                   — Generated prompt docs
  research/                  — Visual research, patterns, inspiration
  todo.md                    — Pending tasks
  history/                   — Completed work log (append-only)
prompts/
  *.json                     — Prompt source-of-truth definitions
```
