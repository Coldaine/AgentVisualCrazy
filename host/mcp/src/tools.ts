/**
 * Read-only curator MCP tool handlers (names: curator_*, never shadow_*).
 */
import type { ObservationQuery, StoredObservation } from '@agentvisualcrazy/ingestion'
import type { CuratorFacade } from './curator-bridge.ts'

const DEFAULT_EVENTS_N = 20
const MAX_EVENTS_N = 200
const MAX_PAYLOAD_CHARS = 4096

const SENSITIVE_KEY_RE = /(token|secret|password|api[_-]?key|authorization|bearer|private[_-]?key|client[_-]?secret)/i

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated:depth]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return value.length > MAX_PAYLOAD_CHARS
      ? `${value.slice(0, MAX_PAYLOAD_CHARS)}…[truncated:${value.length} chars]`
      : value
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, depth + 1))
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = '[redacted]'
      } else {
        out[k] = redactValue(v, depth + 1)
      }
    }
    return out
  }
  return String(value)
}

export function redactPayload(payload: unknown): unknown {
  return redactValue(payload)
}

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
    payload: redactPayload(obs.event.payload),
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
