import { describe, expect, it } from 'vitest';
import { getRendererSurfaceAdapter } from '../../src/renderer/renderer-surface-adapter';
import CanvasRenderer from '../../src/renderer/canvas/CanvasRenderer';
import ShadowPanel from '../../src/renderer/components/ShadowPanel';
import TimelineScrubber from '../../src/renderer/components/TimelineScrubber';

describe('renderer surface adapter', () => {
  it('maps each surface slot to the intended production component', () => {
    const adapter = getRendererSurfaceAdapter();

    expect(adapter.id).toBe('default-renderer-surfaces');
    // Identity checks protect adapter wiring instead of proving React components are functions.
    expect(adapter.GraphCanvas).toBe(CanvasRenderer);
    expect(adapter.Timeline).toBe(TimelineScrubber);
    expect(adapter.ShadowPanel).toBe(ShadowPanel);
  });
});
