/**
 * Exhibit contract test (PR #121 exhibits hardening).
 *
 * Pure (non-DOM) contract test for the exhibit vocabulary and fixture gallery.
 * Asserts the typed contracts from docs/plans/req-v1-curator.md §6 hold:
 *   - Every fixture artifact is a valid ExhibitArtifact (id, title, narrative, relevance, decayClass, status)
 *   - narrative is MANDATORY and non-empty (the bar the curator must clear)
 *   - relevance is in [0, 1]
 *   - exhibitType is in the v1 vocabulary (7 authored + live_graph)
 *   - decayClass and status are in their allowed sets
 *   - The fixture gallery covers the authored vocabulary
 *
 * This test does NOT mount React — it tests the data contracts the renderer
 * consumes. A DOM mount test belongs in a later PR once the live-exhibits hook
 * and a jsdom + testing-library setup land.
 */
import { describe, it, expect } from 'vitest'
import { fixtureGallery } from '../web/components/exhibits/fixture-gallery'
import {
  AUTHORED_EXHIBIT_TYPES,
  isExhibitOfType,
  isRetired,
  type ExhibitArtifact,
  type ExhibitType,
  type DecayClass,
  type ExhibitStatus,
} from '../web/components/exhibits/types'

const VALID_DECAY_CLASSES: DecayClass[] = ['fast', 'medium', 'slow']
const VALID_STATUSES: ExhibitStatus[] = ['fresh', 'active', 'stale', 'retired']
const ALL_TYPES: ExhibitType[] = [...AUTHORED_EXHIBIT_TYPES, 'live_graph']

function isString(v: unknown): v is string {
  return typeof v === 'string'
}
function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function assertValidArtifact(a: ExhibitArtifact): void {
  expect(isString(a.id) && a.id.length > 0).toBe(true)
  expect(isString(a.title) && a.title.length > 0).toBe(true)
  // MANDATORY narrative — the bar the curator must clear.
  expect(isString(a.narrative) && a.narrative.length > 0).toBe(true)
  expect(isNumber(a.relevance)).toBe(true)
  expect(a.relevance).toBeGreaterThanOrEqual(0)
  expect(a.relevance).toBeLessThanOrEqual(1)
  expect(VALID_DECAY_CLASSES).toContain(a.decayClass)
  expect(VALID_STATUSES).toContain(a.status)
  expect(isNumber(a.createdAtEvent)).toBe(true)
  expect(ALL_TYPES).toContain(a.exhibitType)
}

describe('exhibit vocabulary contract', () => {
  it('AUTHORED_EXHIBIT_TYPES has exactly the v1 seven (no live_graph)', () => {
    expect(AUTHORED_EXHIBIT_TYPES).toEqual([
      'relationship_dag',
      'activity_narrative',
      'walkthrough',
      'concern_snapshot',
      'momentum',
      'seismograph',
      'thermal_map',
    ])
    expect(AUTHORED_EXHIBIT_TYPES).not.toContain('live_graph')
  })

  it('type guards narrow correctly', () => {
    const dag = fixtureGallery.find((a) => a.exhibitType === 'relationship_dag')
    expect(dag).toBeTruthy()
    expect(isExhibitOfType(dag!, 'relationship_dag')).toBe(true)
    expect(isExhibitOfType(dag!, 'activity_narrative')).toBe(false)
  })

  it('isRetired identifies retired artifacts', () => {
    const retired = fixtureGallery.find((a) => a.status === 'retired')
    if (retired) {
      expect(isRetired(retired)).toBe(true)
    }
    const active = fixtureGallery.find((a) => a.status !== 'retired')
    if (active) {
      expect(isRetired(active)).toBe(false)
    }
  })
})

describe('fixture gallery contract', () => {
  it('is a non-empty array of valid ExhibitArtifact objects', () => {
    expect(Array.isArray(fixtureGallery)).toBe(true)
    expect(fixtureGallery.length).toBeGreaterThan(0)
    for (const a of fixtureGallery) {
      assertValidArtifact(a)
    }
  })

  it('every narrative is non-trivial (> 20 chars — not a placeholder)', () => {
    for (const a of fixtureGallery) {
      expect(a.narrative.length).toBeGreaterThan(20)
    }
  })

  it('covers at least 5 distinct exhibit types', () => {
    const types = new Set(fixtureGallery.map((a) => a.exhibitType))
    expect(types.size).toBeGreaterThanOrEqual(5)
  })

  it('ids are unique', () => {
    const ids = fixtureGallery.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('relevance values are spread (not all identical)', () => {
    const relevances = new Set(fixtureGallery.map((a) => a.relevance))
    expect(relevances.size).toBeGreaterThan(1)
  })
})
