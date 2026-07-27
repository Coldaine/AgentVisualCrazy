/**
 * Exhibit Stage shell — fixtures by default; swaps to live curator artifacts
 * when `exhibit-artifacts` arrive via preload (`onExhibits` / `onMessage`).
 * `live_graph` uses a placeholder; wire AgentVisualizer (or its canvas) into
 * the `liveGraph` prop when integrating the living graph as a rotation slot.
 */
import ExhibitStage from './ExhibitStage'
import fixtureGallery from './fixture-gallery'
import { useLiveExhibitArtifacts } from '@/lib/live-exhibits'
import './exhibits.css'

function LiveGraphPlaceholder() {
  return (
    <div className="exhibit-live-graph__fallback" style={{ padding: 24, lineHeight: 1.5 }}>
      <strong style={{ color: '#fff' }}>live_graph</strong>
      <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.64)' }}>
        Slot for agent-flow&apos;s AgentVisualizer canvas. Default app entry still
        mounts the visualizer alone; pass it as <code>liveGraph</code> to host it
        inside this stage.
      </p>
      <p style={{ margin: '12px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.44)' }}>
        Open without <code>?mode=exhibits</code> to return to the live visualizer.
      </p>
    </div>
  )
}

export function ExhibitGalleryApp() {
  const liveArtifacts = useLiveExhibitArtifacts()
  const artifacts = liveArtifacts ?? fixtureGallery
  const source = liveArtifacts ? 'live' : 'fixture'

  return (
    <div
      className="exhibit-surface"
      style={{
        height: '100%',
        overflow: 'auto',
        padding: 20,
        boxSizing: 'border-box',
        background: 'var(--exhibit-surface, #050914)',
      }}
      data-exhibit-source={source}
    >
      <ExhibitStage artifacts={artifacts} liveGraph={<LiveGraphPlaceholder />} />
    </div>
  )
}
