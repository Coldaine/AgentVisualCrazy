# Electron CDP E2E Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build automated E2E tests for the Electron toolbar using Chrome DevTools Protocol over raw WebSocket.

**Architecture:** A thin CDP helper class (`CdpClient`) wraps `ws` + `http` to provide `evaluate()`, `waitForSelector()`, and `screenshot()`. Tests spawn a real Electron app with `SIDECAR_HEADLESS_TEST=1` (no visible window), connect via CDP, and assert toolbar DOM state. Cross-platform: macOS uses native display, Linux auto-launches Xvfb.

**Tech Stack:** `ws` (existing dep), `http`/`fs` (builtin), Jest, CDP protocol (`Runtime.evaluate`, `Page.captureScreenshot`)

---

### Task 1: Add screenshots directory to .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Add gitignore entry**

Add this line at the end of the "Test artifacts" section in `.gitignore`:

```
# E2E screenshots (generated during test runs)
tests/screenshots/
```

**Step 2: Create the directory with a .gitkeep**

```bash
mkdir -p tests/screenshots
touch tests/screenshots/.gitkeep
```

The `.gitkeep` ensures git tracks the empty directory. Screenshots themselves are gitignored.

**Step 3: Commit**

```bash
git add .gitignore tests/screenshots/.gitkeep
git commit -m "chore: add tests/screenshots/ to gitignore"
```

---

### Task 2: Build the CDP helper (`tests/helpers/cdp-client.js`)

**Files:**
- Create: `tests/helpers/cdp-client.js`

**Step 1: Write the unit test**

Create `tests/helpers/cdp-client.test.js`:

```javascript
const http = require('http');
const WebSocket = require('ws');
const { CdpClient } = require('./cdp-client');

describe('CdpClient', () => {
  let mockServer;
  let wss;
  let serverPort;

  beforeAll((done) => {
    // Create a mock CDP endpoint
    mockServer = http.createServer((req, res) => {
      if (req.url === '/json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([
          {
            id: 'toolbar-page-id',
            url: 'data:text/html;charset=utf-8,toolbar',
            webSocketDebuggerUrl: `ws://127.0.0.1:${serverPort}/devtools/page/toolbar-page-id`
          },
          {
            id: 'content-page-id',
            url: 'http://localhost:4096/',
            webSocketDebuggerUrl: `ws://127.0.0.1:${serverPort}/devtools/page/content-page-id`
          }
        ]));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    wss = new WebSocket.Server({ server: mockServer });
    wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        if (msg.method === 'Runtime.evaluate') {
          ws.send(JSON.stringify({
            id: msg.id,
            result: {
              result: {
                type: 'object',
                value: { found: true, text: 'test-value' }
              }
            }
          }));
        } else if (msg.method === 'Page.captureScreenshot') {
          // Return a tiny 1x1 red PNG as base64
          const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
          ws.send(JSON.stringify({
            id: msg.id,
            result: { data: pngBase64 }
          }));
        }
      });
    });

    mockServer.listen(0, '127.0.0.1', () => {
      serverPort = mockServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    wss.close();
    mockServer.close(done);
  });

  it('getTargets returns parsed target list', async () => {
    const cdp = new CdpClient(serverPort);
    const targets = await cdp.getTargets();
    expect(targets).toHaveLength(2);
    expect(targets[0].id).toBe('toolbar-page-id');
    expect(targets[1].url).toContain('http://localhost');
  });

  it('findTarget filters by predicate', async () => {
    const cdp = new CdpClient(serverPort);
    const toolbar = await cdp.findTarget(t => t.url.startsWith('data:'));
    expect(toolbar.id).toBe('toolbar-page-id');

    const content = await cdp.findTarget(t => t.url.startsWith('http://localhost'));
    expect(content.id).toBe('content-page-id');
  });

  it('findTarget returns null when no match', async () => {
    const cdp = new CdpClient(serverPort);
    const result = await cdp.findTarget(t => t.url === 'nonexistent');
    expect(result).toBeNull();
  });

  it('connect + evaluate returns value', async () => {
    const cdp = new CdpClient(serverPort);
    await cdp.connect('toolbar-page-id');
    const result = await cdp.evaluate('document.title');
    expect(result).toEqual({ found: true, text: 'test-value' });
    cdp.close();
  });

  it('screenshot saves PNG to disk', async () => {
    const fs = require('fs');
    const path = require('path');
    const tmpFile = path.join(require('os').tmpdir(), `cdp-test-${Date.now()}.png`);

    const cdp = new CdpClient(serverPort);
    await cdp.connect('toolbar-page-id');
    await cdp.screenshot(tmpFile);
    cdp.close();

    expect(fs.existsSync(tmpFile)).toBe(true);
    const buf = fs.readFileSync(tmpFile);
    // PNG magic bytes
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // P
    expect(buf[2]).toBe(0x4E); // N
    expect(buf[3]).toBe(0x47); // G

    fs.unlinkSync(tmpFile);
  });

  it('close is safe to call multiple times', async () => {
    const cdp = new CdpClient(serverPort);
    await cdp.connect('toolbar-page-id');
    cdp.close();
    cdp.close(); // should not throw
  });

  describe('factory methods', () => {
    it('CdpClient.toolbar connects to data: URL target', async () => {
      const cdp = await CdpClient.toolbar(serverPort);
      expect(cdp).toBeInstanceOf(CdpClient);
      const result = await cdp.evaluate('1+1');
      expect(result).toBeDefined();
      cdp.close();
    });

    it('CdpClient.content connects to http: URL target', async () => {
      const cdp = await CdpClient.content(serverPort);
      expect(cdp).toBeInstanceOf(CdpClient);
      cdp.close();
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test tests/helpers/cdp-client.test.js
```

Expected: FAIL with `Cannot find module './cdp-client'`

**Step 3: Write the implementation**

Create `tests/helpers/cdp-client.js`:

```javascript
/**
 * CDP Client - Thin Chrome DevTools Protocol helper for E2E tests.
 *
 * Wraps ws + http to provide evaluate(), waitForSelector(), screenshot().
 * No external dependencies beyond ws (already in project).
 */

const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');

class CdpClient {
  constructor(port = 9223) {
    this.port = port;
    this.ws = null;
    this._nextId = 1;
    this._pending = new Map();
  }

  /** Fetch CDP targets from /json endpoint */
  getTargets() {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${this.port}/json`, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`Failed to parse targets: ${e.message}`)); }
        });
      }).on('error', reject);
    });
  }

  /** Find a target matching a predicate function */
  async findTarget(predicate) {
    const targets = await this.getTargets();
    return targets.find(predicate) || null;
  }

  /** Connect WebSocket to a specific target ID */
  connect(targetId) {
    return new Promise((resolve, reject) => {
      const url = `ws://127.0.0.1:${this.port}/devtools/page/${targetId}`;
      this.ws = new WebSocket(url);

      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id !== undefined && this._pending.has(msg.id)) {
          this._pending.get(msg.id).resolve(msg);
          this._pending.delete(msg.id);
        }
      });
    });
  }

  /** Send a CDP command and wait for response */
  _send(method, params = {}, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      const id = this._nextId++;
      this._pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));

      setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error(`CDP timeout: ${method} (id=${id})`));
        }
      }, timeoutMs);
    });
  }

  /** Evaluate a JS expression and return the result value */
  async evaluate(expression) {
    const msg = await this._send('Runtime.evaluate', {
      expression,
      returnByValue: true
    });
    if (msg.result?.exceptionDetails) {
      throw new Error(`Evaluate error: ${msg.result.exceptionDetails.text}`);
    }
    return msg.result?.result?.value;
  }

  /** Poll until a selector exists in the DOM, return true. Throws on timeout. */
  async waitForSelector(selector, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const exists = await this.evaluate(
        `!!document.querySelector(${JSON.stringify(selector)})`
      );
      if (exists) { return true; }
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`waitForSelector timeout: ${selector} (${timeoutMs}ms)`);
  }

  /** Capture a screenshot and save to filePath as PNG */
  async screenshot(filePath) {
    const msg = await this._send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(msg.result.data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  /** Close the WebSocket connection */
  close() {
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    for (const [, { reject }] of this._pending) {
      reject(new Error('Client closed'));
    }
    this._pending.clear();
  }

  /**
   * Factory: connect to the toolbar target (data: URL).
   * Retries until the target appears (Electron startup delay).
   */
  static async toolbar(port = 9223, timeoutMs = 15000) {
    const cdp = new CdpClient(port);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const target = await cdp.findTarget(t => t.url && t.url.startsWith('data:'));
        if (target) {
          await cdp.connect(target.id);
          return cdp;
        }
      } catch { /* server not ready yet */ }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`Toolbar target not found after ${timeoutMs}ms`);
  }

  /**
   * Factory: connect to the content target (http://localhost: URL).
   * Retries until the target appears.
   */
  static async content(port = 9223, timeoutMs = 15000) {
    const cdp = new CdpClient(port);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const target = await cdp.findTarget(t => t.url && t.url.startsWith('http://localhost'));
        if (target) {
          await cdp.connect(target.id);
          return cdp;
        }
      } catch { /* server not ready yet */ }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`Content target not found after ${timeoutMs}ms`);
  }
}

module.exports = { CdpClient };
```

**Step 4: Run test to verify it passes**

```bash
npm test tests/helpers/cdp-client.test.js
```

Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add tests/helpers/cdp-client.js tests/helpers/cdp-client.test.js
git commit -m "feat: add CDP helper for Electron E2E tests"
```

---

### Task 3: Add headless test mode to Electron (`electron/main.js`)

**Files:**
- Modify: `electron/main.js:135-145`

**Step 1: Write the test**

Create `tests/electron-headless-mode.test.js`:

```javascript
const fs = require('fs');
const path = require('path');

describe('Electron headless test mode', () => {
  it('main.js checks SIDECAR_HEADLESS_TEST before showing window', () => {
    const mainSrc = fs.readFileSync(
      path.join(__dirname, '..', 'electron', 'main.js'), 'utf-8'
    );

    // The did-finish-load handler should gate mainWindow.show() on env var
    expect(mainSrc).toContain('SIDECAR_HEADLESS_TEST');
    expect(mainSrc).toContain('mainWindow.show()');

    // Verify the pattern: show() is inside an if-not-headless guard
    const showPattern = /if\s*\(\s*!process\.env\.SIDECAR_HEADLESS_TEST\s*\)\s*\{[^}]*mainWindow\.show\(\)/s;
    expect(mainSrc).toMatch(showPattern);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test tests/electron-headless-mode.test.js
```

Expected: FAIL (pattern not found in source)

**Step 3: Modify `electron/main.js`**

Change line 141 from:

```javascript
        mainWindow.show();
```

To:

```javascript
        if (!process.env.SIDECAR_HEADLESS_TEST) {
          mainWindow.show();
        }
```

The full `did-finish-load` handler (lines 135-145) becomes:

```javascript
  contentView.webContents.on('did-finish-load', () => {
    // Wait for React to render, then rebrand and show window
    setTimeout(() => {
      rebrandUI().then(() => {
        mainWindow.addBrowserView(contentView);
        updateContentBounds();
        if (!process.env.SIDECAR_HEADLESS_TEST) {
          mainWindow.show();
        }
        if (OPENCODE_SESSION_ID) { navigateToSession(OPENCODE_SESSION_ID); }
      });
    }, 500);
  });
```

**Step 4: Run test to verify it passes**

```bash
npm test tests/electron-headless-mode.test.js
```

Expected: PASS

**Step 5: Run full test suite for regressions**

```bash
npm test
```

Expected: All tests pass (this change has zero runtime effect without the env var)

**Step 6: Commit**

```bash
git add electron/main.js tests/electron-headless-mode.test.js
git commit -m "feat: add SIDECAR_HEADLESS_TEST env var to suppress window.show()"
```

---

### Task 4: Build the Electron toolbar E2E test

**Files:**
- Create: `tests/electron-toolbar-e2e.integration.test.js`

**Prerequisite reading:**
- `electron/toolbar.js` - toolbar HTML structure, element IDs
- `electron/main.js` - env vars needed to spawn Electron
- `tests/cli-headless-e2e.integration.test.js` - pattern for API key skip
- `docs/plans/2026-03-08-electron-cdp-e2e-design.md` - full design

**Step 1: Write the test file**

Create `tests/electron-toolbar-e2e.integration.test.js`:

```javascript
/**
 * Electron Toolbar E2E Integration Test
 *
 * Spawns a real Electron sidecar window (hidden via SIDECAR_HEADLESS_TEST),
 * connects via Chrome DevTools Protocol, and asserts toolbar DOM state.
 *
 * Requires OPENROUTER_API_KEY for real OpenCode server.
 * On Linux without DISPLAY, auto-launches Xvfb.
 */

const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { CdpClient } = require('./helpers/cdp-client');

const SIDECAR_BIN = path.join(__dirname, '..', 'bin', 'sidecar.js');
const ELECTRON_BIN = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');
const ELECTRON_MAIN = path.join(__dirname, '..', 'electron', 'main.js');
const NODE = process.execPath;
const CDP_PORT = 9224; // Avoid conflict with other tests using 9223

const HAS_API_KEY = !!(
  process.env.OPENROUTER_API_KEY ||
  (() => {
    try {
      const envPath = path.join(os.homedir(), '.config', 'sidecar', '.env');
      const content = fs.readFileSync(envPath, 'utf-8');
      return content.includes('OPENROUTER_API_KEY=');
    } catch { return false; }
  })()
);

const HAS_ELECTRON = (() => {
  try {
    require.resolve('electron');
    return true;
  } catch { return false; }
})();

const describeE2E = (HAS_API_KEY && HAS_ELECTRON) ? describe : describe.skip;

/** Start Xvfb on Linux if no DISPLAY is set. Returns cleanup function. */
function ensureDisplay() {
  if (process.platform !== 'linux' || process.env.DISPLAY) {
    return { display: process.env.DISPLAY, cleanup: () => {} };
  }

  const display = ':99';
  let xvfbProcess;
  try {
    xvfbProcess = spawn('Xvfb', [display, '-screen', '0', '1280x720x24', '-nolisten', 'tcp'], {
      stdio: 'ignore',
      detached: true,
    });
    xvfbProcess.unref();
  } catch (err) {
    throw new Error(`Xvfb not found. Install with: apt-get install xvfb. Error: ${err.message}`);
  }

  return {
    display,
    cleanup: () => {
      try { xvfbProcess.kill(); } catch { /* already dead */ }
    }
  };
}

/** Start a real OpenCode server, return { port, sessionId, cleanup } */
async function startRealServer() {
  // Use the SDK directly (same pattern as headless.js)
  const { ensureNodeModulesBinInPath } = require('../src/utils/path-setup');
  const { startServer, createSession, checkHealth } = require('../src/opencode-client');
  const { waitForServer } = require('../src/headless');

  ensureNodeModulesBinInPath();

  const { client, server } = await startServer({ port: 0 });
  const ready = await waitForServer(client, checkHealth);
  if (!ready) {
    server.close();
    throw new Error('OpenCode server failed to start');
  }

  const sessionId = await createSession(client);
  const port = parseInt(new URL(server.url).port, 10);

  return {
    port,
    sessionId,
    cleanup: () => { server.close(); }
  };
}

/** Spawn Electron with sidecar env vars. Returns child process. */
function spawnElectron(options) {
  const { opencodePort, sessionId, taskId, display, extraEnv = {} } = options;

  const env = {
    ...process.env,
    SIDECAR_OPENCODE_PORT: String(opencodePort),
    SIDECAR_SESSION_ID: sessionId,
    SIDECAR_TASK_ID: taskId,
    SIDECAR_MODEL: 'test-model',
    SIDECAR_DEBUG_PORT: String(CDP_PORT),
    SIDECAR_HEADLESS_TEST: '1',
    SIDECAR_CWD: process.cwd(),
    ...extraEnv,
  };

  if (display) {
    env.DISPLAY = display;
  }

  const child = spawn(ELECTRON_BIN, [
    `--remote-debugging-port=${CDP_PORT}`,
    ELECTRON_MAIN
  ], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return child;
}

describeE2E('Electron Toolbar E2E (CDP)', () => {
  let serverInfo;
  let displayInfo;
  let electronProcess;
  let cdp;
  const taskId = 'e2e-toolbar-test';

  beforeAll(async () => {
    displayInfo = ensureDisplay();
    serverInfo = await startRealServer();

    electronProcess = spawnElectron({
      opencodePort: serverInfo.port,
      sessionId: serverInfo.sessionId,
      taskId,
      display: displayInfo.display,
    });

    // Connect CDP to toolbar (retries until Electron is ready)
    cdp = await CdpClient.toolbar(CDP_PORT, 20000);
  }, 30000);

  afterAll(async () => {
    if (cdp) { cdp.close(); }
    if (electronProcess) {
      electronProcess.kill('SIGTERM');
      await new Promise(resolve => {
        electronProcess.on('close', resolve);
        setTimeout(() => {
          try { electronProcess.kill('SIGKILL'); } catch { /* already dead */ }
          resolve();
        }, 3000);
      });
    }
    if (serverInfo) { serverInfo.cleanup(); }
    displayInfo.cleanup();
  });

  it('renders brand name', async () => {
    const brand = await cdp.evaluate(
      `document.querySelector('.brand')?.textContent`
    );
    expect(brand).toContain('Sidecar');
  });

  it('displays task ID', async () => {
    const detail = await cdp.evaluate(
      `document.querySelector('.detail')?.textContent`
    );
    expect(detail).toContain(taskId);
  });

  it('timer ticks after 2 seconds', async () => {
    const t1 = await cdp.evaluate(
      `document.getElementById('timer')?.textContent`
    );
    await new Promise(r => setTimeout(r, 2500));
    const t2 = await cdp.evaluate(
      `document.getElementById('timer')?.textContent`
    );
    expect(t1).not.toEqual(t2);
  });

  it('fold button exists with shortcut label', async () => {
    const text = await cdp.evaluate(
      `document.getElementById('fold-btn')?.textContent`
    );
    expect(text).toContain('Fold');
  });

  it('settings gear button exists', async () => {
    const exists = await cdp.evaluate(
      `!!document.getElementById('settings-btn')`
    );
    expect(exists).toBe(true);
  });

  it('update banner is hidden by default', async () => {
    const display = await cdp.evaluate(
      `document.getElementById('update-banner')?.style?.display`
    );
    // Hidden: display is either 'none' or '' (default from CSS is display:none)
    expect(display).not.toBe('flex');
  });

  it('captures toolbar screenshot', async () => {
    const screenshotDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    const filePath = path.join(screenshotDir, 'toolbar-default.png');
    await cdp.screenshot(filePath);

    expect(fs.existsSync(filePath)).toBe(true);
    const buf = fs.readFileSync(filePath);
    expect(buf.length).toBeGreaterThan(100); // Not empty
    expect(buf[0]).toBe(0x89); // PNG magic byte
    process.stderr.write(`  [electron-e2e] Screenshot: ${filePath}\n`);
  });
});

describeE2E('Electron Toolbar E2E: Update Banner (CDP)', () => {
  let serverInfo;
  let displayInfo;
  let electronProcess;
  let cdp;

  beforeAll(async () => {
    displayInfo = ensureDisplay();
    serverInfo = await startRealServer();

    electronProcess = spawnElectron({
      opencodePort: serverInfo.port,
      sessionId: serverInfo.sessionId,
      taskId: 'e2e-update-test',
      display: displayInfo.display,
      extraEnv: { SIDECAR_MOCK_UPDATE: 'available' },
    });

    cdp = await CdpClient.toolbar(CDP_PORT, 20000);
  }, 30000);

  afterAll(async () => {
    if (cdp) { cdp.close(); }
    if (electronProcess) {
      electronProcess.kill('SIGTERM');
      await new Promise(resolve => {
        electronProcess.on('close', resolve);
        setTimeout(() => {
          try { electronProcess.kill('SIGKILL'); } catch { /* already dead */ }
          resolve();
        }, 3000);
      });
    }
    if (serverInfo) { serverInfo.cleanup(); }
    displayInfo.cleanup();
  });

  it('update banner is visible when update available', async () => {
    // Wait for banner to render
    await cdp.waitForSelector('#update-banner');
    const display = await cdp.evaluate(
      `document.getElementById('update-banner')?.style?.display`
    );
    expect(display).toBe('flex');
  });

  it('update banner shows version text', async () => {
    const text = await cdp.evaluate(
      `document.getElementById('update-text')?.textContent`
    );
    expect(text).toContain('available');
  });

  it('captures update banner screenshot', async () => {
    const screenshotDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    const filePath = path.join(screenshotDir, 'toolbar-update-banner.png');
    await cdp.screenshot(filePath);

    expect(fs.existsSync(filePath)).toBe(true);
    process.stderr.write(`  [electron-e2e] Screenshot: ${filePath}\n`);
  });
});
```

**Step 2: Run test to verify it passes**

```bash
npm test tests/electron-toolbar-e2e.integration.test.js
```

Expected: All 10 tests PASS (7 toolbar + 3 update banner). If `OPENROUTER_API_KEY` is missing or Electron not installed, tests are skipped.

**Step 3: Commit**

```bash
git add tests/electron-toolbar-e2e.integration.test.js
git commit -m "feat: add Electron toolbar E2E tests via CDP"
```

---

### Task 5: Run full test suite and verify

**Step 1: Run all tests**

```bash
npm test
```

Expected: All suites pass, including the new ones:
- `tests/helpers/cdp-client.test.js` (8 tests)
- `tests/electron-headless-mode.test.js` (1 test)
- `tests/electron-toolbar-e2e.integration.test.js` (10 tests, may be skipped without API key)

**Step 2: Run lint**

```bash
npm run lint
```

Expected: No lint errors

**Step 3: Verify screenshots generated**

```bash
ls -la tests/screenshots/
```

Expected: `toolbar-default.png` and `toolbar-update-banner.png` exist (if E2E tests ran)

**Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: address test suite issues from electron CDP E2E"
```

---

### Task 6: Update CLAUDE.md test table

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add new test files to the test table**

In the "What to Unit Test" table (around line 370), add:

```
| `helpers/cdp-client.test.js` | CDP helper | Target discovery, evaluate, screenshot |
| `electron-headless-mode.test.js` | Electron test mode | SIDECAR_HEADLESS_TEST env guard |
| `electron-toolbar-e2e.integration.test.js` | Toolbar E2E | CDP DOM assertions, screenshot capture |
```

**Step 2: Update test count**

Run `npm test` and update the test count in CLAUDE.md header comment and any references.

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Electron CDP E2E tests to CLAUDE.md test table"
```
