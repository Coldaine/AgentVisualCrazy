import { createRoot } from 'react-dom/client'
import { AgentVisualizer } from './components/agent-visualizer'
import { ExhibitGalleryApp } from './components/exhibits'
import './app/globals.css'

// Standalone CLI entry — no VS Code API, connects to relay via SSE
// Additive: `?mode=exhibits` mounts the fixture Exhibit Stage instead.
const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')
const showExhibits = new URLSearchParams(window.location.search).get('mode') === 'exhibits'
const root = createRoot(rootElement)
root.render(showExhibits ? <ExhibitGalleryApp /> : <AgentVisualizer />)
