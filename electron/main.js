/**
 * Sidecar Electron Shell - v3 Lightweight
 *
 * Thin wrapper that loads OpenCode's built-in Web UI.
 * Only adds: fold button injection + fold keyboard shortcut.
 *
 * Spec Reference: §4.4 Electron Wrapper
 */

const { app, BrowserWindow, globalShortcut, ipcMain, dialog } = require('electron');
const path = require('path');
const { logger } = require('../src/utils/logger');

// ============================================================================
// EPIPE Error Handling
// ============================================================================

process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') { return; }
  console.error('stdout error:', err);
});
process.stderr.on('error', (err) => {
  if (err.code === 'EPIPE') { return; }
});
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE') { return; }
  console.error('Uncaught exception:', err);
});

// ============================================================================
// Configuration from Environment (set by src/sidecar/start.js)
// ============================================================================

const TASK_ID = process.env.SIDECAR_TASK_ID || 'unknown';
const MODEL = process.env.SIDECAR_MODEL || 'unknown';
const CWD = process.env.SIDECAR_CWD || process.cwd();
const CLIENT = process.env.SIDECAR_CLIENT || 'code-local';
const OPENCODE_PORT = process.env.SIDECAR_OPENCODE_PORT || '4096';
const OPENCODE_SESSION_ID = process.env.SIDECAR_SESSION_ID;
const FOLD_SHORTCUT = process.env.SIDECAR_FOLD_SHORTCUT || 'CommandOrControl+Shift+F';

const OPENCODE_URL = `http://localhost:${OPENCODE_PORT}`;

const WINDOW_CONFIG = {
  width: 720,
  height: 850,
  minWidth: 550,
  minHeight: 600,
  frame: true,
  backgroundColor: '#1a1a2e',
  title: `Sidecar: ${MODEL}`,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  }
};

// ============================================================================
// State
// ============================================================================

let mainWindow = null;
let hasFolded = false;

// ============================================================================
// Window Creation
// ============================================================================

function createWindow() {
  mainWindow = new BrowserWindow(WINDOW_CONFIG);

  // Load OpenCode Web UI (session-specific URL if available)
  const sessionUrl = OPENCODE_SESSION_ID
    ? `${OPENCODE_URL}/session/${OPENCODE_SESSION_ID}`
    : OPENCODE_URL;

  logger.info('Loading OpenCode Web UI', { url: sessionUrl, taskId: TASK_ID });
  mainWindow.loadURL(sessionUrl);

  // Inject fold button after page loads
  mainWindow.webContents.on('did-finish-load', () => {
    injectFoldButton();
  });

  // Register fold shortcut
  globalShortcut.register(FOLD_SHORTCUT, () => {
    triggerFold();
  });

  // Prompt on close without fold
  mainWindow.on('close', (event) => {
    if (!hasFolded) {
      event.preventDefault();
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        buttons: ['Fold & Close', 'Close Without Folding', 'Cancel'],
        defaultId: 0,
        title: 'Fold Session?',
        message: 'Fold this session back to Claude before closing?',
      });

      if (choice === 0) {
        triggerFold().then(() => mainWindow.destroy());
      } else if (choice === 1) {
        mainWindow.destroy();
      }
      // choice === 2 (Cancel): do nothing
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    globalShortcut.unregisterAll();
    app.quit();
  });
}

// ============================================================================
// Fold Button Injection
// ============================================================================

/**
 * Inject a floating fold button into the OpenCode Web UI.
 * Uses executeJavaScript to add DOM elements after page load.
 */
function injectFoldButton() {
  const css = `
    #sidecar-fold-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      padding: 10px 20px;
      background: #6366f1;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
      transition: all 0.2s;
    }
    #sidecar-fold-btn:hover {
      background: #4f46e5;
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(99, 102, 241, 0.5);
    }
  `;

  const shortcutLabel = FOLD_SHORTCUT.replace('CommandOrControl', 'Cmd');

  const js = `
    (function() {
      if (document.getElementById('sidecar-fold-btn')) { return; }

      const style = document.createElement('style');
      style.textContent = ${JSON.stringify(css)};
      document.head.appendChild(style);

      const btn = document.createElement('button');
      btn.id = 'sidecar-fold-btn';
      btn.textContent = 'Fold (${shortcutLabel})';
      btn.onclick = () => window.sidecar?.fold();
      document.body.appendChild(btn);
    })();
  `;

  mainWindow.webContents.executeJavaScript(js).catch(err => {
    logger.warn('Failed to inject fold button', { error: err.message });
  });
}

// ============================================================================
// Fold Logic
// ============================================================================

/**
 * Trigger fold: summarize session, output to stdout, close.
 * Outputs [SIDECAR_FOLD] marker followed by session metadata and summary.
 */
async function triggerFold() {
  if (hasFolded) { return; }
  hasFolded = true;

  try {
    // TODO: Call OpenCode summarize API to get session summary
    const summary = 'Session summary will be captured here';

    const output = [
      '[SIDECAR_FOLD]',
      `Model: ${MODEL}`,
      `Session: ${OPENCODE_SESSION_ID || TASK_ID}`,
      `Client: ${CLIENT}`,
      `CWD: ${CWD}`,
      `Mode: interactive`,
      '---',
      summary
    ].join('\n');

    process.stdout.write(output + '\n');
    logger.info('Fold completed', { taskId: TASK_ID });
  } catch (err) {
    logger.error('Fold failed', { error: err.message });
    hasFolded = false; // Allow retry
  }
}

// ============================================================================
// IPC Handlers
// ============================================================================

// Fold signal from preload bridge
ipcMain.handle('sidecar:fold', () => triggerFold());

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  app.quit();
});
