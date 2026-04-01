# Inference Engine Implementation Plan

> Recommended order across all plans: **GUI Rendering → Event Capture → Inference Engine**
>
> The inference engine is the last to implement because it needs live event data flowing
> (from Event Capture) and a renderer to display its output (from GUI Rendering).
> Scaffolding and the prompt file can be written early, but real inference comes last.

---

## Scope

Build the shadow interpretation engine that consumes `DerivedState` from the derive layer, calls an external AI model via OpenCode SDK (or direct Anthropic API), and produces `ShadowInsight[]` events. Also expose shadow-agent as an MCP server for external consumption.

All patterns are ported from `third_party/sidecar/` as described in `docs/research/shadow-inference-architecture.md`.

---

## 1. Dependencies to Add

Install in `shadow-agent/`:

```
@opencode-ai/sdk@^1.1.36        # OpenCode server + client SDK
@anthropic-ai/sdk@latest         # Direct Anthropic API fallback
@modelcontextprotocol/sdk@^1.27.0   # MCP server for exposing shadow tools
```

---

## 2. File Map

All new files live under `shadow-agent/src/inference/` and `shadow-agent/src/mcp/`:

| File | Purpose |
|------|---------|
| `src/inference/auth.ts` | Credential loader (env → .env → OpenCode auth.json) |
| `src/inference/opencode-client.ts` | Start OpenCode server, create client, manage sessions |
| `src/inference/context-packager.ts` | Build `ShadowContextPacket` from `DerivedState` + recent events |
| `src/inference/prompt-builder.ts` | Assemble system prompt + user message from context packet |
| `src/inference/prompts.ts` | Raw prompt strings (must match `docs/prompts/shadow-system-prompt.md`) |
| `src/inference/response-parser.ts` | Parse model JSON output → `ShadowInsight[]` |
| `src/inference/trigger.ts` | Decide when to invoke inference (event count, timer, risk) |
| `src/inference/shadow-inference-engine.ts` | Orchestrator: trigger → package → prompt → call → parse → emit |
| `src/inference/direct-api.ts` | Anthropic SDK fallback when OpenCode is unavailable |
| `src/mcp/shadow-mcp-server.ts` | MCP server exposing `shadow_status`, `shadow_events`, `shadow_ask` |

---

## 3. Auth Loader

Port from sidecar's `src/utils/auth-json.js`. Priority chain:

1. `process.env.ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (already set — skip)
2. `~/.shadow-agent/.env` (load with dotenv)
3. `~/.local/share/opencode/auth.json` (parse JSON, map provider → env var)

The auth loader runs once at app startup in `electron/main.ts`, before any inference code. It sets `process.env` values so downstream code can use them transparently.

Provider-to-env mapping: `anthropic` → `ANTHROPIC_API_KEY`, `openai` → `OPENAI_API_KEY`, `openrouter` → `OPENROUTER_API_KEY`, `google` → `GOOGLE_API_KEY`, `deepseek` → `DEEPSEEK_API_KEY`.

---

## 4. OpenCode Client

Port from sidecar's `src/opencode-client.js`.

- Lazy-import `@opencode-ai/sdk` (the SDK is optional — don't crash if missing)
- `startInferenceServer({ port: 4097 })` — start OpenCode server on port 4097 (avoiding sidecar's 4096)
- `createSession(client)` — create a new session for shadow inference
- `sendPrompt(client, sessionId, system, userMessage)` — send structured prompt
- `pollForCompletion(client, sessionId)` — poll at 1s intervals until response arrives

Expose a single `InferenceClient` interface that abstracts whether we're using OpenCode or the direct API fallback.

---

## 5. Context Packager

Create `ShadowContextPacket` from the current `DerivedState` plus the raw event buffer.

The packet assembles:
- Session metadata (sessionId, observed agent type, duration)
- Current derived state (phase, risk signals, file attention, next moves)
- Recent events window (last 20–50 `CanonicalEvent` objects)
- Tool call history (tool name, args summary, success/error, timestamp)
- Recent transcript turns (last 10 actor + text entries)
- Touched files list

Total context budget: ~10,000 tokens. Each component has a max allocation (see `shadow-inference-architecture.md` §Context Budget). The packager truncates aggressively — recent events are more valuable than old ones, so truncate from the front.

---

## 6. Prompt Builder

Assemble the final prompt from `prompts.ts`:

- **System message**: The `SHADOW_SYSTEM_PROMPT` constant — defines Shadow's role, constraints, and required JSON output format.
- **User message**: Serialized `ShadowContextPacket` as structured text. Sections separated by headers. Recent events as a compact list. Transcript as actor/text pairs.

The builder should be deterministic: same `ShadowContextPacket` produces same prompt string. This makes testing straightforward.

---

## 7. The Prompt File (`prompts.ts`)

This file contains the raw prompt strings. Per AGENTS.md Rule 1, the prompt text must be character-for-character identical to the "Full Prompt" section in `docs/prompts/shadow-system-prompt.md`.

Initial prompt defines:
- Shadow's role as passive observer
- READ-ONLY constraint
- Terse, specific output requirement
- Honest confidence calibration
- JSON-only output format with fields: `phase`, `phaseConfidence`, `phaseReason`, `riskLevel`, `riskSignals[]`, `predictedNextAction`, `predictedNextConfidence`, `observations[]`, `attention`

Any change to this file requires the full prompt change workflow (edit docs first, update iteration log, then update code, verify sync).

---

## 8. Response Parser

Parse the model's JSON response into `ShadowInsight[]` matching the schema in `schema.ts`.

Mapping from model JSON to `ShadowInsight`:
- `phase` → insight with `kind: 'phase'`, `confidence: phaseConfidence`
- Each `riskSignals[i]` → insight with `kind: 'risk'`
- `predictedNextAction` → insight with `kind: 'next_move'`
- `attention.intent` → insight with `kind: 'objective'`
- Each `observations[i]` → insight with `kind: 'summary'`

The parser must handle: malformed JSON (wrap in try/catch, return empty array), missing fields (use defaults), extra fields (ignore). The model will sometimes produce markdown-wrapped JSON — strip markdown fences before parsing.

---

## 9. Inference Trigger Strategy

The trigger engine decides when to invoke a new inference call. It lives in the Electron main process and watches the event buffer.

Trigger conditions (any one fires):
- **Event count**: At least `minEventsBetween` (10) new events since last inference
- **Time elapsed**: At least `timeBetweenMs` (30 seconds) since last inference
- **Max events**: `maxEventsBetween` (50) events forces a trigger regardless of timer
- **Risk escalation**: Derived risk level rises to medium or above
- **Specific event kinds**: `tool_failed`, `agent_completed` always trigger immediately

The trigger emits a "run inference now" signal. The engine throttles: never more than one inference in flight at a time.

---

## 10. Direct Anthropic API Fallback

When the OpenCode SDK is not installed or the server fails to start, fall back to `@anthropic-ai/sdk`:

- Instantiate `new Anthropic()` — uses `ANTHROPIC_API_KEY` from env (loaded by auth.ts)
- Call `client.messages.create()` with the same system prompt and user message
- Model: `claude-sonnet-4-5`, max_tokens: 1024
- Parse response identically to the OpenCode path

The fallback is simpler (no session management, no polling) but locks to Anthropic only.

---

## 11. MCP Server

Port from sidecar's `src/mcp-server.js`. Create `src/mcp/shadow-mcp-server.ts`.

Three tools:

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `shadow_status` | Current interpretation | None | JSON: phase, risk, latest insight, file attention (top 5), predicted next action |
| `shadow_events` | Recent canonical events | `{ n: number }` (default 20) | JSON: array of `CanonicalEvent` |
| `shadow_ask` | Ask a focused question | `{ question: string }` | Triggers a fresh inference with the question as additional context, returns text |

All tools are annotated `readOnlyHint: true`. Transport: stdio (McpServer + StdioServerTransport).

The MCP server starts as a child process from `electron/main.ts` or as a standalone CLI command (`shadow-agent mcp`).

---

## 12. Wiring to Electron Main

The inference engine integrates into `electron/main.ts`:

1. On app ready: call `loadCredentials()` from auth.ts
2. On session start: attempt `startInferenceServer()` — if it fails, enable direct API fallback
3. The trigger engine subscribes to the event buffer (shared with event capture)
4. When trigger fires: call `runShadowInference()` → receive `ShadowInsight[]`
5. Merge insights into `DerivedState` and push updated snapshot to renderer via IPC
6. Optionally start MCP server as a background process

---

## 13. Implementation Order (Within This Group)

1. Auth loader (`auth.ts`) — can be tested standalone
2. Prompt file (`prompts.ts`) + prompt documentation sync
3. Context packager (`context-packager.ts`) — testable with fixture `DerivedState`
4. Prompt builder (`prompt-builder.ts`) — testable with fixture packets
5. Response parser (`response-parser.ts`) — testable with sample JSON
6. Direct API fallback (`direct-api.ts`) — simplest end-to-end path
7. OpenCode client (`opencode-client.ts`) — requires OpenCode installed
8. Inference trigger (`trigger.ts`)
9. Shadow inference engine orchestrator (`shadow-inference-engine.ts`)
10. MCP server (`shadow-mcp-server.ts`)
11. Wire everything into `electron/main.ts`

Steps 1–5 produce testable units with no external dependencies. Step 6 is the first live integration point. Steps 7–11 build on top.

---

## Cross-Group Dependencies

- **From Event Capture plan**: The inference engine consumes events from the event buffer populated by the transcript watcher. Until Event Capture is implemented, inference can only run against fixture data or manually loaded replays. The trigger engine specifically needs the live event stream to fire automatically.
- **From GUI Rendering plan**: Inference output (`ShadowInsight[]`) is rendered by the shadow interpretation overlay, risk heatmap, and prediction trails. These renderer components must exist (even in placeholder form) for inference output to be visible. The schema types are already shared — no code dependency, just a rendering surface.
- **Prompt documentation**: Before writing `prompts.ts`, the documented prompt at `docs/prompts/shadow-system-prompt.md` must be finalized (or at least have a working draft). Per AGENTS.md Rule 1, documentation comes first.
