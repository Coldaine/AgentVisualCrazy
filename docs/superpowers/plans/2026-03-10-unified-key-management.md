# Unified Key Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate API key management to a single source of truth (`~/.config/sidecar/.env`) with import-only relationship to OpenCode's auth.json.

**Architecture:** Replace bidirectional auth-sync with a read-only auth-json module. Remove all project `.env` loading. Add auto-import on wizard open and two-phase smart delete with user confirmation.

**Tech Stack:** Node.js, Jest, Electron IPC

**Spec:** `docs/superpowers/specs/2026-03-10-unified-key-management-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/utils/auth-json.js` | Read-only import from auth.json + optional delete |
| Create | `tests/auth-json.test.js` | Tests for auth-json.js (replaces auth-sync.test.js) |
| Modify | `src/utils/api-key-store.js` | Remove `cleanAuthJson()`, update `removeApiKey()` return type |
| Modify | `tests/api-key-store-readwrite.test.js` | Invert auth.json cleanup test, add `alsoInAuthJson` test |
| Modify | `bin/sidecar.js` | Remove project `.env` load (line 12), remove sync call (lines 18-21) |
| Modify | `src/index.js` | Remove bare `dotenv.config()` (line 8) |
| Modify | `electron/ipc-setup.js` | Update `get-api-keys`, `remove-key` handlers; add `remove-from-opencode` |
| Modify | `electron/preload-setup.js` | Add `sidecar:remove-from-opencode` to allowed channels |
| Modify | `electron/setup-ui-keys-script.js` | Two-phase delete with confirmation; import notice |
| Modify | `electron/setup-ui-styles.js` | CSS for import notice banner |
| Modify | `electron/setup-ui.js` | Import notice placeholder in Step 1 HTML |
| Delete | `src/utils/auth-sync.js` | Replaced by `auth-json.js` |
| Delete | `tests/auth-sync.test.js` | Replaced by `tests/auth-json.test.js` |

---

## Chunk 1: Core Module (auth-json.js + tests)

### Task 1: Create auth-json.js with readAuthJsonKeys()

**Files:**
- Create: `src/utils/auth-json.js`
- Create: `tests/auth-json.test.js`

- [ ] **Step 1: Write failing tests for readAuthJsonKeys()**

Create `tests/auth-json.test.js`:

```javascript
/**
 * Tests for src/utils/auth-json.js
 *
 * Read-only import from OpenCode's auth.json + optional delete.
 * Replaces the old bidirectional auth-sync.js module.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('fs');
jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

const AUTH_JSON_PATH = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');

function mockAuthJson(content) {
  fs.existsSync.mockImplementation((p) => p === AUTH_JSON_PATH);
  fs.readFileSync.mockImplementation((p) => {
    if (p === AUTH_JSON_PATH) { return JSON.stringify(content); }
    throw new Error(`ENOENT: ${p}`);
  });
}

function mockAuthJsonMissing() {
  fs.existsSync.mockReturnValue(false);
}

// Require after mocks
const { readAuthJsonKeys } = require('../src/utils/auth-json');

describe('readAuthJsonKeys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.readFileSync = jest.fn();
  });

  test('returns empty object when auth.json does not exist', () => {
    mockAuthJsonMissing();
    expect(readAuthJsonKeys()).toEqual({});
  });

  test('reads openrouter key from .key field', () => {
    mockAuthJson({ openrouter: { type: 'api', key: 'sk-or-v1-abc' } });
    const result = readAuthJsonKeys();
    expect(result.openrouter).toBe('sk-or-v1-abc');
  });

  test('reads openrouter key from .apiKey field (SKILL.md format)', () => {
    mockAuthJson({ openrouter: { apiKey: 'sk-or-v1-alt' } });
    const result = readAuthJsonKeys();
    expect(result.openrouter).toBe('sk-or-v1-alt');
  });

  test('prefers .key over .apiKey for openrouter', () => {
    mockAuthJson({ openrouter: { key: 'from-key', apiKey: 'from-apiKey' } });
    const result = readAuthJsonKeys();
    expect(result.openrouter).toBe('from-key');
  });

  test('reads google key from .apiKey field', () => {
    mockAuthJson({ google: { apiKey: 'AIza-test' } });
    const result = readAuthJsonKeys();
    expect(result.google).toBe('AIza-test');
  });

  test('reads google key from .key field as fallback', () => {
    mockAuthJson({ google: { key: 'AIza-fallback' } });
    const result = readAuthJsonKeys();
    expect(result.google).toBe('AIza-fallback');
  });

  test('reads multiple providers', () => {
    mockAuthJson({
      openrouter: { key: 'sk-or-v1-abc' },
      google: { apiKey: 'AIza-test' },
      anthropic: { key: 'sk-ant-test' }
    });
    const result = readAuthJsonKeys();
    expect(result.openrouter).toBe('sk-or-v1-abc');
    expect(result.google).toBe('AIza-test');
    expect(result.anthropic).toBe('sk-ant-test');
    expect(result.openai).toBeUndefined();
  });

  test('ignores providers not in KNOWN_PROVIDERS', () => {
    mockAuthJson({ unknown_provider: { key: 'secret' } });
    const result = readAuthJsonKeys();
    expect(result.unknown_provider).toBeUndefined();
  });

  test('returns empty object for malformed auth.json', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('not valid json {{');
    expect(readAuthJsonKeys()).toEqual({});
  });

  test('skips entries with empty key values', () => {
    mockAuthJson({ openrouter: { key: '' } });
    expect(readAuthJsonKeys()).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/auth-json.test.js`
Expected: FAIL -- module `../src/utils/auth-json` not found

- [ ] **Step 3: Write auth-json.js with readAuthJsonKeys()**

Create `src/utils/auth-json.js`:

```javascript
/**
 * Auth JSON Reader
 *
 * Read-only interface to OpenCode's auth.json (~/.local/share/opencode/auth.json).
 * Used for one-time key import into sidecar's .env and optional cleanup on delete.
 * Sidecar never writes keys TO auth.json -- only reads and optionally removes.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { logger } = require('./logger');

const AUTH_JSON_PATH = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');

/** Known provider IDs that map to sidecar's PROVIDER_ENV_MAP */
const KNOWN_PROVIDERS = ['openrouter', 'google', 'openai', 'anthropic', 'deepseek'];

/**
 * Extract key value from an auth.json provider entry.
 * Checks both .key and .apiKey fields (OpenCode uses both formats).
 * @param {object} entry - Provider entry from auth.json
 * @returns {string|undefined} Key string, or undefined if not found
 */
function extractKey(entry) {
  if (!entry || typeof entry !== 'object') { return undefined; }
  const fromKey = entry.key;
  if (typeof fromKey === 'string' && fromKey.length > 0) { return fromKey; }
  const fromApiKey = entry.apiKey;
  if (typeof fromApiKey === 'string' && fromApiKey.length > 0) { return fromApiKey; }
  return undefined;
}

/**
 * Read and parse auth.json into a normalized provider-key map.
 * Only returns keys for known providers (openrouter, google, openai, anthropic, deepseek).
 * @returns {Object<string, string>} Map of provider -> key string (only providers with keys)
 */
function readAuthJsonKeys() {
  if (!fs.existsSync(AUTH_JSON_PATH)) { return {}; }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(AUTH_JSON_PATH, 'utf-8'));
  } catch (_err) {
    logger.debug('auth.json is malformed, skipping import');
    return {};
  }
  if (!parsed || typeof parsed !== 'object') { return {}; }

  const result = {};
  for (const provider of KNOWN_PROVIDERS) {
    const key = extractKey(parsed[provider]);
    if (key) { result[provider] = key; }
  }
  return result;
}

module.exports = { readAuthJsonKeys, AUTH_JSON_PATH, KNOWN_PROVIDERS };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/auth-json.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/auth-json.js tests/auth-json.test.js
git commit -m "feat: add auth-json.js with readAuthJsonKeys() for import-only auth.json reading"
```

---

### Task 2: Add importFromAuthJson()

**Files:**
- Modify: `src/utils/auth-json.js`
- Modify: `tests/auth-json.test.js`

- [ ] **Step 1: Write failing tests for importFromAuthJson()**

Append to `tests/auth-json.test.js`, after the `readAuthJsonKeys` describe block:

```javascript
const { importFromAuthJson } = require('../src/utils/auth-json');

describe('importFromAuthJson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.readFileSync = jest.fn();
  });

  test('returns imported keys not in existingKeys', () => {
    mockAuthJson({
      openrouter: { key: 'sk-or-v1-abc' },
      google: { apiKey: 'AIza-test' }
    });
    const existing = { google: true }; // google already in sidecar
    const result = importFromAuthJson(existing);
    expect(result.imported).toEqual([
      { provider: 'openrouter', key: 'sk-or-v1-abc' }
    ]);
  });

  test('returns empty imported when all keys already exist', () => {
    mockAuthJson({ openrouter: { key: 'sk-or-v1-abc' } });
    const existing = { openrouter: true };
    const result = importFromAuthJson(existing);
    expect(result.imported).toEqual([]);
  });

  test('returns empty imported when auth.json missing', () => {
    mockAuthJsonMissing();
    const result = importFromAuthJson({});
    expect(result.imported).toEqual([]);
  });

  test('imports multiple new keys at once', () => {
    mockAuthJson({
      openrouter: { key: 'sk-or-v1-abc' },
      google: { apiKey: 'AIza-test' },
      anthropic: { key: 'sk-ant-test' }
    });
    const result = importFromAuthJson({});
    expect(result.imported).toHaveLength(3);
    expect(result.imported.map(i => i.provider)).toEqual(
      expect.arrayContaining(['openrouter', 'google', 'anthropic'])
    );
  });

  test('handles empty existingKeys', () => {
    mockAuthJson({ deepseek: { key: 'sk-ds-abc' } });
    const result = importFromAuthJson({});
    expect(result.imported).toEqual([
      { provider: 'deepseek', key: 'sk-ds-abc' }
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/auth-json.test.js`
Expected: FAIL -- `importFromAuthJson` not exported

- [ ] **Step 3: Implement importFromAuthJson()**

Add to `src/utils/auth-json.js` before `module.exports`:

```javascript
/**
 * Find keys in auth.json that are not already in sidecar's .env.
 * @param {Object<string, boolean>} existingKeys - Which providers already have keys in sidecar
 * @returns {{ imported: Array<{provider: string, key: string}> }}
 */
function importFromAuthJson(existingKeys) {
  const authKeys = readAuthJsonKeys();
  const imported = [];
  for (const [provider, key] of Object.entries(authKeys)) {
    if (!existingKeys[provider]) {
      imported.push({ provider, key });
    }
  }
  return { imported };
}
```

Update `module.exports` to include `importFromAuthJson`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/auth-json.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/auth-json.js tests/auth-json.test.js
git commit -m "feat: add importFromAuthJson() for one-time key discovery"
```

---

### Task 3: Add checkAuthJson() and removeFromAuthJson()

**Files:**
- Modify: `src/utils/auth-json.js`
- Modify: `tests/auth-json.test.js`

- [ ] **Step 1: Write failing tests for checkAuthJson() and removeFromAuthJson()**

Append to `tests/auth-json.test.js`:

```javascript
const { checkAuthJson, removeFromAuthJson } = require('../src/utils/auth-json');

describe('checkAuthJson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.readFileSync = jest.fn();
  });

  test('returns true when provider has key in auth.json', () => {
    mockAuthJson({ openrouter: { key: 'sk-or-v1-abc' } });
    expect(checkAuthJson('openrouter')).toBe(true);
  });

  test('returns false when provider not in auth.json', () => {
    mockAuthJson({ google: { apiKey: 'AIza-test' } });
    expect(checkAuthJson('openrouter')).toBe(false);
  });

  test('returns false when auth.json missing', () => {
    mockAuthJsonMissing();
    expect(checkAuthJson('openrouter')).toBe(false);
  });

  test('returns false for unknown provider', () => {
    mockAuthJson({ unknown: { key: 'test' } });
    expect(checkAuthJson('unknown')).toBe(false);
  });
});

describe('removeFromAuthJson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.readFileSync = jest.fn();
    fs.writeFileSync = jest.fn();
  });

  test('removes openrouter entry from auth.json', () => {
    mockAuthJson({
      openrouter: { key: 'sk-or-v1-abc' },
      google: { apiKey: 'AIza-keep' }
    });
    removeFromAuthJson('openrouter');
    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(written.openrouter).toBeUndefined();
    expect(written.google.apiKey).toBe('AIza-keep');
  });

  test('removes google entry from auth.json', () => {
    mockAuthJson({ google: { apiKey: 'AIza-remove' } });
    removeFromAuthJson('google');
    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(written.google).toBeUndefined();
  });

  test('removes anthropic entry from auth.json', () => {
    mockAuthJson({ anthropic: { key: 'sk-ant-remove' } });
    removeFromAuthJson('anthropic');
    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(written.anthropic).toBeUndefined();
  });

  test('no-op when auth.json missing', () => {
    mockAuthJsonMissing();
    removeFromAuthJson('openrouter');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test('no-op when provider not in auth.json', () => {
    mockAuthJson({ google: { apiKey: 'AIza-keep' } });
    removeFromAuthJson('openrouter');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test('does not throw on malformed auth.json', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('invalid json');
    expect(() => removeFromAuthJson('openrouter')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/auth-json.test.js`
Expected: FAIL -- functions not exported

- [ ] **Step 3: Implement checkAuthJson() and removeFromAuthJson()**

Add to `src/utils/auth-json.js` before `module.exports`:

```javascript
/**
 * Check if a provider has a key in auth.json.
 * @param {string} provider - Provider ID
 * @returns {boolean}
 */
function checkAuthJson(provider) {
  if (!KNOWN_PROVIDERS.includes(provider)) { return false; }
  const keys = readAuthJsonKeys();
  return !!keys[provider];
}

/**
 * Remove a provider entry from auth.json.
 * Best-effort: does not throw on errors.
 * @param {string} provider - Provider ID to remove
 */
function removeFromAuthJson(provider) {
  try {
    if (!fs.existsSync(AUTH_JSON_PATH)) { return; }
    const parsed = JSON.parse(fs.readFileSync(AUTH_JSON_PATH, 'utf-8'));
    if (!parsed[provider]) { return; }
    delete parsed[provider];
    fs.writeFileSync(AUTH_JSON_PATH, JSON.stringify(parsed, null, 2), 'utf-8');
  } catch (_err) {
    logger.debug('Failed to remove provider from auth.json', { provider });
  }
}
```

Update `module.exports` to include all four functions:

```javascript
module.exports = {
  readAuthJsonKeys,
  importFromAuthJson,
  checkAuthJson,
  removeFromAuthJson,
  AUTH_JSON_PATH,
  KNOWN_PROVIDERS
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/auth-json.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/auth-json.js tests/auth-json.test.js
git commit -m "feat: add checkAuthJson() and removeFromAuthJson() for smart delete"
```

---

## Chunk 2: Update api-key-store.js + Remove Old Sync

### Task 4: Update removeApiKey() to return alsoInAuthJson

**Files:**
- Modify: `src/utils/api-key-store.js`
- Modify: `tests/api-key-store-readwrite.test.js`

- [ ] **Step 1: Write failing test for new removeApiKey() behavior**

In `tests/api-key-store-readwrite.test.js`, replace the existing "should remove openrouter entry from auth.json to prevent resurrection" test with these two tests:

```javascript
    it('should NOT auto-clean auth.json on removal', () => {
      const authJsonPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
      let originalAuth = null;
      try { originalAuth = fs.readFileSync(authJsonPath, 'utf-8'); } catch (_e) { /* no file */ }

      try {
        fs.mkdirSync(path.dirname(authJsonPath), { recursive: true });
        fs.writeFileSync(authJsonPath, JSON.stringify({
          openrouter: { type: 'api', key: 'sk-or-v1-stale' }
        }));

        fs.writeFileSync(
          path.join(tmpDir, '.env'),
          'OPENROUTER_API_KEY=sk-or-v1-stale\n'
        );

        const result = removeApiKey('openrouter');

        // auth.json should still have the key (no auto-clean)
        const authContent = JSON.parse(fs.readFileSync(authJsonPath, 'utf-8'));
        expect(authContent.openrouter).toBeDefined();
        // But result should indicate it is also in auth.json
        expect(result.alsoInAuthJson).toBe(true);
      } finally {
        if (originalAuth !== null) {
          fs.writeFileSync(authJsonPath, originalAuth, 'utf-8');
        } else {
          try { fs.unlinkSync(authJsonPath); } catch (_e) { /* ignore */ }
        }
      }
    });

    it('should return alsoInAuthJson: false when key not in auth.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.env'),
        'GEMINI_API_KEY=AIza-test\n'
      );

      const result = removeApiKey('google');
      expect(result.success).toBe(true);
      expect(result.alsoInAuthJson).toBe(false);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/api-key-store-readwrite.test.js`
Expected: FAIL -- `result.alsoInAuthJson` is undefined

- [ ] **Step 3: Update removeApiKey() in api-key-store.js**

Replace the `removeApiKey` function (lines 197-233) and delete `cleanAuthJson` (lines 235-250):

```javascript
/** Remove an API key for a provider from the .env file */
function removeApiKey(provider) {
  const envVar = PROVIDER_ENV_MAP[provider];
  if (!envVar) {
    return { success: false, error: `Unknown provider: ${provider}` };
  }

  const envPath = getEnvPath();
  try {
    if (!fs.existsSync(envPath)) {
      const { checkAuthJson } = require('./auth-json');
      return { success: true, alsoInAuthJson: checkAuthJson(provider) };
    }
    const content = fs.readFileSync(envPath, 'utf-8');
    const lines = content.split('\n').filter(line => {
      return !line.trim().startsWith(envVar + '=');
    });

    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }

    const output = lines.length > 0 ? lines.join('\n') + '\n' : '';
    fs.writeFileSync(envPath, output, { mode: 0o600 });
  } catch (_err) {
    // Ignore
  }

  delete process.env[envVar];

  // Check if key also exists in auth.json (caller decides whether to clean)
  const { checkAuthJson } = require('./auth-json');
  return { success: true, alsoInAuthJson: checkAuthJson(provider) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/api-key-store-readwrite.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/api-key-store.js tests/api-key-store-readwrite.test.js
git commit -m "refactor: removeApiKey() returns alsoInAuthJson flag, no auto-clean"
```

---

### Task 5: Remove dotenv project loading and auth-sync

**Files:**
- Modify: `bin/sidecar.js`
- Modify: `src/index.js`
- Delete: `src/utils/auth-sync.js`
- Delete: `tests/auth-sync.test.js`

- [ ] **Step 1: Remove project .env loading from bin/sidecar.js**

In `bin/sidecar.js`:

Delete line 10-12 (the comment and the `require('dotenv').config(...)` for project `.env`).

Update lines 14-16 to remove the "Also" and `override: false` (only one source now):

```javascript
// Load API keys from ~/.config/sidecar/.env (single source of truth)
const homeDir = process.env.HOME || process.env.USERPROFILE;
require('dotenv').config({ path: path.join(homeDir, '.config', 'sidecar', '.env'), quiet: true });
```

- [ ] **Step 2: Remove syncOpenCodeAuth call from bin/sidecar.js**

Delete lines 18-21:

```javascript
// Sync OPENROUTER_API_KEY between .env and ~/.local/share/opencode/auth.json
// so there is never a conflict between the two credential stores.
const { syncOpenCodeAuth } = require('../src/utils/auth-sync');
syncOpenCodeAuth();
```

- [ ] **Step 3: Remove bare dotenv.config() from src/index.js**

Delete line 8 (`require('dotenv').config({ quiet: true });`).

- [ ] **Step 4: Delete auth-sync.js and its test**

```bash
rm src/utils/auth-sync.js tests/auth-sync.test.js
```

- [ ] **Step 5: Run full test suite to verify nothing breaks**

Run: `npm test`
Expected: All existing tests pass. `auth-sync.test.js` no longer runs (deleted).

Possible breakages to check:
- Any file that imports from `auth-sync` -- only `bin/sidecar.js` did (already removed).
- Tests that depend on project `.env` loading -- should be isolated via `SIDECAR_ENV_DIR`.

- [ ] **Step 6: Commit**

```bash
git add bin/sidecar.js src/index.js
git rm src/utils/auth-sync.js tests/auth-sync.test.js
git commit -m "refactor: remove bidirectional auth-sync and project .env loading

Single source of truth is now ~/.config/sidecar/.env.
No more zombie key resurrection from auth.json.
No more project .env leaking dev keys into setup wizard."
```

---

## Chunk 3: Electron IPC + UI Changes

### Task 6: Update IPC handlers for import and two-phase delete

**Files:**
- Modify: `electron/ipc-setup.js`
- Modify: `electron/preload-setup.js`

- [ ] **Step 1: Update get-api-keys handler to include import results**

In `electron/ipc-setup.js`, replace the `sidecar:get-api-keys` handler (lines 83-86):

```javascript
  ipcMain.handle('sidecar:get-api-keys', () => {
    const { readApiKeys, readApiKeyHints, saveApiKey } = require('../src/utils/api-key-store');
    const { importFromAuthJson } = require('../src/utils/auth-json');
    const status = readApiKeys();
    const hints = readApiKeyHints();

    // Auto-import keys from auth.json that sidecar doesn't have yet
    const { imported } = importFromAuthJson(status);
    for (const entry of imported) {
      saveApiKey(entry.provider, entry.key);
      status[entry.provider] = true;
      const visible = entry.key.slice(0, 8);
      hints[entry.provider] = visible + '\u2022'.repeat(Math.max(0, Math.min(entry.key.length - 8, 12)));
    }

    return { status, hints, imported: imported.map(e => e.provider) };
  });
```

- [ ] **Step 2: Add remove-from-opencode handler**

Add after the `sidecar:remove-key` handler:

```javascript
  ipcMain.handle('sidecar:remove-from-opencode', async (_event, provider) => {
    try {
      const { removeFromAuthJson } = require('../src/utils/auth-json');
      removeFromAuthJson(provider);
      return { success: true };
    } catch (err) {
      logger.error('remove-from-opencode handler error', { error: err.message });
      return { success: false, error: err.message };
    }
  });
```

- [ ] **Step 3: Add new IPC channel to preload whitelist**

In `electron/preload-setup.js`, add `'sidecar:remove-from-opencode'` to the `allowedChannels` array (after `'sidecar:remove-key'`).

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc-setup.js electron/preload-setup.js
git commit -m "feat: add auto-import in get-api-keys and remove-from-opencode IPC handler"
```

---

### Task 7: Update wizard UI for import notice and smart delete

**Files:**
- Modify: `electron/setup-ui-keys-script.js`
- Modify: `electron/setup-ui.js`
- Modify: `electron/setup-ui-styles.js`

- [ ] **Step 1: Add import notice and confirm dialog CSS**

In `electron/setup-ui-styles.js`, add after the `.no-key-hint` styles:

```css
  .import-notice {
    background: #3D3A38; border: 1px solid #D97757; border-radius: 6px;
    padding: 8px 12px; margin-bottom: 12px; font-size: 11px;
    color: #D97757; display: flex; align-items: center; gap: 8px;
  }
  .import-notice .dismiss { cursor: pointer; margin-left: auto; opacity: 0.6; }
  .import-notice .dismiss:hover { opacity: 1; }
  .confirm-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5); display: flex; align-items: center;
    justify-content: center; z-index: 100;
  }
  .confirm-box {
    background: #2D2B2A; border: 1px solid #3D3A38; border-radius: 8px;
    padding: 20px; max-width: 360px; text-align: center;
  }
  .confirm-box p { margin-bottom: 16px; font-size: 13px; }
  .confirm-btns { display: flex; gap: 8px; justify-content: center; }
  .confirm-btns button {
    padding: 6px 16px; border-radius: 4px; border: 1px solid #3D3A38;
    background: #3D3A38; color: #E8E0D8; cursor: pointer; font-size: 12px;
  }
  .confirm-btns button.primary {
    background: #D97757; border-color: #D97757; color: #1A1918;
  }
```

- [ ] **Step 2: Add import notice placeholder to wizard HTML**

In `electron/setup-ui.js`, in the `buildSetupHTML` function, change:

```javascript
    <div class="wizard-step visible" id="wizard-step-1">${keysHtml}</div>
```

to:

```javascript
    <div class="wizard-step visible" id="wizard-step-1"><div id="import-notice"></div>${keysHtml}</div>
```

- [ ] **Step 3: Update keys script for import notice and two-phase delete**

In `electron/setup-ui-keys-script.js`, replace the `removeBtn` click handler (lines 99-112) with:

```javascript
  removeBtn.addEventListener('click', async function() {
    if (!selectedProvider) { return; }
    removeBtn.disabled = true;
    try {
      var res = await window.sidecarSetup.invoke('sidecar:remove-key', selectedProvider.id);
      delete configuredKeys[selectedProvider.id]; delete keyHints[selectedProvider.id];
      var c = document.getElementById('check-' + selectedProvider.id);
      if (c) { c.textContent = ''; }
      keyInput.value = ''; keyInput.type = 'password'; keyValid = false; setInputState(null);
      statusMsg.textContent = 'Key removed'; statusMsg.className = 'status-testing';
      removeBtn.style.display = 'none'; updateNextState();

      // Phase 2: if key also in OpenCode auth.json, prompt user
      if (res && res.alsoInAuthJson) {
        showConfirmDialog(
          'This key also exists in OpenCode. Remove it from OpenCode too?',
          async function() {
            await window.sidecarSetup.invoke('sidecar:remove-from-opencode', selectedProvider.id);
          }
        );
      }
    } catch (_e) { statusMsg.textContent = 'Failed to remove'; statusMsg.className = 'status-invalid'; }
    removeBtn.disabled = false;
  });

  function showConfirmDialog(message, onConfirm) {
    var overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    var box = document.createElement('div');
    box.className = 'confirm-box';
    var p = document.createElement('p');
    p.textContent = message;
    box.appendChild(p);
    var btns = document.createElement('div');
    btns.className = 'confirm-btns';
    var noBtn = document.createElement('button');
    noBtn.className = 'secondary';
    noBtn.textContent = 'Sidecar only';
    var yesBtn = document.createElement('button');
    yesBtn.className = 'primary';
    yesBtn.textContent = 'Remove from both';
    btns.appendChild(noBtn);
    btns.appendChild(yesBtn);
    box.appendChild(btns);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    yesBtn.addEventListener('click', async function() {
      await onConfirm();
      overlay.remove();
    });
    noBtn.addEventListener('click', function() {
      overlay.remove();
    });
  }
```

- [ ] **Step 4: Add import notice display to wizard init**

In `electron/setup-ui.js`, in the `buildWizardScript` function, inside the init async block (around line 87, after `updateNextState()`), add:

```javascript
      if (data.imported && data.imported.length > 0) {
        var notice = document.getElementById('import-notice');
        if (notice) {
          var noticeDiv = document.createElement('div');
          noticeDiv.className = 'import-notice';
          noticeDiv.textContent = 'Imported ' + data.imported.length + ' key(s) from OpenCode: ' + data.imported.join(', ');
          var dismissBtn = document.createElement('span');
          dismissBtn.className = 'dismiss';
          dismissBtn.textContent = String.fromCharCode(0xD7);
          dismissBtn.addEventListener('click', function() { notice.removeChild(noticeDiv); });
          noticeDiv.appendChild(dismissBtn);
          notice.appendChild(noticeDiv);
        }
      }
```

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add electron/setup-ui-keys-script.js electron/setup-ui.js electron/setup-ui-styles.js
git commit -m "feat: import notice banner and two-phase delete with OpenCode confirmation"
```

---

## Chunk 4: Cleanup + Final Verification

### Task 8: Update CLAUDE.md and run full verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

In the Key Modules table under "Supporting Modules", replace the `auth-sync.js` row:

Old: `| \`utils/auth-sync.js\` | Sync API keys between .env and auth.json | \`syncOpenCodeAuth()\` |`
New: `| \`utils/auth-json.js\` | Read-only import from OpenCode auth.json | \`readAuthJsonKeys()\`, \`importFromAuthJson()\`, \`checkAuthJson()\`, \`removeFromAuthJson()\` |`

Also update the test file table:
Old: `| \`auth-sync.test.js\` | Auth sync | Matching keys no-op, conflict resolution, bidirectional sync |`
New: `| \`auth-json.test.js\` | Auth JSON reader | Import discovery, provider mapping, smart delete check |`

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All PASS, 0 failures

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Verify the fix end-to-end**

Run this diagnostic to confirm the zombie key is gone:

```bash
node -e "
const path = require('path');
const homeDir = require('os').homedir();
require('dotenv').config({ path: path.join(homeDir, '.config', 'sidecar', '.env'), quiet: true });
const { readApiKeys } = require('./src/utils/api-key-store');
console.log('readApiKeys:', JSON.stringify(readApiKeys()));
// Should NOT show openrouter: true unless user actually has the key in sidecar .env
"
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for auth-json.js replacing auth-sync.js"
```
