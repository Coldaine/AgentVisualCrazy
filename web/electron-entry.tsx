import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AgentVisualizer } from './components/agent-visualizer'
import { ExhibitGalleryApp } from './components/exhibits'
import { configureElectronBridge } from './lib/electron-bridge'
import './app/globals.css'

type View = 'visualizer' | 'exhibits'

function Root() {
  const [view, setView] = useState<View>('visualizer')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault()
        setView((v) => (v === 'visualizer' ? 'exhibits' : 'visualizer'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      {view === 'visualizer' ? <AgentVisualizer /> : <ExhibitGalleryApp />}
      <button
        type="button"
        onClick={() => setView((v) => (v === 'visualizer' ? 'exhibits' : 'visualizer'))}
        title="Toggle Exhibit Stage (Ctrl+Shift+E)"
        style={{
          position: 'fixed',
          top: 8,
          right: 8,
          zIndex: 9999,
          padding: '4px 10px',
          fontSize: 12,
          lineHeight: 1,
          background: 'rgba(20,20,40,0.72)',
          color: '#c9d4ff',
          border: '1px solid rgba(120,140,255,0.4)',
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        {view === 'visualizer' ? 'Exhibits' : 'Visualizer'}
      </button>
    </>
  )
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

const root = createRoot(rootElement)
root.render(<Root />)

// Defer bridge wiring so useVSCodeBridge effects subscribe before `ready` / config IPC.
setTimeout(() => {
  configureElectronBridge()
}, 0)
