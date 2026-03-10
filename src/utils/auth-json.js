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

module.exports = {
  readAuthJsonKeys,
  importFromAuthJson,
  checkAuthJson,
  removeFromAuthJson,
  AUTH_JSON_PATH,
  KNOWN_PROVIDERS
};
