import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createIngestionAdapter } from '../src/ingestion-adapter.ts'
import type { AgentEvent } from '../src/protocol.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const codexFixture = path.join(
  here,
  '../../../extension/test/fixtures/codex-rollout-sample.jsonl',
)

describe('HarnessDrivers', () => {
  it('registers claude-code and codex by default', () => {
    const adapter = createIngestionAdapter()
    expect(adapter.registry.registeredIds).toEqual(['claude-code', 'codex'])
    expect(adapter.registry.getDefault().id).toBe('claude-code')
  })

  it('Codex stub parses rollout fixture via CodexRolloutParser', async () => {
    const adapter = createIngestionAdapter()
    const driver = adapter.registry.get('codex')
    expect(driver).toBeTruthy()
    adapter.attachDriver(driver!)

    const lines = fs.readFileSync(codexFixture, 'utf8').split(/\n/)
    for (const line of lines) {
      driver!.ingestLine?.(line)
    }

    const events = adapter.query.getAll().map((o) => o.event)
    const spawns = events.filter((e: AgentEvent) => e.type === 'agent_spawn')
    expect(spawns.length).toBeGreaterThanOrEqual(1)
    expect(spawns[0]?.payload.isMain).toBe(true)
    expect(adapter.query.byType('model_detected').length).toBeGreaterThanOrEqual(1)
    expect(
      adapter.query.getAll().every((o) => o.harnessId === 'codex'),
    ).toBe(true)
  })
})
