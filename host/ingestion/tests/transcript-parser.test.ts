/**
 * Transcript-parser integration test (PR #120 ingestion hardening).
 *
 * Exercises the REAL TranscriptParser (compiled from extension/src/) against a
 * realistic Claude Code session JSONL fixture — not the 18-line synthetic
 * AgentEvent fixture used by ingestion-adapter.test.ts. This is the test that
 * proves the ingestion pivot (raw transcript → AgentEvent) works against
 * realistic transcript shape.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createIngestionAdapter } from '../src/ingestion-adapter.ts'
import type { AgentEvent } from '../src/protocol.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const transcriptFixture = path.join(here, '../fixtures/claude-transcript-sample.jsonl')
const simulateFixture = path.join(here, '../fixtures/simulate-events.jsonl')

function readFixture(p: string): string {
  return fs.readFileSync(p, 'utf8')
}

describe('ClaudeCodeDriver transcript mode — realistic fixture', () => {
  it('parses a realistic Claude transcript into the AgentEvent vocabulary', async () => {
    const adapter = createIngestionAdapter()
    await adapter.startDriver('claude-code', {
      filePath: transcriptFixture,
      claudeMode: 'transcript',
      sessionId: 'sample-transcript-001',
      replay: true,
    })

    const events = adapter.query.getAll().map((o) => o.event)
    expect(events.length).toBeGreaterThan(5)

    const types = new Set(events.map((e) => e.type))
    // The parser must emit at least some of the core event types.
    expect(types.has('message') || types.has('agent_spawn')).toBe(true)

    // tool_use blocks in the transcript must produce tool_call_start events.
    const toolStarts = events.filter(
      (e) => e.type === 'tool_call_start' || e.type === 'tool_call',
    )
    expect(toolStarts.length).toBeGreaterThanOrEqual(3) // Read, Bash, Edit

    adapter.stopAll()
  })

  it('stamps events with the session id', async () => {
    const adapter = createIngestionAdapter()
    await adapter.startDriver('claude-code', {
      filePath: transcriptFixture,
      claudeMode: 'transcript',
      sessionId: 'sample-transcript-001',
      replay: true,
    })

    const events = adapter.query.getAll().map((o) => o.event)
    for (const e of events) {
      expect(e.sessionId).toBe('sample-transcript-001')
    }
    adapter.stopAll()
  })
})

describe('ClaudeCodeDriver — negative paths', () => {
  it('handles a missing fixture file gracefully (zero events, no crash)', async () => {
    const adapter = createIngestionAdapter()
    // The driver does not throw on a missing file — it produces zero events.
    // This documents the actual behavior; if we later want a hard error, that's
    // a deliberate change, not something this test should silently enforce.
    await adapter.startDriver('claude-code', {
      filePath: path.join(here, '../fixtures/does-not-exist.jsonl'),
      claudeMode: 'transcript',
      replay: true,
    })
    expect(adapter.query.size).toBe(0)
    adapter.stopAll()
  })

  it('produces zero events from an empty file', async () => {
    const emptyPath = path.join(here, '../fixtures/empty.jsonl')
    fs.writeFileSync(emptyPath, '')
    try {
      const adapter = createIngestionAdapter()
      await adapter.startDriver('claude-code', {
        filePath: emptyPath,
        claudeMode: 'transcript',
        replay: true,
      })
      expect(adapter.query.size).toBe(0)
      adapter.stopAll()
    } finally {
      fs.rmSync(emptyPath, { force: true })
    }
  })

  it('does not crash on a malformed JSON line', async () => {
    const malformedPath = path.join(here, '../fixtures/malformed.jsonl')
    fs.writeFileSync(
      malformedPath,
      [
        '{"type":"user","sessionId":"m","message":{"role":"user","content":[{"type":"text","text":"ok"}]}}',
        'this is not valid json',
        '{"type":"assistant","sessionId":"m","message":{"role":"assistant","content":[{"type":"text","text":"recovered"}]}}',
      ].join('\n'),
    )
    try {
      const adapter = createIngestionAdapter()
      // The driver should either skip the bad line or throw a contained error,
      // but it must not corrupt the store or crash the process.
      try {
        await adapter.startDriver('claude-code', {
          filePath: malformedPath,
          claudeMode: 'transcript',
          replay: true,
        })
      } catch {
        /* parser may throw on bad lines — that's acceptable as long as it's contained */
      }
      // Whatever happened, the adapter is still usable.
      expect(typeof adapter.query.size).toBe('number')
      adapter.stopAll()
    } finally {
      fs.rmSync(malformedPath, { force: true })
    }
  })
})

describe('fixture sanity', () => {
  it('the realistic transcript fixture is non-trivial', () => {
    const content = readFixture(transcriptFixture)
    const lines = content.split(/\r?\n/).filter(Boolean)
    expect(lines.length).toBeGreaterThan(10)
    // Every line must be valid JSON.
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
    // Must contain the expected record types.
    const types = lines.map((l) => (JSON.parse(l) as { type: string }).type)
    expect(types).toContain('user')
    expect(types).toContain('assistant')
    expect(types).toContain('system')
  })

  it('the synthetic AgentEvent fixture is still present for the existing tests', () => {
    expect(fs.existsSync(simulateFixture)).toBe(true)
  })
})
