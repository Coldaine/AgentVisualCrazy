import { describe, expect, it } from 'vitest';
import {
  AUTHORED_EXHIBIT_TYPES,
  isActivityNarrative,
  isConcernSnapshot,
  isExhibitOfType,
  isLiveGraph,
  isMomentum,
  isRelationshipDag,
  isRetired,
  isSeismograph,
  isThermalMap,
  isWalkthrough,
  type ExhibitArtifact,
} from '../../../src/renderer/exhibits/types';
import fixtureGallery from '../../../src/renderer/exhibits/fixture-gallery';

function envelope<T extends ExhibitArtifact['exhibitType']>(
  exhibitType: T,
  payload: Extract<ExhibitArtifact, { exhibitType: T }>['payload']
): ExhibitArtifact {
  return {
    id: `${exhibitType}-1`,
    exhibitType,
    title: 't',
    narrative: 'n',
    relevance: 0.5,
    decayClass: 'medium',
    createdAtEvent: 1,
    status: 'active',
    payload,
  } as ExhibitArtifact;
}

describe('exhibit type guards', () => {
  it('narrows each authored type to exactly one guard', () => {
    const cases: Array<[ExhibitArtifact, (a: ExhibitArtifact) => boolean]> = [
      [envelope('relationship_dag', { nodes: [], edges: [], focusNodeId: '' }), isRelationshipDag],
      [envelope('activity_narrative', { beats: [], threads: [] }), isActivityNarrative],
      [envelope('walkthrough', { headline: '', body: '', tags: [], satellites: [], files: [] }), isWalkthrough],
      [envelope('concern_snapshot', { concerns: [], flows: [] }), isConcernSnapshot],
      [envelope('momentum', { value: 0, label: '', stats: [], next: [], curation: [] }), isMomentum],
      [envelope('seismograph', { trace: [], annotations: [], windowMinutes: 60 }), isSeismograph],
      [envelope('thermal_map', { cells: [], hottest: { path: '', why: '' } }), isThermalMap],
      [envelope('live_graph', {}), isLiveGraph],
    ];

    const guards = cases.map(([, guard]) => guard);
    for (const [artifact, ownGuard] of cases) {
      expect(ownGuard(artifact)).toBe(true);
      const others = guards.filter((g) => g !== ownGuard);
      for (const other of others) {
        expect(other(artifact)).toBe(false);
      }
    }
  });

  it('isExhibitOfType narrows generically', () => {
    const dag = envelope('relationship_dag', { nodes: [], edges: [], focusNodeId: '' });
    expect(isExhibitOfType(dag, 'relationship_dag')).toBe(true);
    expect(isExhibitOfType(dag, 'momentum')).toBe(false);
  });

  it('isRetired reflects status', () => {
    const active = envelope('live_graph', {});
    expect(isRetired(active)).toBe(false);
    expect(isRetired({ ...active, status: 'retired' })).toBe(true);
  });

  it('AUTHORED_EXHIBIT_TYPES excludes live_graph and lists the seven authored types', () => {
    expect(AUTHORED_EXHIBIT_TYPES).toHaveLength(7);
    expect(AUTHORED_EXHIBIT_TYPES).not.toContain('live_graph');
  });

  it('the fixture gallery is internally consistent', () => {
    // Unique ids, mandatory narrative, relevance in range, at least one retired.
    const ids = new Set(fixtureGallery.map((a) => a.id));
    expect(ids.size).toBe(fixtureGallery.length);
    for (const artifact of fixtureGallery) {
      expect(artifact.narrative.length).toBeGreaterThan(20);
      expect(artifact.relevance).toBeGreaterThanOrEqual(0);
      expect(artifact.relevance).toBeLessThanOrEqual(1);
    }
    expect(fixtureGallery.some(isRetired)).toBe(true);
    expect(fixtureGallery.some(isLiveGraph)).toBe(true);
  });
});
