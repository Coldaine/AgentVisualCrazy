import { createRoot } from 'react-dom/client'
import { AgentVisualizer } from './components/agent-visualizer'
import { ExhibitGalleryApp } from './components/exhibits'
import { configureElectronBridge } from './lib/electron-bridge'
import './app/globals.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

/** Additive exhibit fixture gallery: `?mode=exhibits` (default remains AgentVisualizer). */
const params = new URLSearchParams(window.location.search)
const showExhibits = params.get('mode') === 'exhibits'

const root = createRoot(rootElement)
root.render(showExhibits ? <ExhibitGalleryApp /> : <AgentVisualizer />)

// Defer bridge wiring so useVSCodeBridge effects subscribe before `ready` / config IPC
if (!showExhibits) {
  setTimeout(() => {
    configureElectronBridge()
  }, 0)
}
