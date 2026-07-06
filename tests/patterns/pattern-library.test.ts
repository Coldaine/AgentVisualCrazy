import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { createDatabase, type ShadowDatabase } from '../../src/db/database';
import { seedCraftedPatterns } from '../../src/patterns/seeds';
import {
  getActivePatterns,
  getPatternById,
  createPattern,
  promotePattern,
  demotePattern,
  proposeHarvestedPattern,
} from '../../src/patterns/pattern-library';
import { matchPatterns } from '../../src/patterns/pattern-matcher';

let db: ShadowDatabase;
let cleanupDir: string;

beforeAll(() => {
  cleanupDir = mkdtempSync(join(tmpdir(), 'shadow-agent-pat-test-'));
  db = createDatabase(join(cleanupDir, 'test.sqlite'));
});

afterAll(() => {
  db.close();
  rmSync(cleanupDir, { recursive: true, force: true });
});

describe('PatternLibrary', () => {
  it('seeds crafted patterns on first call', () => {
    seedCraftedPatterns(db);
    const patterns = getActivePatterns(db);
    expect(patterns.length).toBeGreaterThanOrEqual(4);
    const names = patterns.map((p) => p.name);
    expect(names).toContain('Tool Burst Collapse');
    expect(names).toContain('Risk Cluster Pin');
    expect(names).toContain('Phase Transition Highlight');
    expect(names).toContain('Exploration Summary');
  });

  it('does not duplicate seeds on second call', () => {
    seedCraftedPatterns(db);
    expect(getActivePatterns(db).length).toBeGreaterThanOrEqual(4);
  });

  it('creates a new pattern and retrieves it by ID', () => {
    const id = createPattern(db, {
      name: 'Custom Test',
      origin: 'crafted',
      status: 'active',
      trigger: { eventCountMin: 10, phase: 'implementation' },
      visual: { viewName: 'graph', emphasis: 'high' },
      description: 'Custom test pattern',
    });
    const retrieved = getPatternById(db, id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.name).toBe('Custom Test');
    expect(retrieved!.trigger.eventCountMin).toBe(10);
    expect(retrieved!.visual.viewName).toBe('graph');
  });

  it('proposes harvested pattern in review status', () => {
    const id = proposeHarvestedPattern(
      db,
      'Auto-detected Pattern',
      { toolBurstThreshold: 12 },
      { viewName: 'timeline' },
      'Harvested from session analysis',
    );
    const pat = getPatternById(db, id);
    expect(pat).not.toBeNull();
    expect(pat!.origin).toBe('harvested');
    expect(pat!.status).toBe('review');
  });

  it('promotes and demotes patterns', () => {
    const id = createPattern(db, {
      name: 'Promote Test', origin: 'crafted', status: 'draft',
      trigger: {}, visual: {}, description: '',
    });
    promotePattern(db, id);
    const promoted = getPatternById(db, id);
    expect(promoted!.status).toBe('active');

    demotePattern(db, id);
    const demoted = getPatternById(db, id);
    expect(demoted!.status).toBe('archived');
  });

  it('returns null for unknown pattern', () => {
    expect(getPatternById(db, 'nonexistent')).toBeNull();
  });
});

describe('PatternMatcher', () => {
  it('returns ranked matches for a context', () => {
    const patterns = getActivePatterns(db);
    const matches = matchPatterns(patterns, {
      eventCount: 30,
      kinds: ['tool_started', 'tool_completed', 'tool_started'],
      toolBurstCount: 10,
      riskSignalCount: 3,
      phase: 'exploration',
    });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].score).toBeGreaterThan(0);
  });

  it('returns empty for no match context', () => {
    const patterns = getActivePatterns(db);
    const matches = matchPatterns(patterns, {
      eventCount: 1,
      kinds: [],
      toolBurstCount: 0,
      riskSignalCount: 0,
      phase: 'observation',
    });
    expect(matches.length).toBe(0);
  });

  it('sorts by descending score', () => {
    const patterns = [
      { id: 'p1', name: 'A', trigger: { toolBurstThreshold: 3, phase: 'implementation' } },
      { id: 'p2', name: 'B', trigger: { toolBurstThreshold: 1 } },
    ].map((p) => ({
      ...p,
      origin: 'crafted' as const,
      status: 'active' as const,
      visual: {},
      description: '',
      trigger: p.trigger,
    }));
    const matches = matchPatterns(patterns, {
      eventCount: 5,
      kinds: [],
      toolBurstCount: 5,
      riskSignalCount: 0,
      phase: 'implementation',
    });
    expect(matches.length).toBe(2);
    expect(matches[0].score).toBeGreaterThanOrEqual(matches[1].score);
  });
});
