import { describe, expect, it } from 'vitest';
import { getRendererSurfaceAdapter } from '../../src/renderer/renderer-surface-adapter';

describe('renderer surface adapter', () => {
  it('exposes surface wiring that resolves to renderable React components', () => {
    const adapter = getRendererSurfaceAdapter();

    expect(adapter.id).toBe('default-renderer-surfaces');
    // Contract: components are valid React function components, not undefined/null
    expect(typeof adapter.GraphCanvas).toBe('function');
    expect(typeof adapter.Timeline).toBe('function');
    expect(typeof adapter.ShadowPanel).toBe('function');
  });
});
