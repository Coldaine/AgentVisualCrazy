import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ObservationStore } from '@agentvisualcrazy/ingestion'
import type { AgentEvent } from '@agentvisualcrazy/ingestion'
import { createStubCuratorFacade } from '../src/curator-bridge.ts'
import {
  clampEventsN,
  handleCuratorAsk,
  handleCuratorEvents,
  handleCuratorStatus,
} from '../src/tools.ts'
import { bootstrapObservationStore, OBSERVATION_JSONL_ENV } from '../src/store-bootstrap.ts'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const fixtureJsonl = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../ingestion/fixtures/simulate-events.jsonl',
)

function evt(
  time: number,
  type: AgentEvent['type'],
  payload: Record<string, unknown> = {},
): AgentEvent {
  return { time, type, payload }
}

describe('curator MCP tool handlers', () => {
  it('clamps curator_events n', () => {
    expect(clampEventsN(undefined)).toBe(20)
    expect(clampEventsN(3)).toBe(3)
    expect(clampEventsN(9999)).toBe(200)
    expect(clampEventsN(0)).toBe(1)
  })

  it('curator_status reports store + stub gallery', async () => {
    const store = new ObservationStore()
    store.append(evt(1, 'message', { content: 'hello' }), 'test')
    const curator = createStubCuratorFacade({ jsonlPath: null, watching: false })
    const status = (await handleCuratorStatus(store, curator)) as {
      curatorConfigured: boolean
      storeSize: number
      phaseLike: string
      gallery: { artifactCount: number }
      note?: string
    }

    expect(status.curatorConfigured).toBe(false)
    expect(status.storeSize).toBe(1)
    expect(status.phaseLike).toBe('reasoning')
    expect(status.gallery.artifactCount).toBe(0)
    expect(status.note).toMatch(/curator not configured/i)
  })

  it('curator_events returns recent n', async () => {
    const store = new ObservationStore()
    store.appendMany(
      [
        evt(0, 'agent_spawn'),
        evt(1, 'message', { content: 'a' }),
        evt(2, 'message', { content: 'b' }),
      ],
      'test',
    )
    const result = await handleCuratorEvents(store, 2)
    expect(result.count).toBe(2)
    expect(result.events.map((e) => e.payload.content)).toEqual(['a', 'b'])
  })

  it('curator_ask stub facade reports not configured', async () => {
    const store = new ObservationStore()
    store.append(evt(1, 'message', { content: 'x' }), 'test')
    const curator = createStubCuratorFacade({ jsonlPath: null, watching: false })
    const result = (await handleCuratorAsk(store, curator, 'What is the agent doing?')) as {
      configured: boolean
      answer: string
    }
    expect(result.configured).toBe(false)
    expect(result.answer).toMatch(/curator not configured/i)
    expect(result.answer).toContain('What is the agent doing?')
  })
})

describe('JSONL bootstrap', () => {
  const prev = process.env[OBSERVATION_JSONL_ENV]

  beforeEach(() => {
    process.env[OBSERVATION_JSONL_ENV] = fixtureJsonl
    delete process.env.AVC_OBSERVATION_WATCH
  })

  afterEach(() => {
    if (prev === undefined) delete process.env[OBSERVATION_JSONL_ENV]
    else process.env[OBSERVATION_JSONL_ENV] = prev
  })

  it('loads simulate-events fixture into ObservationStore', () => {
    const boot = bootstrapObservationStore()
    expect(boot.jsonlPath).toBe(fixtureJsonl)
    expect(boot.store.size).toBeGreaterThan(10)
    const types = boot.store.recent(3).map((o) => o.event.type)
    expect(types.length).toBe(3)
    boot.dispose()
  })
})
