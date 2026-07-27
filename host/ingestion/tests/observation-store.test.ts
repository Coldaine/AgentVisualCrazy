import { describe, it, expect } from 'vitest'
import { ObservationStore } from '../src/observation-store.ts'
import type { AgentEvent } from '../src/protocol.ts'

function evt(
  time: number,
  type: AgentEvent['type'],
  payload: Record<string, unknown> = {},
): AgentEvent {
  return { time, type, payload }
}

describe('ObservationStore', () => {
  it('assigns ids and respects ring capacity', () => {
    const store = new ObservationStore({ capacity: 3 })
    store.append(evt(0, 'agent_spawn'), 'claude-code')
    store.append(evt(1, 'message', { content: 'a' }), 'claude-code')
    store.append(evt(2, 'message', { content: 'b' }), 'claude-code')
    store.append(evt(3, 'message', { content: 'c' }), 'claude-code')

    expect(store.size).toBe(3)
    expect(store.getById('obs-0')).toBeUndefined()
    expect(store.recent(2).map((o) => o.event.payload.content)).toEqual(['b', 'c'])
  })

  it('queries by type and time range', () => {
    const store = new ObservationStore()
    store.appendMany(
      [
        evt(0, 'agent_spawn'),
        evt(1, 'message', { content: 'hello' }),
        evt(2, 'tool_call_start', { tool: 'Read' }),
        evt(5, 'tool_call_end', { tool: 'Read', result: 'ok' }),
      ],
      'claude-code',
    )

    expect(store.byType('message')).toHaveLength(1)
    expect(store.byType(['tool_call_start', 'tool_call_end'])).toHaveLength(2)
    expect(store.byTimeRange(1, 2).map((o) => o.event.type)).toEqual([
      'message',
      'tool_call_start',
    ])
  })

  it('searches transcript snippets', () => {
    const store = new ObservationStore()
    store.append(evt(1, 'message', { content: 'Analyzing database module' }), 'x')
    store.append(evt(2, 'tool_call_end', { result: 'migrations applied' }), 'x')
    store.append(evt(3, 'message', { content: 'unrelated' }), 'x')

    const hits = store.searchTranscript('migration')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.event.payload.result).toBe('migrations applied')
  })
})
