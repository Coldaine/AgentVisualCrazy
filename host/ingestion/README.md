# `@agentvisualcrazy/ingestion`

M2 scaffold: **ObservationStore** + pluggable **HarnessDriver** adapters that wrap
agent-flow's `extension/src` parsers (not a rewrite).

## Layout

| Path | Role |
|------|------|
| `src/observation-store.ts` | In-memory ring buffer; read-only query surface for the future Mastra curator |
| `src/harness-driver.ts` | `HarnessDriver` interface + registry |
| `src/drivers/claude-code.ts` | Claude Code driver (AgentEvent JSONL + TranscriptParser wrap) |
| `src/drivers/codex.ts` | Stub Codex driver via `CodexRolloutParser` |
| `src/ingestion-adapter.ts` | Driver → store → injectable IPC emitter |
| `src/jsonl-tail.ts` | vscode-free JSONL tail (pattern from `extension/src/event-source.ts`) |

## Coordination with Electron / root package

This folder keeps its **own** `package.json` (vitest + typescript) so ingestion
deps stay isolated from the Electron shell. Root scripts:

- `npm run test:ingestion` → runs vitest here
- `npm test` → currently aliases to `test:ingestion` (expand when other suites land)

## Query surface (curator lookback)

```ts
const store = adapter.store // ObservationQuery (read-only)

store.recent(50)
store.byType('tool_call_end')
store.byTimeRange(0, 12.5)          // agent-flow event.time (seconds)
store.searchTranscript('migration') // message / tool args / results
store.getById('obs-1')
```

## Run tests

```bash
cd host/ingestion
npm install
npm test
```
