# Domain: Inference Engine

> **Status: Landed on main** — Auth loader, context packager, prompt builder, response
> parser, inference trigger, orchestrator, OpenCode client (`opencode-client.ts`),
> provider selection (`inference-client-factory.ts`), direct Anthropic fallback, and
> MCP server are on main. Runtime order: OpenCode when the SDK starts, otherwise
> direct Anthropic (`SHADOW_INFERENCE_PROVIDER` can force either path).

The inference engine is shadow-agent's brain — it consumes the observed agent's event
stream and produces structured interpretations (phase, risk, predictions, confidence).

Full research spec: `docs/research/shadow-inference-architecture.md`
Sidecar source patterns: `docs/research/visual-patterns-sidecar.md`
Implementation plan: `docs/plans/plan-inference-engine.md`
Prompt source: `shadow-agent/src/inference/prompts.ts` (single source of truth — rationale + runtime template literal in one file)

## OpenCode Harness

The primary harness is `@opencode-ai/sdk` via `src/inference/opencode-client.ts`, which
starts a local OpenCode server on port 4097, creates a session, sends structured prompts,
and polls for completion. `createInferenceClient()` in `inference-client-factory.ts` tries
OpenCode first unless `SHADOW_INFERENCE_PROVIDER=anthropic` or `direct` is set.

When the SDK is unavailable or the server fails to start, we fall back to
`@anthropic-ai/sdk` through `src/inference/direct-api.ts` (Anthropic-only, no session
management).

Inference delivery is local-only by default. Before any prompt is sent off-host, the user
must explicitly opt in. Sanitized transcript content is the default payload, and raw
transcript delivery requires a separate explicit opt-in. The Electron shell persists those
privacy toggles in `~/.shadow-agent/privacy.json`; environment variables still override the
saved file when present.

## Auth Chain

Credentials load in priority order:

1. `process.env` (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.) — always wins
2. `~/.shadow-agent/credentials.enc.json` — encrypted local store using Electron `safeStorage`
3. `~/.shadow-agent/.env` — legacy plaintext fallback, only when `SHADOW_ALLOW_FILE_CREDENTIAL_FALLBACK=1`
4. `~/.local/share/opencode/auth.json` — legacy OpenCode fallback, only when `SHADOW_ALLOW_FILE_CREDENTIAL_FALLBACK=1`

Pattern lifted from sidecar's auth inheritance and adapted for secure local storage.
If the user already has OpenCode configured, shadow-agent can still inherit those secrets,
but only after the user explicitly consents to the file-based fallback path. When that
happens, supported provider keys are migrated into `credentials.enc.json` for subsequent runs.
Providers supported: anthropic, openai, openrouter, google, deepseek.

### Secure File Permissions

- POSIX: `~/.shadow-agent/` should be `0700`
- POSIX: `~/.shadow-agent/credentials.enc.json` should be `0600`
- POSIX: if a temporary legacy `.env` is used for migration, keep it at `0600` and remove it after verification
- Windows: keep secrets under the user's profile so inherited ACLs remain per-user; avoid shared directories

Concrete checks:

```bash
stat -c '%a %n' ~/.shadow-agent ~/.shadow-agent/credentials.enc.json
chmod 700 ~/.shadow-agent
chmod 600 ~/.shadow-agent/credentials.enc.json
```

```powershell
$storeDir = Join-Path $HOME '.shadow-agent'
$storeFile = Join-Path $storeDir 'credentials.enc.json'
$userSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
icacls $storeDir
icacls $storeFile
icacls $storeDir /inheritance:r
icacls $storeDir /grant:r "*${userSid}:(OI)(CI)(F)" "*S-1-5-18:(OI)(CI)(F)" "*S-1-5-32-544:(OI)(CI)(F)"
icacls $storeFile /inheritance:r
icacls $storeFile /grant:r "*${userSid}:F" "*S-1-5-18:F" "*S-1-5-32-544:F"
```

Do not run with `SHADOW_ALLOW_FILE_CREDENTIAL_FALLBACK=1` as a steady-state setting.
Use it for an intentional migration run only, then unset it and remove the temporary
plaintext file after confirming the encrypted store loads.

## Prompt Strategy

The system prompt defines Shadow as a passive observer that produces structured JSON:
phase classification, risk signals with severity and confidence, predicted next action,
factual observations, and file attention. Key constraints: read-only, terse, specific,
honest confidence scores (not everything warrants 0.9+), JSON-only output.

The prompt lives in `shadow-agent/src/inference/prompts.ts` as a single source
of truth: the runtime template literal `SHADOW_SYSTEM_PROMPT` and the rationale
doc comment (philosophy, per-section justification, evaluation plan, iteration
log, "why one file") are co-located. No generation step. See
`.claude/rules/prompts.md` for editing rules and `docs/tooling-philosophy.md`
for the meta-rationale.

## Context Budget

Shadow-agent calls the model frequently, so we keep context tight (~10,500 tokens total):

| Component | Max tokens |
|-----------|-----------|
| System prompt | 500 |
| Session metadata | 200 |
| Recent events (last 20) | 2,000 |
| Tool call history | 3,000 |
| Recent transcript (last 10 turns) | 4,000 |
| File attention + risk signals | 800 |

Recent events are more valuable than old ones — truncate from the front.

## Trigger Logic

We don't call the model on every event. The trigger engine fires on:
- Event count threshold (10 minimum, 50 maximum between calls)
- Time elapsed (30 seconds since last inference)
- Risk escalation (derived risk rises to medium+)
- Specific events (`tool_failed`, `agent_completed` trigger immediately)

Never more than one inference in flight at a time.

## MCP Server

Shadow-agent exposes itself as an MCP server (stdio transport via
`@modelcontextprotocol/sdk`) so other agents can query its interpretations:

- `shadow_status` — current phase, risk level, latest insight, top 5 file attention,
  predicted next action
- `shadow_events` — last N canonical events (default 20)
- `shadow_ask` — ask a focused question, triggers fresh inference with the question
  as additional context

All tools are `readOnlyHint: true`. Pattern from sidecar's `mcp-server.js`.

## Key Dependencies

```
@anthropic-ai/sdk (installed runtime dependency)
@modelcontextprotocol/sdk (optional runtime dependency, loaded dynamically)
@opencode-ai/sdk (planned dependency; not yet installed)
```

## File Map

```
src/inference/
  auth.ts                — Credential loader (implemented)
  opencode-client.ts     — OpenCode server + client (not yet implemented)
  context-packager.ts    — Build ShadowContextPacket from DerivedState (implemented)
  prompt-builder.ts      — ShadowContextPacket type, buildUserMessage, buildInferenceRequest (implemented)
  prompts.ts             — System prompt (single source of truth: template literal + rationale doc comment) (implemented)
  response-parser.ts     — JSON → ShadowInsight[] (implemented)
  trigger.ts             — When to invoke inference (implemented)
  shadow-inference-engine.ts  — Orchestrator (implemented)
  direct-api.ts          — Anthropic SDK fallback (implemented)
src/mcp/
  shadow-mcp-server.ts   — MCP server exposing shadow tools (implemented)
```
