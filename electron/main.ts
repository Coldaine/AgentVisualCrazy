import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { IPC } from './ipc-channels'
import { IngestionHost } from './ingestion-host'

let mainWindow: BrowserWindow | null = null
let ingestion: IngestionHost | null = null

function sendToRenderer(message: Record<string, unknown>): void {
  mainWindow?.webContents.send(IPC.HOST_MESSAGE, message)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0a0a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist-web/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function registerIpc(): void {
  ipcMain.on(IPC.RENDERER_MESSAGE, (_event, message: Record<string, unknown>) => {
    if (!message || typeof message.type !== 'string') return

    switch (message.type) {
      case 'ready':
        void ingestion?.onRendererReady().catch((err) => {
          console.error('[ingestion-host] failed to start:', err)
          sendToRenderer({
            type: 'config',
            config: { showMockData: true, mode: 'live', autoPlay: true },
          })
          sendToRenderer({
            type: 'connection-status',
            status: 'disconnected',
            source: 'electron-shell',
          })
        })
        break

      case 'open-file': {
        const filePath = message.filePath
        if (typeof filePath === 'string' && filePath.length > 0) {
          void shell.openPath(filePath)
        }
        break
      }

      case 'log':
        console.log(`[renderer:${String(message.level ?? 'info')}]`, message.message)
        break

      default:
        break
    }
  })

  ipcMain.handle(IPC.OBSERVATION_QUERY_RECENT, (_event, n?: unknown) => {
    const count = typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 50
    return ingestion?.queryRecent(count) ?? []
  })
}

app.whenReady().then(() => {
  ingestion = new IngestionHost({ send: sendToRenderer })
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  ingestion?.dispose()
  ingestion = null
})
