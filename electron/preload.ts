import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from './ipc-channels'

/**
 * Narrow API for the renderer. Do not expose ipcRenderer wholesale.
 * @see https://www.electronjs.org/docs/latest/tutorial/tutorial-preload
 */
contextBridge.exposeInMainWorld('agentVisual', {
  send: (message: Record<string, unknown>) => {
    ipcRenderer.send(IPC.RENDERER_MESSAGE, message)
  },
  onMessage: (handler: (message: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: unknown) => {
      handler(message)
    }
    ipcRenderer.on(IPC.HOST_MESSAGE, listener)
    return () => {
      ipcRenderer.removeListener(IPC.HOST_MESSAGE, listener)
    }
  },
  /** Curator lookback — recent ObservationStore rows from main. */
  queryRecent: (n?: number) => {
    return ipcRenderer.invoke(IPC.OBSERVATION_QUERY_RECENT, n)
  },
})
