/**
 * Cross-package integration hardening for the curator MCP server (PR #123).
 *
 * Exercises the REAL host/curator facade (mock mode) through the MCP server
 * over in-memory transport, and asserts the read-only / no-shadow_* contract
 * at the annotation level.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ObservationStore } from '@agentvisualcrazy/ingestion'
import type { AgentEvent } from '@agentvisualcrazy/ingestion'
import { tryLoadCuratorFacade, createStubCuratorFacade } from '../src/curator-bridge.ts'
import { createCuratorMcpServer } from '../src/server.ts'
import { clampEventsN, handleCuratorEvents, handleCuratorStatus } from '../src/tools.ts'

function evt(
  time: number,
  type: AgentEvent['type'],
  payload: Record<string, unknown> = {},
): AgentEvent {
  return { time, type, payload }
}

describe('curator MCP + real facade integration (mock mode)', () => {
  let facade: Awaited<ReturnType<typeof tryLoadCuratorFacade>>

  beforeAll(async () => {
    process.env.AVC_CURATOR_MODE = 'mock'
    facade = await tryLoadCuratorFacade({ jsonlPath: null, watching: false })
  })

  async function withClient(
    store: ObservationStore,
    fn: (client: Client) => Promise<void>,
  ): Promise<void> {
    const mcp = createCuratorMcpServer({ store, curator: facade })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'integration-client', version: '0.0.0' })
    await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)])
    try {
      await fn(client)
    } finally {
      await client.close()
      await mcp.close()
    }
  }

  function parseText(result: { content: unknown }): string {
    const content = result.content as Array<{ type: string; text?: string }>
    return content
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('')
  }

  it('real facade reports curatorConfigured=true and gallery.configured=true via curator_status', async () => {
    const store = new ObservationStore()
    store.append(evt(0, 'agent_spawn', { name: 'main' }), 'test')
    store.append(evt(1, 'message', { content: 'investigating' }), 'test')

    await withClient(store, async (client) => {
      const status = await client.callTool({ name: 'curator_status', arguments: {} })
      expect(status.isError).not.toBe(true)
      const text = parseText(status)
      expect(text).toContain('"curatorConfigured": true')
      expect(text).toContain('"configured": true')
      expect(text).not.toMatch(/curator not configured/i)
      expect(text).toContain('"storeSize": 2')
    })
  })

  it('curator_ask through the real facade returns a real answer with artifacts', async () => {
    const store = new ObservationStore()
    store.append(evt(0, 'agent_spawn', { name: 'main' }), 'test')
    store.append(evt(1, 'tool_call_start', { tool: 'Read' }), 'test')
    store.append(evt(2, 'message', { content: 'reading files' }), 'test')

    await withClient(store, async (client) => {
      const ask = await client.callTool({
        name: 'curator_ask',
        arguments: { question: 'What is the agent doing?' },
      })
      expect(ask.isError).not.toBe(true)
      const text = parseText(ask)
      expect(text).not.toMatch(/curator not configured/i)
      expect(text).toContain('What is the agent doing?')
      // Mock mode produces non-empty artifacts.
      expect(text).toMatch(/Gallery: \d+ artifact\(s\)/)
    })
  })

  it('curator_events returns serialized recent events through the transport', async () => {
    const store = new ObservationStore()
    store.append(evt(0, 'agent_spawn'), 'test')
    store.append(evt(1, 'message', { content: 'a' }), 'test')
    store.append(evt(2, 'tool_call_end', { tool: 'Write' }), 'test')

    await withClient(store, async (client) => {
      const events = await client.callTool({
        name: 'curator_events',
        arguments: { n: 2 },
      })
      const text = parseText(events)
      expect(text).toContain('"count": 2')
      expect(text).toContain('tool_call_end')
    })
  })
})

describe('read-only / no-shadow_* contract on registered tools', () => {
  it('all curator_* tools declare readOnlyHint=true and destructiveHint=false', async () => {
    const store = new ObservationStore()
    store.append(evt(0, 'message', { content: 'x' }), 'test')
    const mcp = createCuratorMcpServer({
      store,
      curator: await tryLoadCuratorFacade({ jsonlPath: null, watching: false }),
    })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'contract-client', version: '0.0.0' })
    await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)])
    try {
      const listed = await client.listTools()
      expect(listed.tools.length).toBe(3)
      for (const tool of listed.tools) {
        expect(tool.name.startsWith('shadow_')).toBe(false)
        expect(tool.name.startsWith('curator_')).toBe(true)
        const ann = tool.annotations ?? {}
        expect(ann.readOnlyHint).toBe(true)
        expect(ann.destructiveHint).toBe(false)
      }
    } finally {
      await client.close()
      await mcp.close()
    }
  })
})

describe('clampEventsN edge cases', () => {
  it('clamps negative, NaN, fractional, and string inputs to safe bounds', () => {
    expect(clampEventsN(-5)).toBe(1)
    expect(clampEventsN(NaN)).toBe(20)
    expect(clampEventsN(3.7)).toBe(3)
    expect(clampEventsN('50')).toBe(50)
    expect(clampEventsN('not-a-number')).toBe(20)
    expect(clampEventsN(null)).toBe(1)
    expect(clampEventsN(undefined)).toBe(20)
    expect(clampEventsN(201)).toBe(200)
    expect(clampEventsN(1)).toBe(1)
    expect(clampEventsN(200)).toBe(200)
  })
})

describe('payload redaction', () => {
  it('curator_events redacts sensitive keys in serialized payloads', async () => {
    const store = new ObservationStore()
    store.append(
      evt(1, 'tool_call_end', {
        tool: 'Read',
        result: 'file contents',
        api_key: 'sk-leak',
        Authorization: 'Bearer secret',
        nested: { TOKEN: 'hidden', ok: 'visible' },
      }),
      'test',
    )
    const result = await handleCuratorEvents(store, 1)
    const payload = result.events[0].payload as Record<string, unknown>
    expect(payload.api_key).toBe('[redacted]')
    expect(payload.Authorization).toBe('[redacted]')
    expect((payload.nested as Record<string, unknown>).TOKEN).toBe('[redacted]')
    expect((payload.nested as Record<string, unknown>).ok).toBe('visible')
    expect(payload.result).toBe('file contents')
  })

  it('curator_status redacts the latestEvent payload via the stub facade', async () => {
    const store = new ObservationStore()
    store.append(
      evt(1, 'message', { content: 'hi', password: 'p@ss' }),
      'test',
    )
    const curator = createStubCuratorFacade({ jsonlPath: null, watching: false })
    const status = (await handleCuratorStatus(store, curator)) as {
      latestEvent: { event: { payload: Record<string, unknown> } } | null
    }
    expect(status.latestEvent?.event.payload.password).toBe('[redacted]')
    expect(status.latestEvent?.event.payload.content).toBe('hi')
  })

  it('truncates oversized string values in payloads', async () => {
    const store = new ObservationStore()
    const huge = 'x'.repeat(10_000)
    store.append(evt(1, 'tool_call_end', { tool: 'Read', result: huge }), 'test')
    const result = await handleCuratorEvents(store, 1)
    const payload = result.events[0].payload as Record<string, unknown>
    const resultStr = payload.result as string
    expect(resultStr.length).toBeLessThan(10_000)
    expect(resultStr).toMatch(/truncated/)
  })
})
