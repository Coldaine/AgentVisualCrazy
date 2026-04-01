# Architecture Decisions

> High-level technical decisions for shadow-agent.
> Each entry records what was decided, why, and what alternatives were rejected.
> Domain-specific detail lives in the referenced documents.

## Domain References

For deep-dive specifications, see:

- @docs/north-star.md — Project purpose, pillars, success criteria
- @docs/research/visual-design-strategy.md — Full visual rendering spec
- @docs/research/shadow-inference-architecture.md — Inference engine, OpenCode integration, MCP server
- @docs/research/visual-patterns-agent-flow.md — Agent-flow rendering patterns (primary visual source)
- @docs/research/visual-patterns-sidecar.md — Sidecar runtime patterns (primary runtime source)
- @docs/research/visual-inspiration-catalog.md — Portfolio + open-source visual patterns catalog
- @docs/shadow-agent-project-plan.md — Original 5-phase development plan
- @docs/prompts/shadow-system-prompt.md — Shadow inference prompt with inline commentary

---

## ADR-1: Rendering Stack — Canvas2D + D3-Force

**Decision:** Port agent-flow's Canvas2D rendering with D3-Force physics simulation. Replace the current SVG graph.

**Why:**
- Canvas2D handles 100+ animated nodes with particles at 60fps
- Full pixel control for glow effects, bloom post-processing, particle trails, tapered edges
- D3-Force gives organic self-organizing layout without manual positioning
- Agent-flow already demonstrates this exact stack working for agent visualization

**Rejected:**
- React Flow: Higher-level but less visual control, no native particle/bloom support
- Three.js only: Overkill for 2D graph visualization, higher complexity
- Keep SVG: Cannot achieve target visual quality (particles, bloom, glow effects)

**Dependencies:** `d3-force@^3.0.0`

---

## ADR-2: Inference Engine — OpenCode Harness + Direct API Fallback

**Decision:** Use OpenCode's SDK (`@opencode-ai/sdk`) as primary inference harness. Fall back to direct Anthropic SDK when OpenCode is unavailable.

**Why:**
- Sidecar (`third_party/sidecar/`) already solved this — `opencode-client.js` is the complete pattern
- Provider abstraction for free: user authenticates once (Anthropic, OpenAI, Gemini, OpenRouter)
- If user already has OpenCode configured, shadow-agent requires zero additional auth setup
- Session management, model routing, and structured output all handled by OpenCode

**Rejected:**
- Codex MCP server only: Locks to OpenAI, requires Codex CLI installed separately
- Direct API only: Forces user to manage API keys and pick specific model
- No inference (heuristics only): Cannot produce calibrated confidence scores or real interpretation

**Dependencies:** `@opencode-ai/sdk@^1.1.36`, `@anthropic-ai/sdk` (fallback)

**Detail:** @docs/research/shadow-inference-architecture.md

---

## ADR-3: MCP Server — Shadow Exposes Itself

**Decision:** Shadow-agent runs an MCP server (stdio transport) so other agents can query its interpretations.

**Why:**
- The observed agent (or any other agent) can call `shadow_status`, `shadow_events`, `shadow_ask`
- Sidecar's `mcp-server.js` + `mcp-tools.js` are direct templates
- Enables composability: shadow-agent becomes a tool in larger agent systems

**Tools exposed:**
- `shadow_status` — Current interpretation (phase, risk, predictions)
- `shadow_events` — Last N canonical events
- `shadow_ask` — Ask shadow a specific question (triggers focused inference)

**Dependencies:** `@modelcontextprotocol/sdk@^1.27.0`

---

## ADR-4: Event Capture — Transcript Watcher (Phase 2)

**Decision:** Watch Claude Code's JSONL transcript files via filesystem watcher. No HTTP hook server in Phase 2.

**Why:**
- Simplest reliable approach — Claude Code writes JSONL, we tail it
- No need to configure hooks on the observed agent's side
- Agent-flow uses both hooks and session watcher; we start with watcher only

**Rejected (for now):**
- HTTP hook server: More complex, requires observed agent configuration
- Direct process attachment: Fragile, platform-specific

**Future:** Hook server may be added in Phase 3+ for lower latency

---

## ADR-5: Desktop Shell — Electron + React 19 + Vite

**Decision:** Standalone Electron app with React 19 renderer, bundled by Vite.

**Why:**
- Already implemented in Phase 1 prototype
- Electron gives native file access, tray integration, system-level observation
- Vite is fast, React 19 is current

**Rejected:**
- VS Code webview first: Limits product identity, harder to develop and debug
- Web-only: Can't do filesystem watching or tray integration

**Future:** The rendering layer is portable enough to embed in VS Code later.

---

## ADR-6: Read-Only Constraint (v1)

**Decision:** Shadow-agent never writes files or issues tools on behalf of the observed agent in v1.

**Why:**
- Simpler, safer, easier to trust
- Keeps the product boundary clear: shadow watches, it doesn't act
- Phase 5 may relax this for suggestions/interventions, but that's explicitly future work

---

## ADR-7: Prompt Engineering — Separate File, Documented Inline

**Decision:** The shadow inference system prompt lives in a standalone file (`docs/prompts/shadow-system-prompt.md`) with inline commentary. The runtime loads from a code-side `.ts` file that mirrors the documented prompt exactly.

**Why:**
- Prompts are a critical artifact that must be reviewed, iterated, and understood independently
- Inline commentary explains *why* each section exists, not just what it says
- The documented version and the code version must be kept in sync (enforced by AGENTS.md rules)

**Locations:**
- Documentation: `docs/prompts/shadow-system-prompt.md` (canonical, with commentary)
- Code: `shadow-agent/src/inference/prompts.ts` (runtime, loads the prompt)
- Rules: `AGENTS.md` (enforcement requirements for prompt changes)

---

## ADR-8: Auth Chain — env > .env > OpenCode auth.json

**Decision:** Credentials load in priority order: `process.env` → `~/.shadow-agent/.env` → `~/.local/share/opencode/auth.json`.

**Why:**
- Copied from sidecar's `auth-json.js` pattern
- If the user already has OpenCode configured, shadow-agent inherits credentials automatically
- Explicit env vars always win for CI/automation

**Providers supported:** `anthropic`, `openai`, `openrouter`, `google`, `deepseek`

---

## ADR-9: Documentation Structure

**Decision:** Documentation is organized as follows:

```
docs/
  north-star.md          — What we're building and why (the north star)
  architecture.md        — This file: high-level decisions, references domain docs
  todo.md                — Pending tasks (thin wrapper for GitHub issues)
  history/               — Append-only log of completed work per PR
  prompts/               — Agent prompts with inline commentary
    shadow-system-prompt.md
  research/              — Visual research, inference research, implementation plans
    visual-design-strategy.md
    visual-patterns-agent-flow.md
    visual-patterns-sidecar.md
    visual-inspiration-catalog.md
    shadow-inference-architecture.md
  shadow-agent-project-plan.md   — Original 5-phase plan (historical)
  shadow-agent-visualizer.md     — Original product concept (historical)
  shadow-agent-test-plan.md      — Test roadmap
```

Root governance files:
```
AGENTS.md              — Agent workflow rules (prompt change process, etc.)
CLAUDE.md              — Thin router: project purpose → read AGENTS.md + north-star.md
.github/rules.md       — VS Code / Copilot rules (shared frontmatter with CLAUDE.md)
```
