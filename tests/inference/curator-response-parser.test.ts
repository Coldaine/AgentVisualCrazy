import { describe, expect, it } from 'vitest';
import {
  parseCuratorResponse,
  parseModelResponse,
  validateExhibitArtifact,
} from '../../src/inference/response-parser';
import { createTestLogger } from '../../src/shared/logger';

const momentumArtifact = {
  id: 'session-momentum',
  exhibitType: 'momentum',
  title: 'Momentum: parked mid-path',
  narrative: 'Real progress on primitives, zero delivered outcomes.',
  relevance: 0.9,
  decayClass: 'medium',
  status: 'fresh',
  payload: {
    value: 44,
    label: 'Parked mid-path',
    stats: [{ label: 'PG18 image', value: 'complete', tone: 'positive' }],
    next: [{ title: 'Rotate FORGEJO token', evidence: 'exposed in-session', confidence: 88 }],
    curation: [],
  },
};

function curatorResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    pulse: { phase: 'debugging', phaseConfidence: 0.8, riskLevel: 'high', headline: 'Circling a 403 it cannot see past.' },
    galleryOps: [{ op: 'create', artifact: momentumArtifact }],
    ...overrides,
  });
}

describe('parseCuratorResponse — curator (v2) shape', () => {
  it('parses pulse and validated gallery ops', () => {
    const { pulse, galleryOps } = parseCuratorResponse(curatorResponse());
    expect(pulse).toEqual({
      phase: 'debugging',
      phaseConfidence: 0.8,
      riskLevel: 'high',
      headline: 'Circling a 403 it cannot see past.',
    });
    expect(galleryOps).toHaveLength(1);
    expect(galleryOps[0]).toMatchObject({ op: 'create', artifact: { id: 'session-momentum', exhibitType: 'momentum' } });
  });

  it('derives the legacy insight kinds from pulse + ops', () => {
    const { insights } = parseCuratorResponse(curatorResponse());
    const byKind = (k: string) => insights.filter((i) => i.kind === k);

    // pulse.phase → phase
    expect(byKind('phase')[0]).toMatchObject({ confidence: 0.8, structuredPayload: { phase: 'debugging' } });
    // pulse.riskLevel → risk (severity derived from riskLevel)
    expect(byKind('risk')[0]?.structuredPayload).toMatchObject({ riskLevel: 'high', severity: 'high' });
    // pulse.headline → objective
    expect(byKind('objective')[0]?.summary).toBe('Circling a 403 it cannot see past.');
    // created artifact title + narrative → summary
    expect(byKind('summary')[0]?.summary).toContain('Momentum: parked mid-path');
    expect(byKind('summary')[0]?.summary).toContain('Real progress on primitives');
    // momentum next[0] → next_move (0..100 confidence normalized to 0..1)
    expect(byKind('next_move')[0]).toMatchObject({ summary: 'Rotate FORGEJO token' });
    expect(byKind('next_move')[0]?.confidence).toBeCloseTo(0.88, 5);

    expect(insights.every((i) => i.source === 'model')).toBe(true);
  });

  it('parses retire ops with a reason', () => {
    const { galleryOps } = parseCuratorResponse(
      curatorResponse({ galleryOps: [{ op: 'retire', artifactId: 'old', reason: 'Superseded by the recovery walkthrough.' }] })
    );
    expect(galleryOps).toEqual([{ op: 'retire', artifactId: 'old', reason: 'Superseded by the recovery walkthrough.' }]);
  });

  it('treats an empty galleryOps as a legitimate no-op answer', () => {
    const { galleryOps, pulse } = parseCuratorResponse(curatorResponse({ galleryOps: [] }));
    expect(galleryOps).toEqual([]);
    expect(pulse?.phase).toBe('debugging');
  });

  it('drops invalid artifacts with a logged warning, keeping valid ones', () => {
    const log = createTestLogger();
    const response = JSON.stringify({
      pulse: { phase: 'implementation', phaseConfidence: 0.6 },
      galleryOps: [
        { op: 'create', artifact: { ...momentumArtifact, id: 'good' } },
        { op: 'create', artifact: { ...momentumArtifact, id: 'no-narrative', narrative: '' } },
        { op: 'create', artifact: { ...momentumArtifact, id: 'bad-type', exhibitType: 'hologram' } },
        { op: 'create', artifact: { ...momentumArtifact, id: 'bad-payload', payload: { label: 'x' } } },
      ],
    });
    const { galleryOps } = parseCuratorResponse(response, log);
    expect(galleryOps.map((o) => (o.op === 'create' ? o.artifact.id : ''))).toEqual(['good']);

    const drops = log.getRecent().filter((e) => e.event === 'response_parser.artifact_invalid');
    expect(drops.length).toBe(3);
    expect(drops.map((d) => d.context?.reason)).toEqual(
      expect.arrayContaining(['missing_narrative', 'bad_exhibit_type', 'bad_payload'])
    );
  });
});

describe('parseCuratorResponse — legacy (v1) fallback', () => {
  it('parses the old flat shape when no pulse/galleryOps present', () => {
    const legacy = JSON.stringify({
      phase: 'implementation',
      phaseConfidence: 0.85,
      riskLevel: 'low',
      riskSignals: [{ signal: 'Repeated reads', severity: 'medium', confidence: 0.6 }],
      predictedNextAction: 'Run tests',
      observations: ['Created 3 files'],
      attention: { primaryFile: 'src/x.ts', intent: 'Add feature' },
    });
    const { insights, pulse, galleryOps } = parseCuratorResponse(legacy);
    expect(pulse).toBeNull();
    expect(galleryOps).toEqual([]);
    expect(insights.some((i) => i.kind === 'phase')).toBe(true);
    expect(insights.some((i) => i.kind === 'risk')).toBe(true);
    expect(insights.find((i) => i.kind === 'next_move')?.summary).toBe('Run tests');
    expect(insights.find((i) => i.kind === 'objective')?.summary).toBe('Add feature');
  });

  it('parseModelResponse delegates to the curator parse and returns only insights', () => {
    const insights = parseModelResponse(curatorResponse());
    expect(insights.some((i) => i.kind === 'phase')).toBe(true);
    expect(insights.some((i) => i.kind === 'next_move')).toBe(true);
  });

  it('returns empty results for unparseable output', () => {
    expect(parseCuratorResponse('not json')).toEqual({ insights: [], pulse: null, galleryOps: [] });
  });
});

describe('validateExhibitArtifact', () => {
  const dag = {
    id: 'd',
    exhibitType: 'relationship_dag',
    title: 'Map',
    narrative: 'The shape of the session.',
    relevance: 0.7,
    decayClass: 'slow',
    status: 'active',
    payload: { nodes: [], edges: [], focusNodeId: 'x' },
  };

  it('accepts a structurally valid artifact and normalizes the envelope', () => {
    const a = validateExhibitArtifact(dag)!;
    expect(a).not.toBeNull();
    expect(a.exhibitType).toBe('relationship_dag');
    expect(a.relevance).toBe(0.7);
  });

  it('defaults out-of-range/missing envelope scalars rather than dropping', () => {
    const a = validateExhibitArtifact({ ...dag, relevance: 5, decayClass: 'glacial', status: 'retired' })!;
    expect(a.relevance).toBe(1); // clamped
    expect(a.decayClass).toBe('medium'); // invalid → default
    expect(a.status).toBe('fresh'); // 'retired' is not model-authorable
  });

  it('rejects an unknown exhibit type', () => {
    expect(validateExhibitArtifact({ ...dag, exhibitType: 'nope' })).toBeNull();
  });

  it('rejects a payload missing required collections', () => {
    expect(validateExhibitArtifact({ ...dag, payload: { focusNodeId: 'x' } })).toBeNull();
  });

  it('rejects missing id / title / narrative', () => {
    expect(validateExhibitArtifact({ ...dag, id: '' })).toBeNull();
    expect(validateExhibitArtifact({ ...dag, title: '' })).toBeNull();
    expect(validateExhibitArtifact({ ...dag, narrative: '' })).toBeNull();
  });
});
