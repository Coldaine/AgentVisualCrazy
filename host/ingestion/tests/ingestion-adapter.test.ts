import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createIngestionAdapter } from '../src/ingestion-adapter.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const simulateFixture = path.join(here, '../fixtures/simulate-events.jsonl')

describe('IngestionAdapter', () => {
  it('pushes events into the store and forwards IPC payloads', async () => {
    const ipc: Array<{ channel: string; args: unknown[] }> = []
    const adapter = createIngestionAdapter({
      emitIpc: (channel, ...args) => {
        ipc.push({ channel, args })
      },
    })

    const lines = fs
      .readFileSync(simulateFixture, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))

    adapter.pushMany(lines, 'claude-code')

    expect(adapter.query.size).toBe(18)
    expect(ipc).toHaveLength(18)
    expect(ipc[0]?.channel).toBe('agentvisual:agent-event')
    expect(adapter.query.searchTranscript('migration').length).toBeGreaterThanOrEqual(3)
    expect(adapter.query.byType('subagent_dispatch')).toHaveLength(1)
    expect(adapter.query.recent(1)[0]?.event.type).toBe('agent_complete')
  })

  it('replays simulate-events fixture through Claude driver', async () => {
    const adapter = createIngestionAdapter()
    await adapter.startDriver('claude-code', {
      filePath: simulateFixture,
      claudeMode: 'agent-events',
      replay: true,
    })

    expect(adapter.query.size).toBe(18)
    expect(adapter.query.byTimeRange(6, 9).some((o) => o.event.type === 'subagent_dispatch')).toBe(
      true,
    )
    adapter.stopAll()
  })
})
