# Copy verify — agent-flow → Electron host

Verified against the copied tree under `web/` + `extension/src/`, with
`C:\_projects\_tmp\agent-flow\app\src\server.ts` as host-pattern reference only.

## Entry points

| File | Role | Electron fit |
|------|------|--------------|
| `web/webview-entry.tsx` | VS Code webview: `acquireVsCodeApi` + `vscodeBridge.configureWebviewApi` | Wrong host API; keep for reference only |
| `web/app-entry.tsx` | Standalone CLI: no bridge; SSE relay via `AGENT_FLOW_STANDALONE=1` | Close, but SSE assumes an HTTP host (agent-flow `server.ts` pattern) |
| `web/vite.config.webview.ts` | IIFE → `extension/dist/webview` (JS+CSS, HTML injected by extension) | Awkward for `file://` without a shell |
| `web/vite.config.app.ts` | IIFE → `app/dist/webview` + standalone defines | Same IIFE limitation; defines are the right *idea* |

**Chosen for Electron:** a dedicated SPA path — `web/electron-entry.tsx` +
`web/vite.config.electron.ts` + `web/index.html` — modeled on **app-entry**
(standalone visualizer) but wired like **webview-entry** (host bridge at boot).
Vite `base: './'` so production `loadFile` works; dev loads the Vite server URL.

## Protocol / capture (copied, not deleted)

- `extension/src/protocol.ts` — host↔renderer message types (`agent-event`, sessions, config). Reuse as the IPC payload shape.
- `extension/src/event-source.ts` — JSONL watcher (still VS Code `Disposable`-shaped). Stays for later main-process ingestion; not wired in this shell pass.
- `web/lib/vscode-bridge.ts` + `web/hooks/use-vscode-bridge.ts` — keep; types in `bridge-types.ts` stay the renderer contract.

## Bridge replacement strategy

1. Keep `VSCodeBridge` + `window` `message` listener (no visualizer rewrites).
2. Add `web/lib/electron-bridge.ts`: preload `send`/`onMessage` →
   `configureWebviewApi(send)` for renderer→main; host→renderer via
   `window.postMessage` so existing `handleMessage` runs unchanged.
3. Preload exposes a narrow `window.agentVisual` API (`contextBridge`), not raw `ipcRenderer`.
4. Main answers `ready` with `config.showMockData: true` until ObservationStore/ingestion lands — so the shell shows the mock scenario immediately.
5. Do **not** use agent-flow’s SSE/`server.ts` as the Electron transport; that pattern stays a CLI reference only.

## Host pattern note (reference)

agent-flow’s `app/src/server.ts` combines static UI + `/events` SSE + relay.
Electron replaces that with: main process owns capture later; BrowserWindow loads
the Vite-built renderer; IPC carries the same protocol messages the webview used.
