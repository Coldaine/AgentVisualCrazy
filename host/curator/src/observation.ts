/**
 * Read-only observation surface injected into curator tools (M3, M7).
 * Structurally compatible with host/ingestion ObservationQuery / StoredObservation.
 */

export interface CuratorObservationEvent {
  type: string
  time: number
  sessionId?: string
  payload: Record<string, unknown>
}

export interface CuratorObservation {
  id: string
  seq: number
  ingestedAt: number
  harnessId: string
  event: CuratorObservationEvent
}

export interface ObservationQuery {
  readonly size: number
  getById(id: string): CuratorObservation | undefined
  recent(n: number): CuratorObservation[]
  byType(type: string | string[]): CuratorObservation[]
  searchTranscript(
    query: string,
    options?: { limit?: number; caseSensitive?: boolean },
  ): CuratorObservation[]
  getAll(): CuratorObservation[]
}

/** Compact JSON-safe view for tool results (evidence citations keep `id`). */
export function summarizeObservation(obs: CuratorObservation): Record<string, unknown> {
  const p = obs.event.payload
  const previewKeys = ['content', 'tool', 'name', 'task', 'summary', 'label', 'message', 'preview']
  const preview: Record<string, unknown> = {}
  for (const key of previewKeys) {
    const v = p[key]
    if (typeof v === 'string') {
      preview[key] = v.length > 400 ? `${v.slice(0, 400)}…` : v
    }
  }
  return {
    id: obs.id,
    seq: obs.seq,
    harnessId: obs.harnessId,
    type: obs.event.type,
    time: obs.event.time,
    sessionId: obs.event.sessionId,
    preview,
  }
}
