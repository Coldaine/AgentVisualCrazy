/**
 * Codex driver discovery tests (PR-2, plan-codex-replay.md D1).
 *
 * Mirrors discovery.test.ts's claude-code DiscoveryStrategy section.
 * Verifies:
 * - createCodexDiscovery walks CODEX_SESSIONS_DIR (or an explicit override)
 *   recursively for rollout-*.jsonl files
 * - sessionId = the UUID suffix of the filename, fallback full basename
 * - every discovered session carries source: 'codex-rollout'
 * - integrates with the generic dispatcher
 */
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCodexDiscovery } from '../../../src/capture/drivers/codex/discovery';
import { codexDriver } from '../../../src/capture/drivers/codex';
import { HarnessDriverRegistry } from '../../../src/capture/drivers/harness-driver';
import { discoverActiveSession } from '../../../src/capture/session-discovery';

describe('codex DiscoveryStrategy', () => {
  it('returns empty array when sessionsDir does not exist', async () => {
    const discovery = createCodexDiscovery({ sessionsDir: '/no/such/dir/xyz' });
    expect(await discovery.discoverSessions()).toEqual([]);
  });

  it('walks sessionsDir recursively for rollout-*.jsonl files', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'codex-discovery-'));
    try {
      const dayDir = path.join(root, '2026', '07', '23');
      mkdirSync(dayDir, { recursive: true });
      const rollout = path.join(
        dayDir,
        'rollout-2026-07-23T12-16-30-019f8ee7-e51f-7ed1-b650-b7fb11ffecda.jsonl'
      );
      const ignored = path.join(dayDir, 'notes.md');
      const nonRollout = path.join(dayDir, 'other-file.jsonl');
      writeFileSync(rollout, '{}\n');
      writeFileSync(ignored, 'x');
      writeFileSync(nonRollout, '{}\n');

      const discovery = createCodexDiscovery({ sessionsDir: root });
      const sessions = await discovery.discoverSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.filePath).toBe(rollout);
      expect(sessions[0]?.source).toBe('codex-rollout');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('extracts sessionId as the UUID suffix of the filename', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'codex-discovery-uuid-'));
    try {
      const file = path.join(root, 'rollout-2026-07-23T12-16-30-019f8ee7-e51f-7ed1-b650-b7fb11ffecda.jsonl');
      writeFileSync(file, '{}\n');
      const discovery = createCodexDiscovery({ sessionsDir: root });
      const sessions = await discovery.discoverSessions();
      expect(sessions[0]?.sessionId).toBe('019f8ee7-e51f-7ed1-b650-b7fb11ffecda');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('falls back to the full basename when no UUID suffix is present', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'codex-discovery-nouuid-'));
    try {
      const file = path.join(root, 'rollout-2026-07-23-homelab-coordinator.jsonl');
      writeFileSync(file, '{}\n');
      const discovery = createCodexDiscovery({ sessionsDir: root });
      const sessions = await discovery.discoverSessions();
      expect(sessions[0]?.sessionId).toBe('rollout-2026-07-23-homelab-coordinator');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('picks the most recently modified rollout file across the dispatcher', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'codex-discovery-latest-'));
    try {
      const older = path.join(root, 'rollout-2026-07-22T00-00-00-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jsonl');
      const newer = path.join(root, 'rollout-2026-07-23T00-00-00-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jsonl');
      writeFileSync(older, '{}\n');
      writeFileSync(newer, '{}\n');
      utimesSync(older, new Date(1000), new Date(1000));
      utimesSync(newer, new Date(2000), new Date(2000));

      const fakeCodexDriver = {
        ...codexDriver,
        discovery: createCodexDiscovery({ sessionsDir: root }),
      };
      const registry = new HarnessDriverRegistry().register(fakeCodexDriver);
      const result = await discoverActiveSession(undefined, { registry });
      expect(result?.filePath).toBe(newer);
      expect(result?.sessionId).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
      expect(result?.source).toBe('codex-rollout');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('codex discovery — CODEX_SESSIONS_DIR env override', () => {
  const ORIGINAL = process.env.CODEX_SESSIONS_DIR;
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'codex-discovery-env-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    if (ORIGINAL === undefined) {
      delete process.env.CODEX_SESSIONS_DIR;
    } else {
      process.env.CODEX_SESSIONS_DIR = ORIGINAL;
    }
  });

  it('honors CODEX_SESSIONS_DIR when no explicit sessionsDir option is given', async () => {
    const file = path.join(root, 'rollout-2026-07-23T00-00-00-cccccccc-cccc-cccc-cccc-cccccccccccc.jsonl');
    writeFileSync(file, '{}\n');
    process.env.CODEX_SESSIONS_DIR = root;

    // No sessionsDir override — must fall through to the env var.
    const discovery = createCodexDiscovery();
    const sessions = await discovery.discoverSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.filePath).toBe(file);
  });
});

describe('codex driver — registered in the driver registry', () => {
  it('is discoverable via id and source', async () => {
    const { driverRegistry } = await import('../../../src/capture/drivers');
    expect(driverRegistry.get('codex')).toBe(codexDriver);
    expect(driverRegistry.getForSource('codex-rollout')).toBe(codexDriver);
  });

  it('does not displace claude-code as the default driver', async () => {
    const { driverRegistry } = await import('../../../src/capture/drivers');
    expect(driverRegistry.getDefault().id).toBe('claude-code');
  });
});
