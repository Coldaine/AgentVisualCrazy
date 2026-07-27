/**
 * Read-only curator MCP tool handlers (names: curator_*, never shadow_*).
 */
import type { ObservationQuery, StoredObservation } from '@agentvisualcrazy/ingestion'
import type { CuratorFacade } from './curator-bridge.ts'

const DEFAULT_EVENTS_N = 20
const MAX_EVENTS_N = 200

export function clampEventsN(n: unknown): number {
  const raw = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(raw)) return DEFAULT_EVENTS_N
  return Math.max(1, Math.min(MAX_EVENTS_N, Math.floor(raw)))
}

function serializeObservation(obs: StoredObservation) {
  return {
    id: obs.id,
    seq: obs.seq,
    ingestedAt: obs.ingestedAt,
    harnessId: obs.harnessId,
    type: obs.event.type,
    time: obs.event.time,
    sessionId: obs.event.sessionId,
    payload: obs.event.payload,
  }
}

export async function handleCuratorStatus(
  store: ObservationQuery,
  curator: CuratorFacade,
): Promise<unknown> {
  return curator.getStatus(store)
}

export async function handleCuratorEvents(
  store: ObservationQuery,
  n: unknown,
): Promise<{ n: number; count: number; events: ReturnType<typeof serializeObservation>[] }> {
  const limit = clampEventsN(n)
  const events = store.recent(limit).map(serializeObservation)
  return { n: limit, count: events.length, events }
}

export async function handleCuratorAsk(
  store: ObservationQuery,
  curator: CuratorFacade,
  question: unknown,
): Promise<unknown> {
  const q = typeof question === 'string' ? question : String(question ?? '')
  return curator.ask(q, store)
}

export function textResult(payload: unknown): {
  content: Array<{ type: 'text'; text: string }>
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  }
}
