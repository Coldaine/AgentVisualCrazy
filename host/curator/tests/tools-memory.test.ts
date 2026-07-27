import { describe, expect, it } from 'vitest'
import { GalleryMemory } from '../src/gallery-memory.ts'
import type { ObservationQuery, CuratorObservation } from '../src/observation.ts'
import { createCuratorTools, CURATOR_TOOL_IDS, FORBIDDEN_TOOL_IDS } from '../src/tools.ts'
import type { ExhibitArtifact } from '../src/types.ts'

function obs(
  seq: number,
  type: string,
  payload: Record<string, unknown> = {},
): CuratorObservation {
  return {
    id: `obs-${seq}`,
    seq,
    ingestedAt: Date.now(),
    harnessId: 'test',
    event: { type, time: seq, sessionId: 's1', payload },
  }
}

function makeQuery(rows: CuratorObservation[]): ObservationQuery {
  const byId = new Map(rows.map((r) => [r.id, r]))
  return {
    get size() {
      return rows.length
    },
    getById: (id) => byId.get(id),
    recent: (n) => rows.slice(-n),
    byType: (type) => {
      const types = new Set(Array.isArray(type) ? type : [type])
      return rows.filter((r) => types.has(r.event.type))
    },
    searchTranscript: (q, options) => {
      const needle = q.toLowerCase()
      const limit = options?.limit ?? 100
      return rows
        .filter((r) => JSON.stringify(r.event.payload).toLowerCase().includes(needle))
        .slice(0, limit)
    },
    getAll: () => rows.slice(),
  }
}

describe('curator tools (read-only)', () => {
  it('registers only observation lookback tools', () => {
    const tools = createCuratorTools(makeQuery([]), new GalleryMemory())
    const ids = Object.values(tools).map((t) => t.id)
    expect(ids.sort()).toEqual([...CURATOR_TOOL_IDS].sort())
    for (const forbidden of FORBIDDEN_TOOL_IDS) {
      expect(ids).not.toContain(forbidden)
    }
  })

  it('recent_events / by type / search / getById', async () => {
    const query = makeQuery([
      obs(0, 'message', { content: 'hello migration' }),
      obs(1, 'tool_call_end', { tool: 'Read', result: 'ok' }),
      obs(2, 'message', { content: 'still on migration path' }),
    ])
    const tools = createCuratorTools(query, new GalleryMemory())

    const recent = await tools.recentEvents.execute!({ n: 2 }, {} as never)
    expect(recent.count).toBe(2)
    expect(recent.events[1].id).toBe('obs-2')

    const byType = await tools.eventsByType.execute!(
      { types: 'tool_call_end' },
      {} as never,
    )
    expect(byType.count).toBe(1)

    const search = await tools.searchTranscript.execute!(
      { query: 'migration', limit: 10 },
      {} as never,
    )
    expect(search.count).toBe(2)

    const one = await tools.getObservation.execute!({ id: 'obs-1' }, {} as never)
    expect(one.found).toBe(true)
  })
})

describe('gallery memory', () => {
  it('upserts, refreshes, and retires artifacts', async () => {
    const gallery = new GalleryMemory()
    const first: ExhibitArtifact = {
      id: 'a1',
      exhibitType: 'momentum',
      title: 'M',
      narrative: 'n1',
      relevance: 0.5,
      decayClass: 'fast',
      createdAtEvent: 1,
      status: 'fresh',
      payload: {
        value: 10,
        label: 'x',
        stats: [],
        next: [],
        curation: [],
      },
    }
    gallery.upsertMany([first], 1)
    gallery.upsertMany(
      [{ ...first, narrative: 'n2', relevance: 0.8, status: 'active' }],
      5,
    )
    const listed = gallery.list()
    expect(listed).toHaveLength(1)
    expect(listed[0].narrative).toBe('n2')
    expect(listed[0].createdAtEvent).toBe(1)
    expect(listed[0].refreshedAtEvent).toBe(5)

    gallery.retire('a1', 'stale story')
    expect(gallery.list()).toHaveLength(0)
    expect(gallery.list({ includeRetired: true })[0].status).toBe('retired')

    const tools = createCuratorTools(makeQuery([]), gallery)
    const prior = await tools.listPriorArtifacts.execute!(
      { includeRetired: true },
      {} as never,
    )
    expect(prior.count).toBe(1)
  })
})
