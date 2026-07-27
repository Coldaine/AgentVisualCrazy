/**
 * Electron host adapter for the existing VS Code bridge.
 *
 * Reuses vscode-bridge message handling (window `message` events) and
 * configureWebviewApi for renderer → host commands. Only the transport
 * changes: contextBridge IPC instead of acquireVsCodeApi / parent.postMessage.
 */

import { vscodeBridge } from './vscode-bridge'

export interface ElectronHostApi {
  send: (message: Record<string, unknown>) => void
  onMessage: (handler: (message: unknown) => void) => () => void
}

declare global {
  interface Window {
    agentVisual?: ElectronHostApi
  }
}

/**
 * Wire vscodeBridge to the preload-exposed Electron API.
 * Returns an unsubscribe for the host→renderer listener, or null if unavailable.
 */
export function configureElectronBridge(api: ElectronHostApi = window.agentVisual!): (() => void) | null {
  if (!api || !vscodeBridge) {
    console.warn('[electron-bridge] host API or vscodeBridge unavailable')
    return null
  }

  // Host → renderer: reuse the bridge's window message listener
  const unsubscribe = api.onMessage((message) => {
    if (message && typeof message === 'object') {
      window.postMessage(message, '*')
    }
  })

  // Renderer → host: replace parent.postMessage / VS Code webview API
  vscodeBridge.configureWebviewApi((msg) => {
    api.send(msg)
  })

  // Signal readiness after wiring (same role as webview-entry's postMessage ready)
  api.send({ type: 'ready' })

  return unsubscribe
}
