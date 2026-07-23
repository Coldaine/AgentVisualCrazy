import { describe, it, expect } from 'vitest';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runReplay,
  loadEvents,
  scoreCheckpoints,
  DEFAULT_CHECKPOINTS,
  type Checkpoint,
} from '../../src/replay/replay-runner';
import { detectReplayFormat, parseReplay } from '../../src/shared/replay-store';
import type { CanonicalEvent, ShadowInsight } from '../../src/shared/schema';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  HERE,
  '../fixtures/transcripts/codex/rollout-2026-07-23-homelab-coordinator.jsonl',
);

/** A small synthetic canonical event stream for speed-invariance testing. */
function syntheticEvents(): CanonicalEvent[] {
  const start = Date.parse('2026-01-01T00:00:00.000Z');
  const spanMs = 5 * 60_000; // 5 virtual minutes
  const count = 30;
  const events: CanonicalEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    const ts = new Date(start + Math.round((spanMs * i) / (count - 1))).toISOString();
    // Sprinkle a couple of immediate-kind events so trigger firings are non-trivial.
    const kind: CanonicalEvent['kind'] = i === 12 ? 'tool_failed' : i === 25 ? 'agent_completed' : 'message';
    events.push({
      id: `synthetic:${i}`,
      sessionId: 'synthetic-session',
      source: 'codex-rollout',
      timestamp: ts,
      actor: i % 2 === 0 ? 'agent' : 'user',
      kind,
      payload: kind === 'message' ? { text: `event ${i}` } : { toolName: 'bash', toolUseId: `t${i}` },
      harnessId: 'codex',
    });
  }
  return events;
}

describe('replay-runner determinism', () => {
  it('produces identical determinism hashes and trigger firings across two speed-0 runs', async () => {
    const runA = await runReplay({ filePath: FIXTURE, speed: 0, infer: 'none' });
    const runB = await runReplay({ filePath: FIXTURE, speed: 0, infer: 'none' });

    expect(runA.determinismHash).toBe(runB.determinismHash);
    expect(runA.meta.events).toBe(runB.meta.events);
    expect(runA.meta.events).toBeGreaterThan(0);

    const firingsA = runA.triggers.map((t) => `${t.eventIndex}:${t.reason}`);
    const firingsB = runB.triggers.map((t) => `${t.eventIndex}:${t.reason}`);
    expect(firingsA).toEqual(firingsB);
    expect(firingsA.length).toBeGreaterThan(0);
  }, 60_000);
});

describe('replay-runner speed invariance', () => {
  it('produces the identical trigger sequence at speed 0 and a high speed', async () => {
    const events = syntheticEvents();
    const slow = await runReplay({ events, speed: 100_000, infer: 'none' });
    const fast = await runReplay({ events, speed: 0, infer: 'none' });

    expect(slow.determinismHash).toBe(fast.determinismHash);
    const firingsSlow = slow.triggers.map((t) => `${t.eventIndex}:${t.reason}`);
    const firingsFast = fast.triggers.map((t) => `${t.eventIndex}:${t.reason}`);
    expect(firingsSlow).toEqual(firingsFast);
    // The two immediate-kind events must both force a firing.
    expect(firingsFast.some((f) => f.endsWith('immediate_kind'))).toBe(true);
  }, 30_000);
});

describe('replay-runner report + export', () => {
  it('reports aggregates and scores every ground-truth checkpoint', async () => {
    const report = await runReplay({ filePath: FIXTURE, speed: 0, infer: 'none' });

    expect(report.meta.driver).toBe('codex');
    expect(report.aggregates.events).toBe(report.meta.events);
    expect(report.aggregates.triggersFired).toBeGreaterThan(0);
    expect(report.checkpoints).toHaveLength(4);

    for (const cp of report.checkpoints) {
      expect(cp.groundTruthVirtualMs).toBe(Date.parse(cp.groundTruthUtc));
    }

    // The semantic checkpoints (a scope-drift abort, a false "done" claim) are
    // NOT recoverable by deriveState heuristics — surfacing them is exactly the
    // job of live inference (plan-codex-replay.md D3). The report makes that
    // blind spot explicit rather than guessing.
    const abort = report.checkpoints.find((c) => c.id === 'scope_drift_abort')!;
    const notDone = report.checkpoints.find((c) => c.id === 'final_not_done')!;
    expect(abort.surfaced).toBe(false);
    expect(notDone.surfaced).toBe(false);
  }, 60_000);

  it('exports normalized CanonicalEvents that the replay parser can reload', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'replay-runner-test-'));
    const exportPath = path.join(dir, 'out.replay.jsonl');
    const reportPath = path.join(dir, 'report.json');
    try {
      const report = await runReplay({
        filePath: FIXTURE,
        speed: 0,
        infer: 'none',
        exportReplayPath: exportPath,
        reportPath,
      });

      const exported = await readFile(exportPath, 'utf8');
      expect(detectReplayFormat(exported)).toBe('replay');
      const reloaded = parseReplay(exported);
      expect(reloaded).toHaveLength(report.meta.events);
      expect(reloaded[0].id.startsWith('codex:')).toBe(true);

      const writtenReport = JSON.parse(await readFile(reportPath, 'utf8'));
      expect(writtenReport.determinismHash).toBe(report.determinismHash);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('loadEvents driver routing', () => {
  it('routes a raw codex transcript through the codex driver with deterministic ids', async () => {
    const raw = await readFile(FIXTURE, 'utf8');
    const a = loadEvents(raw, FIXTURE);
    const b = loadEvents(raw, FIXTURE);
    expect(a.driverId).toBe('codex');
    expect(a.events.length).toBeGreaterThan(0);
    expect(a.events.map((e) => e.id)).toEqual(b.events.map((e) => e.id));
    expect(a.events[0].id.startsWith('codex:')).toBe(true);
  });

  it('parses an already-normalized replay stream without a driver', () => {
    const events: CanonicalEvent[] = [
      {
        id: 'x:1',
        sessionId: 's',
        source: 'codex-rollout',
        timestamp: '2026-01-01T00:00:00.000Z',
        actor: 'agent',
        kind: 'message',
        payload: { text: 'hi' },
        harnessId: 'codex',
      },
    ];
    const jsonl = events.map((e) => JSON.stringify(e)).join('\n');
    const loaded = loadEvents(jsonl, 'x.replay.jsonl');
    expect(loaded.events).toHaveLength(1);
    expect(loaded.driverId).toBe('codex');
  });
});

describe('scoreCheckpoints', () => {
  const makeInsight = (summary: string, kind: ShadowInsight['kind'] = 'risk'): ShadowInsight => ({
    kind,
    source: 'heuristic',
    confidence: 0.6,
    scope: 'session',
    summary,
    evidenceEventIds: [],
  });

  it('reports the first matching insight and computes lead in virtual minutes', () => {
    const gt = Date.parse('2026-07-23T16:12:10.188Z');
    const early = gt - 5 * 60_000; // surfaced 5 min before the human moment
    const later = gt + 2 * 60_000;
    const observations = [
      { virtualMs: later, insight: makeInsight('agent is stuck retrying the same lookup') },
      { virtualMs: early, insight: makeInsight('repeated near-identical search queries detected') },
    ];
    const results = scoreCheckpoints(DEFAULT_CHECKPOINTS, observations);
    const ghcr = results.find((r) => r.id === 'ghcr_stall')!;
    expect(ghcr.surfaced).toBe(true);
    expect(ghcr.firstInsightVirtualMs).toBe(early); // earliest match wins
    expect(ghcr.leadMinutes).toBeCloseTo(5, 5);
  });

  it('marks a checkpoint unsurfaced when nothing matches', () => {
    const results = scoreCheckpoints(DEFAULT_CHECKPOINTS, [
      { virtualMs: 0, insight: makeInsight('current phase appears to be exploration', 'phase') },
    ]);
    const abort = results.find((r) => r.id === 'scope_drift_abort')!;
    expect(abort.surfaced).toBe(false);
    expect(abort.leadMinutes).toBeNull();
    expect(abort.matchedBy).toBeNull();
  });

  it('reports negative lead (lag) when the insight surfaces after the moment', () => {
    const gt = Date.parse('2026-07-23T13:39:12.004Z');
    const late = gt + 10 * 60_000;
    const custom: Checkpoint[] = DEFAULT_CHECKPOINTS.filter((c) => c.id === 'plan_pivot');
    const results = scoreCheckpoints(custom, [
      { virtualMs: late, insight: makeInsight('the agent has pivoted to a new plan', 'summary') },
    ]);
    expect(results[0].surfaced).toBe(true);
    expect(results[0].leadMinutes).toBeCloseTo(-10, 5);
  });

  it('ignores verbatim objective-echo insights when matching', () => {
    const custom: Checkpoint[] = DEFAULT_CHECKPOINTS.filter((c) => c.id === 'plan_pivot');
    // Same text that would match, but as an `objective` echo of the user goal —
    // must not count as the interpreter surfacing the pivot.
    const results = scoreCheckpoints(custom, [
      { virtualMs: 0, insight: makeInsight('write a new plan for the databases', 'objective') },
    ]);
    expect(results[0].surfaced).toBe(false);
  });
});
