/**
 * Smoke: register tools on McpServer and exercise list/call via in-memory transport.
 */
import { describe, it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ObservationStore } from '@agentvisualcrazy/ingestion'
import type { AgentEvent } from '@agentvisualcrazy/ingestion'
import { createStubCuratorFacade } from '../src/curator-bridge.ts'
import { createCuratorMcpServer, MCP_SERVER_NAME } from '../src/server.ts'

function evt(
  time: number,
  type: AgentEvent['type'],
  payload: Record<string, unknown> = {},
): AgentEvent {
  return { time, type, payload }
}

describe('curator MCP server smoke', () => {
  it('lists curator_* tools and answers curator_status', async () => {
    const store = new ObservationStore()
    store.append(evt(0, 'agent_spawn', { name: 'main' }), 'test')
    store.append(evt(1, 'tool_call_start', { tool: 'Read' }), 'test')

    const mcp = createCuratorMcpServer({
      store,
      curator: createStubCuratorFacade({ jsonlPath: null, watching: false }),
    })

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'smoke-client', version: '0.0.0' })

    await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)])

    const listed = await client.listTools()
    const names = listed.tools.map((t) => t.name).sort()
    expect(names).toEqual(['curator_ask', 'curator_events', 'curator_status'])
    expect(names.some((n) => n.startsWith('shadow_'))).toBe(false)

    const status = await client.callTool({ name: 'curator_status', arguments: {} })
    expect(status.isError).not.toBe(true)
    const text = (status.content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('')
    expect(text).toContain('curatorConfigured')
    expect(text).toContain('"storeSize": 2')
    expect(text).toContain('acting')

    const events = await client.callTool({ name: 'curator_events', arguments: { n: 1 } })
    const eventsText = (events.content as Array<{ type: string; text?: string }>)
      .map((c) => c.text ?? '')
      .join('')
    expect(eventsText).toContain('tool_call_start')

    const ask = await client.callTool({
      name: 'curator_ask',
      arguments: { question: 'Summarize progress' },
    })
    const askText = (ask.content as Array<{ type: string; text?: string }>)
      .map((c) => c.text ?? '')
      .join('')
    expect(askText).toMatch(/curator not configured/i)

    await client.close()
    await mcp.close()
  })

  it('identifies as agentvisualcrazy-curator', () => {
    expect(MCP_SERVER_NAME).toBe('agentvisualcrazy-curator')
  })
})
