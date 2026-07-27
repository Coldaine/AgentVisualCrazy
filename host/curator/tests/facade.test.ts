import { describe, expect, it } from 'vitest'
import { createCuratorFacade } from '../src/facade.ts'
import type { ObservationQuery, CuratorObservation } from '../src/observation.ts'

function obs(
  id: string,
  type: string,
  payload: Record<string, unknown> = {},
): CuratorObservation {
  return {
    id,
    seq: Number(id.replace(/\D/g, '') || 0),
    ingestedAt: Date.now(),
    harnessId: 'test',
    event: { type, time: 1, payload },
  }
}

function queryWith(events: CuratorObservation[]): ObservationQuery {
  return {
    size: events.length,
    getById: (id) => events.find((e) => e.id === id),
    recent: (n) => events.slice(-n),
    byType: (type) => {
      const types = Array.isArray(type) ? type : [type]
      return events.filter((e) => types.includes(e.event.type))
    },
    searchTranscript: (q, options) => {
      const limit = options?.limit ?? 20
      const needle = options?.caseSensitive ? q : q.toLowerCase()
      return events
        .filter((e) => {
          const hay = JSON.stringify(e.event.payload)
          return (options?.caseSensitive ? hay : hay.toLowerCase()).includes(needle)
        })
        .slice(0, limit)
    },
    getAll: () => events,
  }
}

describe('createCuratorFacade', () => {
  it('exports a facade with getStatus + ask (mock mode)', async () => {
    const events = [
      obs('e1', 'agent_spawn', { name: 'main' }),
      obs('e2', 'message', { content: 'investigating the build failure' }),
      obs('e3', 'tool_call_start', { tool: 'Read' }),
    ]
    const store = queryWith(events)
    const facade = createCuratorFacade({
      jsonlPath: null,
      watching: false,
      forceMock: true,
    })

    const status = await facade.getStatus(store)
    expect(status.curatorConfigured).toBe(true)
    expect(status.storeSize).toBe(3)
    expect(status.phaseLike).toBe('acting')
    expect(status.gallery.configured).toBe(true)
    expect(status.authMode).toBe('mock')

    const ask = await facade.ask('What is the agent doing about the build?', store)
    expect(ask.configured).toBe(true)
    expect(ask.answer).toMatch(/Question:/)
    expect(ask.answer).toMatch(/Gallery:/)
    expect(ask.artifacts?.length).toBeGreaterThan(0)
    expect(ask.citedEventIds?.length).toBeGreaterThan(0)

    const after = await facade.getStatus(store)
    expect(after.gallery.artifactCount).toBeGreaterThan(0)
  })
})
