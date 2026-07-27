import { createRoot } from 'react-dom/client'
import { AgentVisualizer } from './components/agent-visualizer'
import { configureElectronBridge } from './lib/electron-bridge'
import './app/globals.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

const root = createRoot(rootElement)
root.render(<AgentVisualizer />)

// Defer bridge wiring so useVSCodeBridge effects subscribe before `ready` / config IPC
setTimeout(() => {
  configureElectronBridge()
}, 0)
