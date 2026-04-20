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
and tradeoffs. React 19 + Tailwind handle the glass panel overlays. The rendering
layer is Electron-native but portable enough to embed in VS Code later.

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
already has OpenCode configured, shadow-agent inherits credentials automatically with zero
additional auth setup.

When OpenCode isn't available, we fall back to the Anthropic SDK directly. The auth chain
loads credentials in priority order: `process.env` → `~/.shadow-agent/.env` →
`~/.local/share/opencode/auth.json`.

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

We watch Claude Code's JSONL transcript files via a filesystem watcher. This is the
simplest reliable approach — Claude Code writes JSONL, we tail it. No need to configure
hooks on the observed agent's side. Events are parsed incrementally, normalized into
`CanonicalEvent` objects, and streamed to the renderer via Electron IPC through an
in-memory ring buffer.

An HTTP hook server may come later (Phase 3+) for lower latency, but the architecture
is transport-agnostic — the buffer and IPC bridge don't care where events come from.

We rejected HTTP hook server for Phase 2 (more complex, requires observed agent
configuration) and direct process attachment (fragile, platform-specific).

→ See [`docs/domain-events.md`](domain-events.md) for the event domain: transcript
watcher, canonical schema, normalizer, session discovery, IPC bridge.

## Desktop Shell

Standalone Electron app with React 19 renderer, bundled by Vite. Already implemented in
the Phase 1 prototype. Electron gives us native file access, tray integration, and
system-level observation. We build the standalone app first; VS Code webview embedding
is future work.

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

We are currently in **Phase 2 (In Progress)**. Inference scaffolding has landed on
main (auth, context packager, prompt builder, response parser, trigger, orchestrator,
direct-API fallback, MCP server). The Canvas2D renderer (PR #26) and live capture
pipeline (PR #27) are still on feature branches and are the next product features to
ship. This is not a release candidate — Phase 2 closes when those two PRs land and
inference is wired to live events.

### Phase 1: Core Foundation (Completed)
- Canonical event schema and derivation logic.
- File-based persistence and session replay.
- Initial Electron shell and React renderer.
- Base fixture corpus for testing.
- Logger, privacy sanitization, and observability seams.
- Merged via: #29 (Fixtures), #30 (Observability), #31 (Renderer Tests).

### Phase 2: Live Interaction (In Progress)
- **Inference Engine**: Auth loader, context packager, prompt builder (with
  `ShadowContextPacket` type and `buildUserMessage`), response parser, trigger logic,
  shadow inference engine orchestrator, direct Anthropic API fallback, and MCP server.
  Landed on main via PR #28 and #32. OpenCode client not yet implemented.
- **Live Event Capture**: `fs.watch` based transcript tailing (PR #27 — not yet merged).
- **Advanced Rendering**: Porting Canvas2D + D3-Force from `agent-flow` (PR #26 — not yet merged).
- **Integration**: Full end-to-end flow from agent activity to holographic insight.

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
