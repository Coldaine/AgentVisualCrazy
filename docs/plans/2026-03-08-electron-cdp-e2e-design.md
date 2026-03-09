# Electron CDP E2E Testing Design

**Goal:** Build automated E2E tests for the Electron UI using Chrome DevTools Protocol, starting with toolbar testing as MVP.

**Architecture:** Raw CDP WebSocket helper (no Playwright/Puppeteer), real LLM server, cross-platform (macOS + Linux VPS), screenshot capture.

**Tech Stack:** `ws` (existing dependency), `http`/`fs` (builtin), CDP `Runtime.evaluate` + `Page.captureScreenshot`, Xvfb (Linux only)

---

## Components

### 1. CDP Helper (`tests/helpers/cdp-client.js`)

Thin class (~100 lines) wrapping `ws` + `http`:

```
CdpClient
  constructor(debugPort = 9223)
  getTargets()                    → GET http://127.0.0.1:<port>/json
  findTarget(filter)              → find toolbar (data: URL) or content (http: URL)
  connect(targetId)               → WebSocket to /devtools/page/<id>
  evaluate(expression)            → Runtime.evaluate, return value
  waitForSelector(selector, ms)   → poll evaluate until element exists
  screenshot(filePath)            → Page.captureScreenshot, save base64 PNG
  close()                         → close WebSocket
```

Factory methods:
- `CdpClient.toolbar(port)` - connects to `data:text/html` target
- `CdpClient.content(port)` - connects to `http://localhost:` target

No new dependencies.

### 2. Electron Integration (`electron/main.js`)

Single line change: skip `mainWindow.show()` when `SIDECAR_HEADLESS_TEST=1`.

```javascript
if (!process.env.SIDECAR_HEADLESS_TEST) {
  mainWindow.show();
}
```

The renderer, CDP, toolbar polling, and all other behavior runs normally. Window is created but never made visible. CDP `Page.captureScreenshot` captures the off-screen renderer (not the screen).

### 3. Test File (`tests/electron-toolbar-e2e.integration.test.js`)

**Setup (`beforeAll`):**
1. Start real OpenCode server via SDK (same pattern as CLI/MCP E2E tests)
2. On Linux without `$DISPLAY`: launch Xvfb on `:99`, set `DISPLAY=:99`
3. Spawn Electron with env vars:
   - `SIDECAR_DEBUG_PORT=9223`
   - `SIDECAR_HEADLESS_TEST=1`
   - `SIDECAR_OPENCODE_PORT=<server port>`
   - `SIDECAR_SESSION_ID=<session id>`
   - `SIDECAR_TASK_ID=<task id>`
4. Wait for CDP targets to appear (poll `/json` endpoint)
5. Connect CdpClient to toolbar target

**Teardown (`afterAll`):**
- Kill Electron process
- Close OpenCode server
- Kill Xvfb if started
- Clean up temp directory

**Skip pattern:** Same as other E2E tests. Requires `OPENROUTER_API_KEY`.

### 4. MVP Test Cases (8 tests)

| Test | Assertion | CDP Approach |
|------|-----------|-------------|
| Brand name renders | `.brand` contains "Claude Sidecar" | `evaluate` text content |
| Task ID displayed | `.detail` contains task ID from env | `evaluate` text content |
| Timer ticks | `#timer` changes from `0:00` after 2s | `evaluate` twice with delay |
| Fold button with shortcut | `#fold-btn` contains "Fold" | `evaluate` text content |
| Settings gear exists | `#settings-btn` exists | `evaluate` |
| Update banner hidden by default | `#update-banner` display is `none` | `evaluate` style |
| Update banner visible when available | With `SIDECAR_MOCK_UPDATE=available`, banner shows | separate spawn with env, `evaluate` |
| Screenshot captured | Toolbar renders to PNG | `Page.captureScreenshot` |

### 5. Screenshots (`tests/screenshots/`)

- Directory gitignored
- Screenshots saved as `toolbar-default.png`, `toolbar-update-banner.png`
- Baseline comparison deferred to future pass

## Cross-Platform Strategy

| Platform | Display | Window Visibility |
|----------|---------|-------------------|
| macOS | Native (no extra deps) | `show: false` via `SIDECAR_HEADLESS_TEST=1` |
| Linux VPS | Xvfb auto-launched on `:99` | `show: false` via `SIDECAR_HEADLESS_TEST=1` |

Electron needs an X server on Linux to create a renderer (even with `show: false`). The test auto-detects headless Linux and manages Xvfb lifecycle.

## Future Expansion

After MVP, extend to:
- Content view tests (OpenCode UI loaded, messages rendered)
- Fold action tests (click fold, verify summary generation)
- Resize tests (window resize adjusts BrowserView bounds)
- Setup wizard tests
- Pixel-diff screenshot comparison against committed baselines
