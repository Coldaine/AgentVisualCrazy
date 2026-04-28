import { describe, expect, it } from 'vitest';
import CanvasRenderer from '../../src/renderer/canvas/CanvasRenderer';
import ShadowPanel from '../../src/renderer/components/ShadowPanel';
import TimelineScrubber from '../../src/renderer/components/TimelineScrubber';
import { getRendererSurfaceAdapter } from '../../src/renderer/renderer-surface-adapter';

describe('renderer surface adapter', () => {
  it('keeps a stable boundary around the current renderer surfaces', () => {
    const adapter = getRendererSurfaceAdapter();

    expect(adapter.id).toBe('default-renderer-surfaces');
    expect(adapter.GraphCanvas).toBe(CanvasRenderer);
    expect(adapter.Timeline).toBe(TimelineScrubber);
    expect(adapter.ShadowPanel).toBe(ShadowPanel);
  });
});
