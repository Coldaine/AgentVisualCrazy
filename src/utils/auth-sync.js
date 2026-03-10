/**
 * OpenCode Auth Sync
 *
 * Keeps OPENROUTER_API_KEY in ~/.config/sidecar/.env and
 * ~/.local/share/opencode/auth.json in sync so there is never
 * a conflict between the two credential stores.
 *
 * Source of truth priority: .env > auth.json
 * - If .env has a key and auth.json differs → update auth.json, log warning
 * - If .env has a key and auth.json is missing/empty → populate auth.json
 * - If .env has no key but auth.json does → set process.env from auth.json
 * - If neither has a key → no-op
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { logger } = require('./logger');

const AUTH_JSON_PATH = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');

/**
 * Read and parse auth.json. Returns null if file doesn't exist or is malformed.
 * @returns {{ parsed: object|null, malformed: boolean }}
 */
function readAuthJson() {
  if (!fs.existsSync(AUTH_JSON_PATH)) {
    return { parsed: null, malformed: false };
  }
  try {
    return { parsed: JSON.parse(fs.readFileSync(AUTH_JSON_PATH, 'utf-8')), malformed: false };
  } catch {
    return { parsed: null, malformed: true };
  }
}

/**
 * Write updated content to auth.json, creating parent dirs as needed.
 * @param {object} content
 */
function writeAuthJson(content) {
  fs.mkdirSync(path.dirname(AUTH_JSON_PATH), { recursive: true });
  fs.writeFileSync(AUTH_JSON_PATH, JSON.stringify(content, null, 2), 'utf-8');
}

/**
 * Sync OPENROUTER_API_KEY between process.env and auth.json.
 * Called at sidecar startup after dotenv loads.
 */
function syncOpenCodeAuth() {
  const envKey = process.env.OPENROUTER_API_KEY;
  const { parsed, malformed } = readAuthJson();
  const fileKey = parsed?.openrouter?.key;

  // Both match — nothing to do
  if (envKey && fileKey && envKey === fileKey) {
    return;
  }

  // .env has key but auth.json is missing, empty, malformed, or different
  if (envKey) {
    const base = (malformed || !parsed) ? {} : parsed;
    if (fileKey && fileKey !== envKey) {
      logger.warn({
        msg: 'OPENROUTER_API_KEY out of sync between .env and auth.json — updating auth.json',
        authJsonPath: AUTH_JSON_PATH,
      });
    }
    writeAuthJson({
      ...base,
      openrouter: { ...(base.openrouter || {}), type: 'api', key: envKey },
    });
    return;
  }

  // .env has no key but auth.json does — set env from file
  if (!envKey && fileKey) {
    process.env.OPENROUTER_API_KEY = fileKey;
    return;
  }

  // Neither has a key — no-op
}

module.exports = { syncOpenCodeAuth, AUTH_JSON_PATH };
