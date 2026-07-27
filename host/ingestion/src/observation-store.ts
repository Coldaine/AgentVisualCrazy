import type { AgentEvent, AgentEventType } from './protocol.ts'

const DEFAULT_CAPACITY = 5_000

export interface StoredObservation {
  /** Stable id for curator evidence citations (M6). */
  id: string
  /** Monotonic sequence within this store instance. */
  seq: number
  /** Wall-clock ingest time (ms since epoch). */
  ingestedAt: number
  /** Which HarnessDriver produced this event. */
  harnessId: string
  /** agent-flow protocol event (time is session-relative seconds). */
  event: AgentEvent
}

export interface ObservationStoreOptions {
  /** Max events retained in the ring buffer. Oldest drop first. */
  capacity?: number
}

export interface ObservationQuery {
  readonly size: number
  getById(id: string): StoredObservation | undefined
  recent(n: number): StoredObservation[]
  byType(type: AgentEventType | AgentEventType[]): StoredObservation[]
  /** Filter by agent-flow `event.time` (session-relative seconds). */
  byTimeRange(minTime: number, maxTime: number): StoredObservation[]
  /** Filter by wall-clock ingest timestamp (ms). */
  byIngestedRange(fromMs: number, toMs: number): StoredObservation[]
  /**
   * Case-insensitive substring search over transcript-ish payload fields
   * (message content, tool args/results, task labels).
   */
  searchTranscript(
    query: string,
    options?: { limit?: number; caseSensitive?: boolean },
  ): StoredObservation[]
  getAll(): StoredObservation[]
}

export type ObservationSubscriber = (observation: StoredObservation) => void

/**
 * In-memory ring buffer of agent-flow protocol events.
 * Mutation is for the ingestion adapter; curators should use {@link ObservationQuery}.
 */
export class ObservationStore implements ObservationQuery {
  private readonly capacity: number
  private readonly buffer: StoredObservation[] = []
  private readonly byId = new Map<string, StoredObservation>()
  private nextSeq = 0
  private readonly subscribers = new Set<ObservationSubscriber>()

  constructor(options: ObservationStoreOptions = {}) {
    this.capacity = Math.max(1, options.capacity ?? DEFAULT_CAPACITY)
  }

  get size(): number {
    return this.buffer.length
  }

  /** Append one event. Returns the stored observation (including assigned id). */
  append(event: AgentEvent, harnessId = 'unknown'): StoredObservation {
    const seq = this.nextSeq++
    const observation: StoredObservation = {
      id: `obs-${seq}`,
      seq,
      ingestedAt: Date.now(),
      harnessId,
      event: {
        ...event,
        sessionId: event.sessionId,
        payload: { ...event.payload },
      },
    }

    this.buffer.push(observation)
    this.byId.set(observation.id, observation)

    while (this.buffer.length > this.capacity) {
      const dropped = this.buffer.shift()
      if (dropped) this.byId.delete(dropped.id)
    }

    for (const sub of this.subscribers) sub(observation)
    return observation
  }

  appendMany(events: AgentEvent[], harnessId = 'unknown'): StoredObservation[] {
    return events.map((event) => this.append(event, harnessId))
  }

  subscribe(cb: ObservationSubscriber): () => void {
    this.subscribers.add(cb)
    return () => {
      this.subscribers.delete(cb)
    }
  }

  clear(): void {
    this.buffer.length = 0
    this.byId.clear()
  }

  getById(id: string): StoredObservation | undefined {
    return this.byId.get(id)
  }

  recent(n: number): StoredObservation[] {
    if (n <= 0) return []
    return this.buffer.slice(Math.max(0, this.buffer.length - n))
  }

  byType(type: AgentEventType | AgentEventType[]): StoredObservation[] {
    const types = new Set(Array.isArray(type) ? type : [type])
    return this.buffer.filter((obs) => types.has(obs.event.type))
  }

  byTimeRange(minTime: number, maxTime: number): StoredObservation[] {
    return this.buffer.filter((obs) => {
      const t = obs.event.time
      return t >= minTime && t <= maxTime
    })
  }

  byIngestedRange(fromMs: number, toMs: number): StoredObservation[] {
    return this.buffer.filter((obs) => obs.ingestedAt >= fromMs && obs.ingestedAt <= toMs)
  }

  searchTranscript(
    query: string,
    options: { limit?: number; caseSensitive?: boolean } = {},
  ): StoredObservation[] {
    const needle = options.caseSensitive ? query : query.toLowerCase()
    if (!needle) return []

    const limit = options.limit ?? Number.POSITIVE_INFINITY
    const hits: StoredObservation[] = []

    for (const obs of this.buffer) {
      const haystack = transcriptSnippet(obs.event)
      const hay = options.caseSensitive ? haystack : haystack.toLowerCase()
      if (hay.includes(needle)) {
        hits.push(obs)
        if (hits.length >= limit) break
      }
    }
    return hits
  }

  getAll(): StoredObservation[] {
    return this.buffer.slice()
  }

  /** Read-only view for curator tools (M3). */
  asQuery(): ObservationQuery {
    return this
  }
}

function transcriptSnippet(event: AgentEvent): string {
  const p = event.payload
  const parts: string[] = [event.type]
  for (const key of [
    'content',
    'args',
    'result',
    'preview',
    'task',
    'summary',
    'label',
    'tool',
    'name',
    'message',
  ] as const) {
    const value = p[key]
    if (typeof value === 'string') parts.push(value)
  }
  if (p.discovery && typeof p.discovery === 'object') {
    const d = p.discovery as Record<string, unknown>
    if (typeof d.label === 'string') parts.push(d.label)
    if (typeof d.content === 'string') parts.push(d.content)
  }
  return parts.join('\n')
}
