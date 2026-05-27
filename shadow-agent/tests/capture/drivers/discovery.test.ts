/**
 * Discovery dispatcher + claude-code DiscoveryStrategy contract tests (PR 4).
 *
 * Verifies:
 * - Generic dispatcher iterates all registered drivers with discovery
 * - Latest session across drivers wins
 * - Override path short-circuits dispatch
 * - Driver discovery errors don't break the dispatcher
 * - claude-code DiscoveryStrategy walks the configured projectsDir
 */
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HarnessDriverRegistry,
  type HarnessDriver,
} from '../../../src/capture/drivers/harness-driver';
import { createClaudeCodeDiscovery } from '../../../src/capture/drivers/claude-code/discovery';
import { discoverActiveSession } from '../../../src/capture/session-discovery';

function makeFakeDriver(
  id: string,
  sessions: Array<{ filePath: string; sessionId: string; lastModified: number; source?: string }>
): HarnessDriver {
  const source = `${id}-source`;
  return {
    id,
    sources: [source],
    capabilities: {
      emitsSubagentEvents: false,
      fileAttention: 'tool-args',
      riskHeuristics: [],
    },
    normalizeEntry: () => [],
    discovery: {
      discoverSessions: async () => sessions.map((s) => ({ ...s, source: s.source ?? source })),
    },
  };
}

function makeFailingDiscoveryDriver(id: string): HarnessDriver {
  return {
    id,
    sources: [`${id}-source`],
    capabilities: {
      emitsSubagentEvents: false,
      fileAttention: 'tool-args',
      riskHeuristics: [],
    },
    normalizeEntry: () => [],
    discovery: {
      discoverSessions: async () => {
        throw new Error(`${id} discovery failed`);
      },
    },
  };
}

describe('session-discovery dispatcher', () => {
  it('returns null when no drivers have discovery', async () => {
    const driver: HarnessDriver = {
      id: 'no-discovery',
      sources: ['x'],
      capabilities: { emitsSubagentEvents: false, fileAttention: 'tool-args', riskHeuristics: [] },
      normalizeEntry: () => [],
    };
    const registry = new HarnessDriverRegistry().register(driver);
    expect(await discoverActiveSession(undefined, { registry })).toBeNull();
  });

  it('returns null when drivers have discovery but no sessions exist', async () => {
    const registry = new HarnessDriverRegistry().register(makeFakeDriver('empty', []));
    expect(await discoverActiveSession(undefined, { registry })).toBeNull();
  });

  it('returns the latest session across multiple drivers', async () => {
    const registry = new HarnessDriverRegistry()
      .register(makeFakeDriver('a', [
        { filePath: '/a/old.jsonl', sessionId: 'a-old', lastModified: 100 },
        { filePath: '/a/new.jsonl', sessionId: 'a-new', lastModified: 200 },
      ]))
      .register(makeFakeDriver('b', [
        { filePath: '/b/latest.jsonl', sessionId: 'b-latest', lastModified: 300 },
      ]));

    const result = await discoverActiveSession(undefined, { registry });
    expect(result?.sessionId).toBe('b-latest');
    expect(result?.lastModified).toBe(300);
  });

  it('propagates the discovering driver\'s source through the dispatcher', async () => {
    // The whole point of carrying `source` on DriverDiscoveredSession: when a
    // non-Claude JSONL discovery wins the latest-mtime race, session-manager
    // must look up the right driver via the source, not silently re-use claude.
    const registry = new HarnessDriverRegistry()
      .register(makeFakeDriver('claude-code', [
        { filePath: '/claude/old.jsonl', sessionId: 'claude-old', lastModified: 100 },
      ]))
      .register(makeFakeDriver('codex', [
        { filePath: '/codex/recent.jsonl', sessionId: 'codex-recent', lastModified: 999 },
      ]));

    const result = await discoverActiveSession(undefined, { registry });
    expect(result?.sessionId).toBe('codex-recent');
    expect(result?.source).toBe('codex-source');
  });

  it('skips a failing driver and still considers others', async () => {
    const registry = new HarnessDriverRegistry()
      .register(makeFailingDiscoveryDriver('broken'))
      .register(makeFakeDriver('good', [
        { filePath: '/good/x.jsonl', sessionId: 'good-x', lastModified: 50 },
      ]));

    const result = await discoverActiveSession(undefined, { registry });
    expect(result?.sessionId).toBe('good-x');
  });

  it('override path short-circuits driver dispatch', async () => {
    const tmpRoot = mkdtempSync(path.join(tmpdir(), 'discovery-override-'));
    try {
      const filePath = path.join(tmpRoot, 'manual.jsonl');
      writeFileSync(filePath, '{}\n');
      // Registry has no drivers — proves override doesn't depend on dispatch.
      const registry = new HarnessDriverRegistry();
      const result = await discoverActiveSession(filePath, { registry });
      expect(result?.filePath).toBe(filePath);
      expect(result?.sessionId).toBe('manual');
      // Override path defaults to 'claude-transcript' since the override flow
      // predates multi-harness and was always a Claude JSONL pointer.
      expect(result?.source).toBe('claude-transcript');
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('override source can be customized via options', async () => {
    const tmpRoot = mkdtempSync(path.join(tmpdir(), 'discovery-override-source-'));
    try {
      const filePath = path.join(tmpRoot, 'cursor-hook.json');
      writeFileSync(filePath, '{}\n');
      const result = await discoverActiveSession(filePath, {
        registry: new HarnessDriverRegistry(),
        overrideSource: 'cursor-hook',
      });
      expect(result?.source).toBe('cursor-hook');
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('returns null when override path does not exist', async () => {
    const result = await discoverActiveSession('/nonexistent/path/xyz.jsonl');
    expect(result).toBeNull();
  });
});

describe('claude-code DiscoveryStrategy', () => {
  it('returns empty array when projectsDir does not exist', async () => {
    const discovery = createClaudeCodeDiscovery({ projectsDir: '/no/such/dir/xyz' });
    expect(await discovery.discoverSessions()).toEqual([]);
  });

  it('walks projectsDir recursively for .jsonl and .ndjson files', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'claude-discovery-'));
    try {
      const project = path.join(root, 'my-project');
      mkdirSync(project, { recursive: true });
      const jsonl = path.join(project, 'session-a.jsonl');
      const ndjson = path.join(project, 'session-b.ndjson');
      const ignored = path.join(project, 'README.md');
      writeFileSync(jsonl, '{}\n');
      writeFileSync(ndjson, '{}\n');
      writeFileSync(ignored, 'x');

      // Differentiate mtimes deterministically
      utimesSync(jsonl, new Date(1000), new Date(1000));
      utimesSync(ndjson, new Date(2000), new Date(2000));

      const discovery = createClaudeCodeDiscovery({ projectsDir: root });
      const sessions = await discovery.discoverSessions();

      expect(sessions).toHaveLength(2);
      const ids = sessions.map((s) => s.sessionId).sort();
      expect(ids).toEqual(['session-a', 'session-b']);
      // README.md must be filtered
      expect(sessions.every((s) => !s.filePath.endsWith('.md'))).toBe(true);
      // Every claude-code discovered session must carry the transcript source.
      expect(sessions.every((s) => s.source === 'claude-transcript')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('integrates with the dispatcher to surface a claude-code session', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'claude-integration-'));
    try {
      const file = path.join(root, 'live.jsonl');
      writeFileSync(file, '{}\n');
      const fakeClaudeDriver: HarnessDriver = {
        id: 'claude-code-test',
        sources: ['claude-transcript'],
        capabilities: { emitsSubagentEvents: true, fileAttention: 'tool-args', riskHeuristics: [] },
        normalizeEntry: () => [],
        discovery: createClaudeCodeDiscovery({ projectsDir: root }),
      };
      const registry = new HarnessDriverRegistry().register(fakeClaudeDriver);
      const result = await discoverActiveSession(undefined, { registry });
      expect(result?.filePath).toBe(file);
      expect(result?.sessionId).toBe('live');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
