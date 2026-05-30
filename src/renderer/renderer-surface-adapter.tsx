import type { ComponentType } from 'react';
import CanvasRenderer, { type CanvasRendererProps } from './canvas/CanvasRenderer';
import ShadowPanel, { type ShadowPanelProps } from './components/ShadowPanel';
import TimelineScrubber, { type TimelineScrubberProps } from './components/TimelineScrubber';

export interface RendererSurfaceAdapter {
  readonly id: string;
  readonly GraphCanvas: ComponentType<CanvasRendererProps>;
  readonly Timeline: ComponentType<TimelineScrubberProps>;
  readonly ShadowPanel: ComponentType<ShadowPanelProps>;
}

const currentRendererSurfaceAdapter: RendererSurfaceAdapter = {
  id: 'default-renderer-surfaces',
  GraphCanvas: CanvasRenderer,
  Timeline: TimelineScrubber,
  ShadowPanel
};

export function getRendererSurfaceAdapter(): RendererSurfaceAdapter {
  return currentRendererSurfaceAdapter;
}
