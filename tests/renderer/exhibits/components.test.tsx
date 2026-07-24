// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RelationshipDag from '../../../src/renderer/exhibits/RelationshipDag';
import ActivityNarrative from '../../../src/renderer/exhibits/ActivityNarrative';
import Walkthrough from '../../../src/renderer/exhibits/Walkthrough';
import ConcernSnapshot from '../../../src/renderer/exhibits/ConcernSnapshot';
import Momentum from '../../../src/renderer/exhibits/Momentum';
import Seismograph from '../../../src/renderer/exhibits/Seismograph';
import ThermalMap from '../../../src/renderer/exhibits/ThermalMap';
import type { ExhibitArtifactOf } from '../../../src/renderer/exhibits/types';

function base<T extends string>(exhibitType: T) {
  return {
    id: `${exhibitType}-1`,
    exhibitType,
    title: `Title ${exhibitType}`,
    narrative: 'A narrative that explains what it means.',
    relevance: 0.7,
    decayClass: 'medium' as const,
    createdAtEvent: 1,
    status: 'active' as const,
  };
}

describe('exhibit components render their key content', () => {
  it('RelationshipDag shows nodes, edge labels, and the focused note', () => {
    const artifact: ExhibitArtifactOf<'relationship_dag'> = {
      ...base('relationship_dag'),
      exhibitType: 'relationship_dag',
      payload: {
        focusNodeId: 'a',
        nodes: [
          { id: 'a', title: 'Alpha node', subtitle: 'sub a', kind: 'goal', x: 25, y: 40, note: 'Why alpha matters.' },
          { id: 'b', title: 'Beta node', subtitle: 'sub b', kind: 'incident', x: 70, y: 55, note: 'Beta note.', urgent: true },
        ],
        edges: [{ from: 'a', to: 'b', label: 'blocks', strong: true }],
      },
    };
    render(<RelationshipDag payload={artifact.payload} artifact={artifact} />);
    // Alpha is the focused node, so its title appears in the node and focus card.
    expect(screen.getAllByText('Alpha node').length).toBeGreaterThan(0);
    expect(screen.getByText('Beta node')).toBeInTheDocument();
    expect(screen.getByText('blocks')).toBeInTheDocument();
    expect(screen.getByText('urgent')).toBeInTheDocument();
    expect(screen.getByText('Why alpha matters.')).toBeInTheDocument();
  });

  it('ActivityNarrative shows beats and thread labels', () => {
    const artifact: ExhibitArtifactOf<'activity_narrative'> = {
      ...base('activity_narrative'),
      exhibitType: 'activity_narrative',
      payload: {
        threads: [{ id: 'th', label: 'primary thread', color: 'rgba(1,2,3,0.5)' }],
        beats: [
          { at: '08:39', title: 'First beat', body: 'body one', side: 'top', thread: 'th' },
          { at: '09:04', title: 'Second beat', body: 'body two', side: 'bottom', thread: 'th' },
        ],
      },
    };
    render(<ActivityNarrative payload={artifact.payload} artifact={artifact} />);
    expect(screen.getByText('First beat')).toBeInTheDocument();
    expect(screen.getByText('Second beat')).toBeInTheDocument();
    expect(screen.getAllByText('thread · th').length).toBe(2);
  });

  it('Walkthrough shows the headline, tags, satellites, and files', () => {
    const artifact: ExhibitArtifactOf<'walkthrough'> = {
      ...base('walkthrough'),
      exhibitType: 'walkthrough',
      payload: {
        headline: 'The pivotal turn',
        body: 'body copy',
        tags: [{ label: 'match · scope', kind: 'match' }],
        satellites: [{ id: 's1', label: 'step one', note: 'did a thing', x: 30, y: 30 }],
        files: [{ label: 'src/thing.ts', x: 50, y: 20 }],
      },
    };
    render(<Walkthrough payload={artifact.payload} artifact={artifact} />);
    expect(screen.getByText('The pivotal turn')).toBeInTheDocument();
    expect(screen.getByText('match · scope')).toBeInTheDocument();
    expect(screen.getByText('step one')).toBeInTheDocument();
    expect(screen.getByText('src/thing.ts')).toBeInTheDocument();
  });

  it('ConcernSnapshot shows concern titles and roles', () => {
    const artifact: ExhibitArtifactOf<'concern_snapshot'> = {
      ...base('concern_snapshot'),
      exhibitType: 'concern_snapshot',
      payload: {
        concerns: [
          { id: 'c1', title: 'Image build', role: 'the unblock', x: 10, y: 16, w: 24, h: 22, heat: 'very-high' },
          { id: 'c2', title: 'Cutovers', role: 'not started', x: 60, y: 16, w: 24, h: 22, heat: 'low' },
        ],
        flows: [['c1', 'c2']],
      },
    };
    render(<ConcernSnapshot payload={artifact.payload} artifact={artifact} />);
    // Image build is the selected concern, so it appears in the box and focus card.
    expect(screen.getAllByText('Image build').length).toBeGreaterThan(0);
    expect(screen.getByText('Cutovers')).toBeInTheDocument();
    // role appears both in the box and the focus card
    expect(screen.getAllByText('the unblock').length).toBeGreaterThan(0);
  });

  it('Momentum shows the label, stats, and next items', () => {
    const artifact: ExhibitArtifactOf<'momentum'> = {
      ...base('momentum'),
      exhibitType: 'momentum',
      payload: {
        value: 44,
        label: 'Parked mid-path',
        stats: [{ label: 'Cutovers', value: 'not started', tone: 'negative' }],
        next: [{ title: 'Rotate the token', evidence: 'exposed in-session', confidence: 88 }],
        curation: [{ artifactId: 'x', action: 'retire', reason: 'stopped mattering' }],
      },
    };
    render(<Momentum payload={artifact.payload} artifact={artifact} />);
    expect(screen.getByText('Parked mid-path')).toBeInTheDocument();
    expect(screen.getByText('not started')).toBeInTheDocument();
    expect(screen.getByText('Rotate the token')).toBeInTheDocument();
    expect(screen.getByText('88%')).toBeInTheDocument();
  });

  it('Seismograph shows tremor labels and the window chip', () => {
    const artifact: ExhibitArtifactOf<'seismograph'> = {
      ...base('seismograph'),
      exhibitType: 'seismograph',
      payload: {
        windowMinutes: 190,
        trace: [
          { at: '10:12', magnitude: -0.9, kind: 'failure', label: 'GHCR 403 stall' },
          { at: '11:20', magnitude: 0.6, kind: 'merge', label: 'recovery proven' },
        ],
        annotations: [{ at: '10:12', text: 'credential wall' }],
      },
    };
    render(<Seismograph payload={artifact.payload} artifact={artifact} />);
    expect(screen.getByText('GHCR 403 stall')).toBeInTheDocument();
    expect(screen.getByText('recovery proven')).toBeInTheDocument();
    expect(screen.getByText('190 min window')).toBeInTheDocument();
  });

  it('ThermalMap shows cells and the hottest callout', () => {
    const artifact: ExhibitArtifactOf<'thermal_map'> = {
      ...base('thermal_map'),
      exhibitType: 'thermal_map',
      payload: {
        cells: [
          { path: 'db/image', weight: 5, heat: 0.95, label: 'image' },
          { path: 'db/cutover', weight: 2, heat: 0.1, label: 'cutover' },
        ],
        hottest: { path: 'db/image', why: 'most attention spent here' },
      },
    };
    render(<ThermalMap payload={artifact.payload} artifact={artifact} />);
    expect(screen.getByText('image')).toBeInTheDocument();
    expect(screen.getByText('cutover')).toBeInTheDocument();
    expect(screen.getByText('most attention spent here')).toBeInTheDocument();
  });
});
