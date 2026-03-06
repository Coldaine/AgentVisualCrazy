/**
 * Sidecar Preload - v3 Minimal
 *
 * Exposes only the fold IPC bridge to the renderer.
 * OpenCode's Web UI handles all other functionality natively.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Inject CSS before page scripts run to hide OpenCode branding
// and match window background color to prevent white flash on load
const style = document.createElement('style');
style.textContent = [
  'html, body { background-color: #2D2B2A !important; }',
  '#root > div > header { display: none !important; }',
  'svg[viewBox="0 0 234 42"] { display: none !important; }',
].join('\n');
document.documentElement.appendChild(style);

contextBridge.exposeInMainWorld('sidecar', {
  /** Trigger fold: summarize and return to Claude Code */
  fold: () => ipcRenderer.invoke('sidecar:fold'),
  /** Open settings wizard in a child window */
  openSettings: () => ipcRenderer.invoke('sidecar:open-settings'),
});
