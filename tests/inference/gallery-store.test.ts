import { describe, expect, it } from 'vitest';
import { createGalleryStore, STALENESS_THRESHOLDS, type GalleryOp } from '../../src/inference/gallery-store';
import type { DecayClass, ExhibitArtifact } from '../../src/renderer/exhibits/types';

function artifact(id: string, overrides: Partial<ExhibitArtifact> = {}): ExhibitArtifact {
  return {
    id,
    exhibitType: 'activity_narrative',
    title: `Exhibit ${id}`,
    narrative: `Why ${id} is on the floor.`,
    relevance: 0.5,
    decayClass: 'medium',
    createdAtEvent: 0,
    status: 'fresh',
    payload: { beats: [], threads: [] },
    ...overrides,
  } as ExhibitArtifact;
}

const create = (a: ExhibitArtifact): GalleryOp => ({ op: 'create', artifact: a });
const refresh = (a: ExhibitArtifact): GalleryOp => ({ op: 'refresh', artifact: a });
const retire = (artifactId: string, reason: string): GalleryOp => ({ op: 'retire', artifactId, reason });

describe('GalleryStore — op application', () => {
  it('creates artifacts as fresh, stamping create/refresh event', () => {
    const store = createGalleryStore();
    const result = store.applyOps([create(artifact('a')), create(artifact('b'))], 7, 0);

    expect(result.created).toEqual(['a', 'b']);
    const active = store.getActive();
    expect(active.map((x) => x.id).sort()).toEqual(['a', 'b']);
    const a = active.find((x) => x.id === 'a')!;
    expect(a.status).toBe('fresh');
    expect(a.createdAtEvent).toBe(7);
    expect(a.refreshedAtEvent).toBe(7);
  });

  it('promotes surviving fresh exhibits to active on the next packet', () => {
    const store = createGalleryStore();
    store.applyOps([create(artifact('a'))], 0, 0);
    expect(store.getActive()[0].status).toBe('fresh');

    store.applyOps([], 1, 0); // a subsequent packet with no ops
    expect(store.getActive()[0].status).toBe('active');
  });

  it('refresh replaces by id, preserves createdAtEvent, re-stamps refreshedAtEvent, returns to active', () => {
    const store = createGalleryStore();
    store.applyOps([create(artifact('a', { relevance: 0.4 }))], 3, 0);
    const result = store.applyOps(
      [refresh(artifact('a', { relevance: 0.9, narrative: 'Updated read.' }))],
      12,
      0
    );

    expect(result.refreshed).toEqual(['a']);
    const a = store.getActive()[0];
    expect(a.createdAtEvent).toBe(3);
    expect(a.refreshedAtEvent).toBe(12);
    expect(a.relevance).toBe(0.9);
    expect(a.narrative).toBe('Updated read.');
    expect(a.status).toBe('active');
  });

  it('tolerates a refresh of an unknown id as a create', () => {
    const store = createGalleryStore();
    const result = store.applyOps([refresh(artifact('ghost'))], 5, 0);
    expect(result.created).toEqual(['ghost']);
    expect(store.getActive().map((x) => x.id)).toEqual(['ghost']);
  });

  it('sorts active exhibits by relevance descending', () => {
    const store = createGalleryStore();
    store.applyOps(
      [create(artifact('lo', { relevance: 0.2 })), create(artifact('hi', { relevance: 0.95 }))],
      0,
      0
    );
    expect(store.getActive().map((x) => x.id)).toEqual(['hi', 'lo']);
  });
});

describe('GalleryStore — retire / archive', () => {
  it('retires an artifact, keeping it with its reason off the active floor', () => {
    const store = createGalleryStore();
    store.applyOps([create(artifact('a'))], 0, 0);
    const result = store.applyOps([retire('a', 'Storyline resolved at 16:26.')], 4, 0);

    expect(result.retired).toEqual(['a']);
    expect(store.getActive()).toHaveLength(0);
    const retired = store.getRetired();
    expect(retired).toHaveLength(1);
    expect(retired[0].status).toBe('retired');
    expect(retired[0].retirementReason).toBe('Storyline resolved at 16:26.');
    expect(store.getRetiredSummaries()).toEqual([{ id: 'a', reason: 'Storyline resolved at 16:26.' }]);
  });

  it('getArtifacts lists retired after active', () => {
    const store = createGalleryStore();
    store.applyOps([create(artifact('a', { relevance: 0.3 })), create(artifact('b', { relevance: 0.8 }))], 0, 0);
    store.applyOps([retire('b', 'Superseded.')], 1, 0);
    const all = store.getArtifacts();
    expect(all.map((x) => x.status)).toEqual(['active', 'retired']);
    expect(all.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('records a retire of an unknown id as ignored but keeps the reason as feedback', () => {
    const store = createGalleryStore();
    const result = store.applyOps([retire('never-existed', 'n/a')], 2, 0);
    expect(result.ignored).toBe(1);
    expect(result.retired).toEqual([]);
    expect(store.getRetiredSummaries()).toEqual([{ id: 'never-existed', reason: 'n/a' }]);
  });
});

describe('GalleryStore — staleness by decayClass', () => {
  const stale = (decayClass: DecayClass, atEvent: number, nowMs: number): string => {
    const store = createGalleryStore();
    store.applyOps([create(artifact('a', { decayClass }))], 0, 0);
    store.applyOps([], 1, 0); // promote fresh → active
    store.refreshStaleness(atEvent, nowMs);
    return store.getActive()[0].status;
  };

  it('marks a fast exhibit stale past its event budget', () => {
    expect(stale('fast', STALENESS_THRESHOLDS.fast.events + 1, 0)).toBe('stale');
    expect(stale('fast', STALENESS_THRESHOLDS.fast.events - 1, 0)).toBe('active');
  });

  it('marks a fast exhibit stale past its minute budget even with no new events', () => {
    const overMinutes = (STALENESS_THRESHOLDS.fast.minutes + 1) * 60_000;
    expect(stale('fast', 2, overMinutes)).toBe('stale');
  });

  it('keeps a slow exhibit active where a fast one would have staled', () => {
    const atEvent = STALENESS_THRESHOLDS.fast.events + 5;
    expect(stale('fast', atEvent, 0)).toBe('stale');
    expect(stale('slow', atEvent, 0)).toBe('active');
  });

  it('never stales a still-fresh exhibit', () => {
    const store = createGalleryStore();
    store.applyOps([create(artifact('a', { decayClass: 'fast' }))], 0, 0);
    store.refreshStaleness(9999, 9_999_999); // fresh is exempt until promoted
    expect(store.getActive()[0].status).toBe('fresh');
  });

  it('a refresh un-stales an aged exhibit', () => {
    const store = createGalleryStore();
    store.applyOps([create(artifact('a', { decayClass: 'fast' }))], 0, 0);
    store.applyOps([], 1, 0);
    store.refreshStaleness(STALENESS_THRESHOLDS.fast.events + 2, 0);
    expect(store.getActive()[0].status).toBe('stale');
    store.applyOps([refresh(artifact('a', { decayClass: 'fast' }))], STALENESS_THRESHOLDS.fast.events + 2, 0);
    expect(store.getActive()[0].status).toBe('active');
  });
});
