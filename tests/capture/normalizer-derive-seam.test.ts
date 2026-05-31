import { describe, it, expect } from 'vitest';
import { normalizeEntry } from '../../src/capture/drivers/claude-code/normalizer';
import { deriveState } from '../../src/shared/derive';

/**
 * Guards the live normalizer -> deriveState seam. These bugs hid because no test
 * ran the real claude-code normalizer output through deriveState: the normalizer
 * nests tool args under `payload.args`, but derive's file-attention extractor only
 * checked the payload top level, and the normalizer dropped `thinking` blocks.
 */
describe('claude-code normalizer -> deriveState seam', () => {
  it('populates fileAttention from tool args nested under payload.args', () => {
    const entry = {
      type: 'assistant',
      timestamp: '2026-05-30T12:00:00.000Z',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/repo/src/foo.ts' } },
          { type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/repo/src/foo.ts' } },
          { type: 'tool_use', id: 't3', name: 'Grep', input: { pattern: 'x', path: '/repo/src' } }
        ]
      }
    };

    const events = normalizeEntry(entry, 'sess');
    const state = deriveState(events);

    const foo = state.fileAttention.find((f) => f.filePath === '/repo/src/foo.ts');
    expect(foo?.touches).toBe(2);
    expect(state.fileAttention.some((f) => f.filePath === '/repo/src')).toBe(true);
    expect(state.activePhase).toBe('implementation');
  });

  it('captures thinking blocks as transcript text instead of dropping them', () => {
    const entry = {
      type: 'assistant',
      timestamp: '2026-05-30T12:00:00.000Z',
      message: {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'I should read the config first.' }]
      }
    };

    const events = normalizeEntry(entry, 'sess');
    expect(
      events.some((e) => e.kind === 'message' && e.payload.text === 'I should read the config first.')
    ).toBe(true);

    const state = deriveState(events);
    expect(state.transcript.some((t) => t.text.includes('read the config'))).toBe(true);
  });
});
