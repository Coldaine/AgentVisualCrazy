/**
 * Thin additive strip for the default AgentVisualizer shell.
 * Renders only when live exhibit-artifacts have arrived — does not replace the canvas.
 */
import { useLiveExhibitArtifacts } from '@/lib/live-exhibits'
import './exhibits.css'

export function LiveExhibitStrip() {
  const artifacts = useLiveExhibitArtifacts()
  if (!artifacts || artifacts.length === 0) return null

  const active = artifacts
    .filter((a) => a.status !== 'retired')
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 6)

  if (active.length === 0) return null

  return (
    <div
      className="live-exhibit-strip"
      aria-label="Live curator exhibits"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 72,
        zIndex: 40,
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        padding: '8px 10px',
        borderRadius: 12,
        background: 'rgba(5, 9, 20, 0.72)',
        border: '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(10px)',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          flex: '0 0 auto',
          fontSize: 11,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'rgba(125, 224, 255, 0.85)',
          alignSelf: 'center',
          paddingRight: 4,
        }}
      >
        Exhibits
      </span>
      {active.map((a) => (
        <span
          key={a.id}
          title={a.narrative}
          style={{
            flex: '0 0 auto',
            fontSize: 12,
            color: 'rgba(255,255,255,0.86)',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 999,
            padding: '4px 10px',
            whiteSpace: 'nowrap',
            maxWidth: 220,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {a.title}
        </span>
      ))}
    </div>
  )
}
