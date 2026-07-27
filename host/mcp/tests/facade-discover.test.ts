/**
 * Ensures host/curator exports createCuratorFacade and MCP can load it.
 */
import { describe, it, expect } from 'vitest'
import { ObservationStore } from '@agentvisualcrazy/ingestion'
import type { AgentEvent } from '@agentvisualcrazy/ingestion'
import { tryLoadCuratorFacade } from '../src/curator-bridge.ts'

function evt(
  time: number,
  type: AgentEvent['type'],
  payload: Record<string, unknown> = {},
): AgentEvent {
  return { time, type, payload }
}

describe('createCuratorFacade discovery', () => {
  it('tryLoadCuratorFacade resolves host/curator createCuratorFacade', async () => {
    const prev = process.env.AVC_CURATOR_MODE
    process.env.AVC_CURATOR_MODE = 'mock'
    try {
      const facade = await tryLoadCuratorFacade({ jsonlPath: null, watching: false })
      const store = new ObservationStore()
      store.append(evt(1, 'message', { content: 'hello from discovery test' }), 'test')

      const status = await facade.getStatus(store)
      expect(status.curatorConfigured).toBe(true)
      expect(status.storeSize).toBe(1)
      expect(status.gallery.configured).toBe(true)
      expect(status.note ?? '').not.toMatch(/curator not configured/i)

      const ask = await facade.ask('Summarize the session', store)
      expect(ask.configured).toBe(true)
      expect(ask.answer).not.toMatch(/curator not configured/i)
      expect(ask.answer).toContain('Summarize the session')
    } finally {
      if (prev === undefined) delete process.env.AVC_CURATOR_MODE
      else process.env.AVC_CURATOR_MODE = prev
    }
  })
})
