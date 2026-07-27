/**
 * Standalone ObservationStore bootstrap for the MCP process.
 *
 * Env:
 *   AVC_OBSERVATION_JSONL  — path to agent-flow AgentEvent JSONL (optional)
 *   AVC_OBSERVATION_WATCH  — "1"/"true" to tail after replay (default: replay once)
 *   AVC_HARNESS_ID         — harness label on ingested events (default: "jsonl")
 */
import {
  ObservationStore,
  JsonlTailSource,
  parseAgentEventLine,
  type ObservationStoreOptions,
} from '@agentvisualcrazy/ingestion'

export const OBSERVATION_JSONL_ENV = 'AVC_OBSERVATION_JSONL'
export const OBSERVATION_WATCH_ENV = 'AVC_OBSERVATION_WATCH'
export const HARNESS_ID_ENV = 'AVC_HARNESS_ID'

export interface BootstrappedStore {
  store: ObservationStore
  jsonlPath: string | null
  watching: boolean
  /** Dispose JSONL watcher if any. */
  dispose: () => void
}

function envTruthy(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

export function bootstrapObservationStore(
  storeOptions: ObservationStoreOptions = {},
): BootstrappedStore {
  const store = new ObservationStore(storeOptions)
  const jsonlPath = process.env[OBSERVATION_JSONL_ENV]?.trim() || null
  const harnessId = process.env[HARNESS_ID_ENV]?.trim() || 'jsonl'
  const watching = Boolean(jsonlPath) && envTruthy(OBSERVATION_WATCH_ENV)

  if (!jsonlPath) {
    return {
      store,
      jsonlPath: null,
      watching: false,
      dispose: () => undefined,
    }
  }

  const source = new JsonlTailSource(jsonlPath, parseAgentEventLine)
  source.subscribe((event) => {
    store.append(event, harnessId)
  })

  if (watching) {
    source.start()
  } else {
    source.replayOnce()
  }

  return {
    store,
    jsonlPath,
    watching,
    dispose: () => source.dispose(),
  }
}
