# Update Checker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add self-updating capability with CLI notification and one-click Electron UI update.

**Architecture:** `update-notifier` handles background npm registry checks with 24h cache. A thin `updater.js` module wraps it for checking and spawns `npm install -g claude-sidecar@latest` for execution. The Electron toolbar gets a conditional update banner with an "Update" button, communicating via IPC. `SIDECAR_MOCK_UPDATE` env var enables visual testing without real updates.

**Tech Stack:** update-notifier ^7.0.0, Node.js child_process, Electron IPC

---

### Task 1: Install update-notifier dependency

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

Run: `npm install update-notifier`

**Step 2: Verify it's in package.json**

Run: `grep update-notifier package.json`
Expected: `"update-notifier": "^7.x.x"` in dependencies

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add update-notifier dependency"
```

---

### Task 2: Write updater module tests

**Files:**
- Create: `tests/updater.test.js`

**Step 1: Write the failing tests**

```javascript
/**
 * Tests for src/utils/updater.js
 */

// Mock update-notifier before requiring updater
const mockNotify = jest.fn();
const mockFetchInfo = jest.fn();
let mockUpdateInfo = undefined;

jest.mock('update-notifier', () => {
  return jest.fn(() => ({
    notify: mockNotify,
    fetchInfo: mockFetchInfo,
    update: mockUpdateInfo
  }));
});

// Mock child_process.spawn for performUpdate
const mockOn = jest.fn();
const mockStdout = { on: jest.fn() };
const mockStderr = { on: jest.fn() };
jest.mock('child_process', () => ({
  spawn: jest.fn(() => ({
    on: mockOn,
    stdout: mockStdout,
    stderr: mockStderr
  }))
}));

const { spawn } = require('child_process');

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateInfo = undefined;
  // Reset module to pick up new mockUpdateInfo
  jest.resetModules();
});

// Helper to require fresh updater with specific update state
function requireUpdater(updateState) {
  jest.resetModules();

  // Re-mock with desired state
  jest.doMock('update-notifier', () => {
    return jest.fn(() => ({
      notify: mockNotify,
      fetchInfo: mockFetchInfo,
      update: updateState
    }));
  });

  jest.doMock('child_process', () => ({
    spawn: jest.fn(() => ({
      on: mockOn,
      stdout: mockStdout,
      stderr: mockStderr
    }))
  }));

  return require('../src/utils/updater');
}

describe('updater', () => {
  describe('getUpdateInfo()', () => {
    test('returns null when no update available', () => {
      const { getUpdateInfo, initUpdateCheck } = requireUpdater(undefined);
      initUpdateCheck();
      expect(getUpdateInfo()).toBeNull();
    });

    test('returns update info when update is available', () => {
      const { getUpdateInfo, initUpdateCheck } = requireUpdater({
        current: '0.3.0',
        latest: '0.4.0',
        type: 'minor'
      });
      initUpdateCheck();
      const info = getUpdateInfo();
      expect(info).toEqual({
        current: '0.3.0',
        latest: '0.4.0',
        hasUpdate: true
      });
    });

    test('returns null when initUpdateCheck has not been called', () => {
      const { getUpdateInfo } = requireUpdater({
        current: '0.3.0',
        latest: '0.4.0',
        type: 'minor'
      });
      expect(getUpdateInfo()).toBeNull();
    });
  });

  describe('notifyUpdate()', () => {
    test('calls update-notifier notify()', () => {
      const { notifyUpdate, initUpdateCheck } = requireUpdater(undefined);
      initUpdateCheck();
      notifyUpdate();
      expect(mockNotify).toHaveBeenCalled();
    });
  });

  describe('initUpdateCheck()', () => {
    test('initializes update-notifier with package info', () => {
      const updateNotifier = require('update-notifier');
      const { initUpdateCheck } = requireUpdater(undefined);
      initUpdateCheck();
      const un = require('update-notifier');
      expect(un).toHaveBeenCalledWith(
        expect.objectContaining({
          pkg: expect.objectContaining({
            name: 'claude-sidecar'
          })
        })
      );
    });
  });

  describe('performUpdate()', () => {
    test('spawns npm install -g claude-sidecar@latest', async () => {
      const { performUpdate } = requireUpdater(undefined);
      const { spawn: mockSpawn } = require('child_process');

      // Simulate successful exit
      mockOn.mockImplementation((event, cb) => {
        if (event === 'close') { setTimeout(() => cb(0), 10); }
      });

      const result = await performUpdate();
      expect(mockSpawn).toHaveBeenCalledWith(
        'npm',
        ['install', '-g', 'claude-sidecar@latest'],
        expect.any(Object)
      );
      expect(result.success).toBe(true);
    });

    test('returns error on non-zero exit code', async () => {
      const { performUpdate } = requireUpdater(undefined);

      mockOn.mockImplementation((event, cb) => {
        if (event === 'close') { setTimeout(() => cb(1), 10); }
      });

      const result = await performUpdate();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('returns error when spawn throws', async () => {
      const { performUpdate } = requireUpdater(undefined);
      const { spawn: mockSpawn } = require('child_process');

      mockSpawn.mockImplementation(() => { throw new Error('ENOENT'); });

      const result = await performUpdate();
      expect(result.success).toBe(false);
      expect(result.error).toContain('ENOENT');
    });
  });

  describe('SIDECAR_MOCK_UPDATE', () => {
    test('mock "available" returns fake update info', () => {
      process.env.SIDECAR_MOCK_UPDATE = 'available';
      const { getUpdateInfo, initUpdateCheck } = requireUpdater(undefined);
      initUpdateCheck();
      const info = getUpdateInfo();
      expect(info).toEqual({
        current: expect.any(String),
        latest: '99.0.0',
        hasUpdate: true
      });
      delete process.env.SIDECAR_MOCK_UPDATE;
    });

    test('mock "success" makes performUpdate resolve immediately', async () => {
      process.env.SIDECAR_MOCK_UPDATE = 'success';
      const { performUpdate } = requireUpdater(undefined);
      const result = await performUpdate();
      expect(result.success).toBe(true);
      expect(result.newVersion).toBe('99.0.0');
      delete process.env.SIDECAR_MOCK_UPDATE;
    });

    test('mock "error" makes performUpdate fail', async () => {
      process.env.SIDECAR_MOCK_UPDATE = 'error';
      const { performUpdate } = requireUpdater(undefined);
      const result = await performUpdate();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      delete process.env.SIDECAR_MOCK_UPDATE;
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test tests/updater.test.js`
Expected: FAIL — `Cannot find module '../src/utils/updater'`

**Step 3: Commit**

```bash
git add tests/updater.test.js
git commit -m "test: add failing tests for updater module"
```

---

### Task 3: Implement updater module

**Files:**
- Create: `src/utils/updater.js`

**Step 1: Implement the module**

```javascript
/**
 * Update checker and executor for claude-sidecar.
 *
 * Uses update-notifier for cached npm registry checks (24h TTL).
 * Provides one-click update via npm install -g.
 *
 * @module utils/updater
 */

const { spawn } = require('child_process');
const path = require('path');

const pkg = require(path.join(__dirname, '..', '..', 'package.json'));

let notifier = null;

/**
 * Initialize update-notifier and trigger background check.
 * Call once at CLI startup.
 */
function initUpdateCheck() {
  // In mock mode, skip real update-notifier
  if (process.env.SIDECAR_MOCK_UPDATE) {
    notifier = { notify: () => {}, update: null };
    return;
  }

  const updateNotifier = require('update-notifier');
  notifier = updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 24 });
}

/**
 * Get cached update info (no network call).
 * Supports SIDECAR_MOCK_UPDATE env var for UI testing.
 * @returns {{ current: string, latest: string, hasUpdate: boolean } | null}
 */
function getUpdateInfo() {
  const mockMode = process.env.SIDECAR_MOCK_UPDATE;
  if (mockMode === 'available' || mockMode === 'updating' || mockMode === 'success') {
    return { current: pkg.version, latest: '99.0.0', hasUpdate: true };
  }

  if (!notifier || !notifier.update) {
    return null;
  }

  return {
    current: notifier.update.current,
    latest: notifier.update.latest,
    hasUpdate: true
  };
}

/**
 * Print update notification box to stderr (CLI only).
 * Skips if no update available or non-TTY.
 */
function notifyUpdate() {
  if (!notifier) { return; }
  notifier.notify({
    message: 'Update available {currentVersion} → {latestVersion}\nRun: sidecar update'
  });
}

/**
 * Execute npm install -g claude-sidecar@latest.
 * Supports SIDECAR_MOCK_UPDATE env var for UI testing.
 * @returns {Promise<{ success: boolean, newVersion?: string, error?: string }>}
 */
function performUpdate() {
  const mockMode = process.env.SIDECAR_MOCK_UPDATE;
  if (mockMode === 'success') {
    return Promise.resolve({ success: true, newVersion: '99.0.0' });
  }
  if (mockMode === 'error') {
    return Promise.resolve({ success: false, error: 'Mock update error for testing' });
  }

  return new Promise((resolve) => {
    try {
      const child = spawn('npm', ['install', '-g', 'claude-sidecar@latest'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });

      let stderr = '';
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, newVersion: 'latest' });
        } else {
          resolve({ success: false, error: stderr || `npm exited with code ${code}` });
        }
      });

      child.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

module.exports = { initUpdateCheck, getUpdateInfo, notifyUpdate, performUpdate };
```

**Step 2: Run tests to verify they pass**

Run: `npm test tests/updater.test.js`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/utils/updater.js
git commit -m "feat: add updater module for update check and execution"
```

---

### Task 4: Integrate updater into CLI entry point

**Files:**
- Modify: `bin/sidecar.js`

**Step 1: Write failing test for CLI update command**

Add to `tests/cli.test.js` (or create `tests/cli-update.test.js` if cli.test.js is large):

```javascript
describe('sidecar update command', () => {
  test('update command is recognized', () => {
    const { parseArgs } = require('../src/cli');
    const args = parseArgs(['update']);
    expect(args._[0]).toBe('update');
  });
});
```

Run: `npm test tests/cli.test.js` (or the new file)
Expected: PASS (parseArgs already handles positional args)

**Step 2: Modify bin/sidecar.js**

Apply these changes to `bin/sidecar.js`:

1. Replace hardcoded VERSION with package.json read:

```javascript
// Replace: const VERSION = '0.1.0';
// With:
const VERSION = require('../package.json').version;
```

2. Add update check after arg parsing, before command dispatch (inside `main()`):

```javascript
  // After: const args = parseArgs(process.argv.slice(2));
  // Before: if (args.version) { ... }

  // Update check (skip for mcp, --version, --help)
  const command = args._[0];
  if (command !== 'mcp' && !args.version && !args.help) {
    const { initUpdateCheck, notifyUpdate } = require('../src/utils/updater');
    initUpdateCheck();
    // Notify at process exit to avoid delaying command output
    process.on('exit', () => { notifyUpdate(); });
  }
```

Note: Move `const command = args._[0];` up before the version/help checks.

3. Add `update` case in the switch:

```javascript
      case 'update':
        await handleUpdate();
        break;
```

4. Add the handler function:

```javascript
/**
 * Handle 'sidecar update' command
 * Runs npm install -g claude-sidecar@latest
 */
async function handleUpdate() {
  const { performUpdate, getUpdateInfo, initUpdateCheck } = require('../src/utils/updater');
  initUpdateCheck();

  const info = getUpdateInfo();
  if (info) {
    console.log(`Updating claude-sidecar ${info.current} → ${info.latest}...`);
  } else {
    console.log('Updating claude-sidecar to latest...');
  }

  const result = await performUpdate();
  if (result.success) {
    console.log(`Updated successfully! Run 'sidecar --version' to verify.`);
  } else {
    console.error(`Update failed: ${result.error}`);
    process.exit(1);
  }
}
```

**Step 3: Test manually**

Run: `node bin/sidecar.js --version`
Expected: `claude-sidecar v0.3.0` (matches package.json, not hardcoded 0.1.0)

Run: `node bin/sidecar.js update --help` (or just verify the command is dispatched)

**Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add bin/sidecar.js
git commit -m "feat: integrate updater into CLI with 'sidecar update' command"
```

---

### Task 5: Add update IPC to Electron preload

**Files:**
- Modify: `electron/preload.js`

**Step 1: Add update IPC channels to preload.js**

Add these to the `contextBridge.exposeInMainWorld('sidecar', { ... })` object:

```javascript
  /** Check if an update is available */
  getUpdateInfo: () => ipcRenderer.invoke('sidecar:get-update-info'),
  /** Trigger the update process */
  performUpdate: () => ipcRenderer.invoke('sidecar:perform-update'),
  /** Listen for update result */
  onUpdateResult: (callback) => ipcRenderer.on('sidecar:update-result', (_event, data) => callback(data)),
```

**Step 2: Commit**

```bash
git add electron/preload.js
git commit -m "feat: expose update IPC channels in preload"
```

---

### Task 6: Add IPC handlers in Electron main

**Files:**
- Modify: `electron/main.js`

**Step 1: Add IPC handlers for update flow**

In the IPC Handlers section of `electron/main.js`, add:

```javascript
// Update check
ipcMain.handle('sidecar:get-update-info', () => {
  const { getUpdateInfo, initUpdateCheck } = require('../src/utils/updater');
  initUpdateCheck();
  return getUpdateInfo();
});

// Perform update
ipcMain.handle('sidecar:perform-update', async () => {
  const { performUpdate } = require('../src/utils/updater');
  const result = await performUpdate();
  // Also send to toolbar window for banner update
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sidecar:update-result', result);
  }
  return result;
});
```

**Step 2: Commit**

```bash
git add electron/main.js
git commit -m "feat: add update IPC handlers in Electron main process"
```

---

### Task 7: Add update banner to toolbar

**Files:**
- Modify: `electron/toolbar.js`

**Step 1: Add update banner HTML/CSS/JS to buildToolbarHTML()**

Add to the `baseStyles` string:

```css
  .update-banner {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 32px;
    background: #3D3A38;
    border-bottom: 1px solid #4D4A48;
    display: none;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 12px;
    color: #D4D0CC;
    z-index: 100;
  }
  .update-banner .update-btn {
    padding: 2px 10px;
    background: #D97757;
    color: #FFF;
    border: none;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .update-banner .update-btn:hover { background: #C4623F; }
  .update-banner .update-btn:disabled { opacity: 0.5; cursor: default; }
  .update-banner .dismiss-btn {
    background: none;
    border: none;
    color: #7A756F;
    cursor: pointer;
    font-size: 14px;
    padding: 0 4px;
  }
  .update-banner .dismiss-btn:hover { color: #D4D0CC; }
  body { bottom: 0; }
```

Add the update banner div at the top of the sidecar mode HTML body (before the `.info` div):

```html
  <div class="update-banner" id="update-banner">
    <span id="update-text"></span>
    <button class="update-btn" id="update-btn">Update</button>
    <button class="dismiss-btn" id="dismiss-btn">&times;</button>
  </div>
```

Add this to the sidecar mode `<script>` block:

```javascript
  // Update banner logic
  (function() {
    var banner = document.getElementById('update-banner');
    var text = document.getElementById('update-text');
    var btn = document.getElementById('update-btn');
    var dismiss = document.getElementById('dismiss-btn');

    // Check for updates on load
    if (window.sidecar && window.sidecar.getUpdateInfo) {
      window.sidecar.getUpdateInfo().then(function(info) {
        if (info && info.hasUpdate) {
          text.textContent = 'v' + info.latest + ' available';
          banner.style.display = 'flex';
        }
      });
    }

    // Handle update button click
    btn.addEventListener('click', function() {
      btn.disabled = true;
      btn.textContent = 'Updating...';
      dismiss.style.display = 'none';
      if (window.sidecar && window.sidecar.performUpdate) {
        window.sidecar.performUpdate().then(function(result) {
          if (result && result.success) {
            text.textContent = 'Updated! Your next sidecar session will use the new version.';
            btn.style.display = 'none';
          } else {
            text.textContent = 'Update failed: ' + (result && result.error || 'unknown error');
            btn.textContent = 'Retry';
            btn.disabled = false;
            dismiss.style.display = '';
          }
        });
      }
    });

    // Handle dismiss
    dismiss.addEventListener('click', function() {
      banner.style.display = 'none';
    });

    // Listen for update result from main process
    if (window.sidecar && window.sidecar.onUpdateResult) {
      window.sidecar.onUpdateResult(function(result) {
        if (result && result.success) {
          text.textContent = 'Updated! Your next sidecar session will use the new version.';
          btn.style.display = 'none';
          dismiss.style.display = '';
        }
      });
    }
  })();
```

**Step 2: Adjust toolbar height for banner**

When the update banner is visible, the body needs to shift down. The banner uses `position: fixed; top: 0` and is 32px tall. Adjust the `TOOLBAR_H` export or handle it purely in CSS (the body is already `position: fixed; bottom: 0; height: 40px` so the banner sits above it naturally — no height change needed since the banner is in the same window).

**Step 3: Test visually with mock env var**

Run: `SIDECAR_MOCK_UPDATE=available node bin/sidecar.js start --model gemini --prompt "test"`
Expected: Electron window opens with update banner showing "v99.0.0 available" + "Update" button

Run: `SIDECAR_MOCK_UPDATE=success node bin/sidecar.js start --model gemini --prompt "test"`
Expected: Clicking "Update" shows success message immediately

Run: `SIDECAR_MOCK_UPDATE=error node bin/sidecar.js start --model gemini --prompt "test"`
Expected: Clicking "Update" shows error message with retry

**Step 4: Commit**

```bash
git add electron/toolbar.js
git commit -m "feat: add update banner to Electron toolbar with one-click update"
```

---

### Task 8: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add updater.js to Key Modules table**

In the "Supporting Modules (`src/`)" table, add:

```
| `utils/updater.js` | Update check & execute | `initUpdateCheck()`, `getUpdateInfo()`, `notifyUpdate()`, `performUpdate()` |
```

**Step 2: Add SIDECAR_MOCK_UPDATE to Environment Variables**

In the Configuration > Environment Variables section, add:

```
SIDECAR_MOCK_UPDATE=                    # Mock update state for UI testing: available, updating, success, error
```

**Step 3: Add updater.test.js to Testing Strategy table**

```
| `updater.test.js` | Update checker | Mock states, performUpdate spawn, CLI integration |
```

**Step 4: Add mock env var documentation to Electron UI Testing section**

Add a subsection under "Electron UI Testing":

```markdown
### Update Banner Mock Testing

Use `SIDECAR_MOCK_UPDATE` to test update UI states without real npm operations:

\`\`\`bash
SIDECAR_MOCK_UPDATE=available sidecar start --model gemini --prompt "test"  # Shows banner
SIDECAR_MOCK_UPDATE=success sidecar start --model gemini --prompt "test"    # Update succeeds
SIDECAR_MOCK_UPDATE=error sidecar start --model gemini --prompt "test"      # Update fails
\`\`\`
```

**Step 5: Add `update` to CLI commands list**

In Essential Commands > CLI Usage:

```
sidecar update                       # Update to latest version
```

**Step 6: Update test count if changed**

**Step 7: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document updater module, SIDECAR_MOCK_UPDATE, and update command"
```

---

### Task 9: Run full test suite and verify

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass (including new updater.test.js)

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 3: Check file sizes**

Run: `find src -name "*.js" -exec wc -l {} + | sort -n`
Expected: No file exceeds 300 lines

**Step 4: Final commit if any fixes needed**
