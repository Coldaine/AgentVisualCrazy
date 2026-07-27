# `@agentvisualcrazy/mcp`

Read-only **stdio MCP server** exposing curator tools for other agents
([req-v1-curator](../../docs/plans/req-v1-curator.md) §4.10).

| Tool | Role |
|------|------|
| `curator_status` | Gallery / latest summary / phase-like status from ObservationStore (+ curator when wired) |
| `curator_events` | Recent store events (`n`, default 20, max 200) |
| `curator_ask` | Focused question — Mastra investigation when `host/curator` exists; otherwise a clear stub |

Tool names are **`curator_*` only** (never `shadow_*`). Observation-only — no Write/Edit/Bash.

## Run (from repo root)

```bash
npm run mcp
```

Optional JSONL bootstrap (standalone process):

```bash
# PowerShell
$env:AVC_OBSERVATION_JSONL = "host/ingestion/fixtures/simulate-events.jsonl"
npm run mcp

# Live tail after replay
$env:AVC_OBSERVATION_WATCH = "1"
npm run mcp
```

| Env | Meaning |
|-----|---------|
| `AVC_OBSERVATION_JSONL` | Path to agent-flow `AgentEvent` JSONL |
| `AVC_OBSERVATION_WATCH` | `1`/`true` → tail after load (default: one-shot replay) |
| `AVC_HARNESS_ID` | Label stored on ingested events (default `jsonl`) |

stdout is MCP JSON-RPC — do not `console.log` from this process.

## Curator binding

If `host/curator` exports `createCuratorFacade`, the server loads it automatically.
Until then, `curator_ask` / gallery fields report **curator not configured**.

## Tests

```bash
cd host/mcp
npm install
npm test
```

Root: `npm run test:mcp`
