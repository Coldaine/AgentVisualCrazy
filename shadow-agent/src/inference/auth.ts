/**
 * Credential loader for the inference engine.
 *
 * Priority chain:
 *  1. Already set in process.env (skip — already done)
 *  2. ~/.shadow-agent/.env (dotenv-style, manual parse to avoid a heavy dep)
 *  3. ~/.local/share/opencode/auth.json (OpenCode auth store)
 *
 * Sets process.env variables so downstream code can use them transparently.
 * Safe to call multiple times — no-ops if the key is already set.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '../shared/logger';

const logger = createLogger({ minLevel: 'info' });

/** Maps OpenCode provider name → env variable name */
const PROVIDER_ENV_MAP: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  google: 'GOOGLE_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
};

function setIfMissing(key: string, value: string): boolean {
  if (process.env[key]) return false;
  process.env[key] = value;
  return true;
}

/** Parse a .env file (KEY=VALUE, # comments, blank lines ignored). */
function parseDotenv(contents: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

async function loadDotenvFile(): Promise<void> {
  const envPath = join(homedir(), '.shadow-agent', '.env');
  try {
    const contents = await readFile(envPath, 'utf8');
    const pairs = parseDotenv(contents);
    let loaded = 0;
    for (const [key, value] of Object.entries(pairs)) {
      if (setIfMissing(key, value)) loaded++;
    }
    if (loaded > 0) {
      logger.info('inference', 'auth.dotenv_loaded', { path: envPath, keys: loaded });
    }
  } catch {
    // File doesn't exist — that's fine
  }
}

async function loadOpencodeAuth(): Promise<void> {
  const authPath = join(homedir(), '.local', 'share', 'opencode', 'auth.json');
  try {
    const raw = await readFile(authPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    let loaded = 0;
    for (const [provider, envKey] of Object.entries(PROVIDER_ENV_MAP)) {
      const value = (parsed[provider] as Record<string, string> | undefined)?.key
        ?? (parsed[provider] as string | undefined);
      if (typeof value === 'string' && value && setIfMissing(envKey, value)) {
        loaded++;
      }
    }
    if (loaded > 0) {
      logger.info('inference', 'auth.opencode_loaded', { path: authPath, keys: loaded });
    }
  } catch {
    // File doesn't exist — that's fine
  }
}

/**
 * Load credentials from all sources. Call once at app startup.
 * Reports which provider keys are now available (without logging values).
 */
export async function loadCredentials(): Promise<void> {
  await loadDotenvFile();
  await loadOpencodeAuth();

  const available = Object.values(PROVIDER_ENV_MAP).filter((k) => !!process.env[k]);
  logger.info('inference', 'auth.credentials_ready', { providers: available });
}

/** Returns true if any inference provider key is set. */
export function hasAnyCredential(): boolean {
  return Object.values(PROVIDER_ENV_MAP).some((k) => !!process.env[k]);
}
