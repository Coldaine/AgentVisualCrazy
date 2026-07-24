// @vitest-environment jsdom

import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExhibitStage from '../../../src/renderer/exhibits/ExhibitStage';
import fixtureGallery from '../../../src/renderer/exhibits/fixture-gallery';
import type { ExhibitArtifact } from '../../../src/renderer/exhibits/types';

function railTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.exhibit-rail__title')).map((el) => el.textContent ?? '');
}

function mainTitle(container: HTMLElement): string {
  return container.querySelector('.exhibit-main__title')?.textContent ?? '';
}

function pillText(container: HTMLElement): string {
  return container.querySelector('.exhibit-pill')?.textContent ?? '';
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ExhibitStage', () => {
  it('renders the fixture gallery, leading with the highest-relevance exhibit', () => {
    const { container } = render(<ExhibitStage />);
    const activeSorted = fixtureGallery
      .filter((a) => a.status !== 'retired')
      .sort((a, b) => b.relevance - a.relevance);
    // The main frame opens on the most relevant exhibit.
    expect(mainTitle(container)).toBe(activeSorted[0].title);
    // The rail lists more than one exhibit.
    expect(railTitles(container).length).toBeGreaterThan(3);
  });

  it('orders the rail (rotation) by descending relevance', () => {
    const { container } = render(<ExhibitStage />);
    const expected = fixtureGallery
      .filter((a) => a.status !== 'retired')
      .sort((a, b) => b.relevance - a.relevance)
      .map((a) => a.title);
    expect(railTitles(container)).toEqual(expected);
  });

  it('advances through the rotation in relevance order on manual next', () => {
    const { container } = render(<ExhibitStage />);
    const expected = fixtureGallery
      .filter((a) => a.status !== 'retired')
      .sort((a, b) => b.relevance - a.relevance)
      .map((a) => a.title);
    expect(mainTitle(container)).toBe(expected[0]);
    fireEvent.click(container.querySelector('[aria-label="Next exhibit"]') as Element);
    expect(mainTitle(container)).toBe(expected[1]);
  });

  it('auto-cycles on an 8s idle timer to the next exhibit', () => {
    vi.useFakeTimers();
    const { container } = render(<ExhibitStage />);
    const expected = fixtureGallery
      .filter((a) => a.status !== 'retired')
      .sort((a, b) => b.relevance - a.relevance)
      .map((a) => a.title);
    expect(mainTitle(container)).toBe(expected[0]);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(mainTitle(container)).toBe(expected[1]);
  });

  it('pauses cycling on hover and resumes on leave (with a visible pill)', () => {
    const { container } = render(<ExhibitStage />);
    const stage = container.querySelector('.exhibit-stage') as HTMLElement;
    expect(pillText(container)).toBe('cycling');
    fireEvent.mouseEnter(stage);
    expect(pillText(container)).toBe('paused');
    fireEvent.mouseLeave(stage);
    expect(pillText(container)).toBe('cycling');
  });

  it('does not auto-advance while paused', () => {
    vi.useFakeTimers();
    const { container } = render(<ExhibitStage />);
    const stage = container.querySelector('.exhibit-stage') as HTMLElement;
    const expected = fixtureGallery
      .filter((a) => a.status !== 'retired')
      .sort((a, b) => b.relevance - a.relevance)
      .map((a) => a.title);
    fireEvent.mouseEnter(stage);
    act(() => {
      vi.advanceTimersByTime(24000);
    });
    expect(mainTitle(container)).toBe(expected[0]);
  });

  it('collapses retired artifacts into the archive shelf, out of the rotation', () => {
    const { container } = render(<ExhibitStage />);
    const retired = fixtureGallery.filter((a) => a.status === 'retired');
    expect(retired.length).toBeGreaterThan(0);

    const archive = container.querySelector('.exhibit-archive') as HTMLElement;
    expect(archive).toBeTruthy();
    const archiveText = archive.textContent ?? '';
    for (const artifact of retired) {
      expect(archiveText).toContain(artifact.title);
      // retirement reason is exposed on hover via the title attribute
      const item = Array.from(archive.querySelectorAll('.exhibit-archive__item')).find((el) =>
        (el.textContent ?? '').includes(artifact.title)
      );
      expect(item?.getAttribute('title')).toBe(artifact.retirementReason);
      // and it is NOT part of the main rotation rail
      expect(railTitles(container)).not.toContain(artifact.title);
    }
  });

  it('renders the live_graph exhibit with the passed-through canvas node', () => {
    const liveOnly: ExhibitArtifact[] = [
      {
        id: 'live-graph',
        exhibitType: 'live_graph',
        title: 'Live agent graph',
        narrative: 'The live topology beneath the curated exhibits.',
        relevance: 0.5,
        decayClass: 'fast',
        createdAtEvent: 1,
        status: 'active',
        payload: {},
      },
    ];
    const { container } = render(
      <ExhibitStage artifacts={liveOnly} liveGraph={<div data-testid="canvas-slot">canvas</div>} />
    );
    expect(container.querySelector('[data-testid="canvas-slot"]')).toBeTruthy();
  });
});
