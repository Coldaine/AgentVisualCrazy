/**
 * Credential loader for the inference engine.
 *
 * Priority chain:
 *  1. Already set in process.env (skip — already done)
 *  2. ~/.shadow-agent/credentials.enc.json (Electron safeStorage encrypted store)
 *  3. ~/.shadow-agent/.env (legacy file fallback, requires explicit consent)
 *  4. ~/.local/share/opencode/auth.json (legacy OpenCode auth store, requires explicit consent)
 *
 * Sets process.env variables so downstream code can use them transparently.
 * Safe to call multiple times — no-ops if the key is already set.
 */
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '../shared/logger';
import { parseDotenv } from '../shared/dotenv';

const logger = createLogger({ minLevel: 'info' });
const SECURE_STORE_DIR_MODE = 0o700;
const SECURE_STORE_FILE_MODE = 0o600;
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export const LEGACY_FILE_FALLBACK_ENV = 'SHADOW_ALLOW_FILE_CREDENTIAL_FALLBACK';
export const SECURE_CREDENTIAL_STORE_FILE = 'credentials.enc.json';

/** Maps OpenCode provider name → env variable name */
const PROVIDER_ENV_MAP: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  google: 'GOOGLE_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
};

interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(buffer: Buffer): string;
}

interface SecureCredentialStoreFile {
  version: 1;
  cipher: 'electron.safeStorage';
  payload: string;
  updatedAt: string;
}

export interface CredentialLoaderOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  allowFileFallback?: boolean;
  safeStorage?: SafeStorageLike | null;
}

function setIfMissing(env: NodeJS.ProcessEnv, key: string, value: string): boolean {
  if (env[key]) return false;
  env[key] = value;
  return true;
}

function isTrueish(value: string | undefined): boolean {
  return typeof value === 'string' && TRUE_VALUES.has(value.trim().toLowerCase());
}

function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function getShadowAgentDir(homeDirPath: string): string {
  return join(homeDirPath, '.shadow-agent');
}

function getSecureStorePath(homeDirPath: string): string {
  return join(getShadowAgentDir(homeDirPath), SECURE_CREDENTIAL_STORE_FILE);
}

function getLegacyDotenvPath(homeDirPath: string): string {
  return join(getShadowAgentDir(homeDirPath), '.env');
}

function getOpencodeAuthPath(homeDirPath: string): string {
  return join(homeDirPath, '.local', 'share', 'opencode', 'auth.json');
}

async function getSafeStorage(options: CredentialLoaderOptions): Promise<SafeStorageLike | null> {
  if (options.safeStorage !== undefined) {
    return options.safeStorage;
  }

  try {
    const electron = await import('electron');
    return electron.safeStorage ?? null;
  } catch {
    return null;
  }
}

function filterSupportedCredentials(parsed: Record<string, unknown>): Record<string, string> {
  const credentials: Record<string, string> = {};
  for (const envKey of Object.values(PROVIDER_ENV_MAP)) {
    const value = parsed[envKey];
    if (typeof value === 'string' && value) {
      credentials[envKey] = value;
    }
  }
  return credentials;
}

async function ensureSecurePath(pathToWrite: string, mode: number): Promise<void> {
  if (process.platform === 'win32') {
    // Electron safeStorage uses DPAPI on Windows, so we rely on the default
    // per-user ACLs instead of POSIX chmod bits there.
    return;
  }
  await chmod(pathToWrite, mode);
}

async function readSecureStore(
  env: NodeJS.ProcessEnv,
  secureStorePath: string,
  safeStorage: SafeStorageLike | null
): Promise<Record<string, string>> {
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    logger.info('inference', 'auth.secure_store_unavailable', { path: secureStorePath });
    return {};
  }

  try {
    const raw = await readFile(secureStorePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SecureCredentialStoreFile>;
    if (parsed.version !== 1 || parsed.cipher !== 'electron.safeStorage' || typeof parsed.payload !== 'string') {
      throw new Error('Unsupported secure credential store format.');
    }

    const decrypted = safeStorage.decryptString(Buffer.from(parsed.payload, 'base64'));
    const credentials = filterSupportedCredentials(JSON.parse(decrypted) as Record<string, unknown>);
    let loaded = 0;
    for (const [key, value] of Object.entries(credentials)) {
      if (setIfMissing(env, key, value)) {
        loaded += 1;
      }
    }
    if (loaded > 0) {
      logger.info('inference', 'auth.secure_store_loaded', { path: secureStorePath, keys: loaded });
    }
    return credentials;
  } catch (error) {
    if (isEnoent(error)) {
      return {};
    }
    logger.warn('inference', 'auth.secure_store_read_failed', { path: secureStorePath, error });
    return {};
  }
}

async function writeSecureStore(
  secureStorePath: string,
  homeDirPath: string,
  credentials: Record<string, string>,
  safeStorage: SafeStorageLike | null
): Promise<boolean> {
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    return false;
  }

  const shadowDir = getShadowAgentDir(homeDirPath);
  const storeFile: SecureCredentialStoreFile = {
    version: 1,
    cipher: 'electron.safeStorage',
    payload: safeStorage.encryptString(JSON.stringify(credentials)).toString('base64'),
    updatedAt: new Date().toISOString(),
  };

  await mkdir(shadowDir, { recursive: true, mode: SECURE_STORE_DIR_MODE });
  await ensureSecurePath(shadowDir, SECURE_STORE_DIR_MODE);
  await writeFile(secureStorePath, `${JSON.stringify(storeFile, null, 2)}\n`, {
    encoding: 'utf8',
    mode: SECURE_STORE_FILE_MODE,
  });
  await ensureSecurePath(secureStorePath, SECURE_STORE_FILE_MODE);
  return true;
}

async function loadDotenvFile(
  env: NodeJS.ProcessEnv,
  envPath: string
): Promise<Record<string, string>> {
  try {
    const contents = await readFile(envPath, 'utf8');
    const pairs = filterSupportedCredentials(parseDotenv(contents));
    const loadedPairs: Record<string, string> = {};
    let loaded = 0;
    for (const [key, value] of Object.entries(pairs)) {
      if (setIfMissing(env, key, value)) {
        loadedPairs[key] = value;
        loaded++;
      }
    }
    if (loaded > 0) {
      logger.info('inference', 'auth.dotenv_loaded', { path: envPath, keys: loaded });
    }
    return loadedPairs;
  } catch (error) {
    if (!isEnoent(error)) {
      logger.warn('inference', 'auth.dotenv_read_failed', { path: envPath, error });
    }
    return {};
  }
}

async function loadOpencodeAuth(
  env: NodeJS.ProcessEnv,
  authPath: string
): Promise<Record<string, string>> {
  try {
    const raw = await readFile(authPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const loadedPairs: Record<string, string> = {};
    let loaded = 0;
    for (const [provider, envKey] of Object.entries(PROVIDER_ENV_MAP)) {
      const value = (parsed[provider] as Record<string, string> | undefined)?.key
        ?? (parsed[provider] as string | undefined);
      if (typeof value === 'string' && value && setIfMissing(env, envKey, value)) {
        loadedPairs[envKey] = value;
        loaded++;
      }
    }
    if (loaded > 0) {
      logger.info('inference', 'auth.opencode_loaded', { path: authPath, keys: loaded });
    }
    return loadedPairs;
  } catch (error) {
    if (!isEnoent(error)) {
      logger.warn('inference', 'auth.opencode_read_failed', { path: authPath, error });
    }
    return {};
  }
}

/**
 * Load credentials from all sources. Call once at app startup.
 * Reports which provider keys are now available (without logging values).
 */
export async function loadCredentials(options: CredentialLoaderOptions = {}): Promise<void> {
  const env = options.env ?? process.env;
  const homeDirPath = options.homeDir ?? homedir();
  const secureStorePath = getSecureStorePath(homeDirPath);
  const allowFileFallback = options.allowFileFallback ?? isTrueish(env[LEGACY_FILE_FALLBACK_ENV]);
  const safeStorage = await getSafeStorage(options);
  const secureStoreCredentials = await readSecureStore(env, secureStorePath, safeStorage);

  if (allowFileFallback) {
    const dotenvCredentials = await loadDotenvFile(env, getLegacyDotenvPath(homeDirPath));
    const opencodeCredentials = await loadOpencodeAuth(env, getOpencodeAuthPath(homeDirPath));
    const migratedCredentials = filterSupportedCredentials({
      ...dotenvCredentials,
      ...opencodeCredentials,
      ...secureStoreCredentials,
    });
    if (Object.keys(migratedCredentials).length > 0) {
      try {
        const wroteSecureStore = await writeSecureStore(secureStorePath, homeDirPath, migratedCredentials, safeStorage);
        if (wroteSecureStore && (Object.keys(dotenvCredentials).length > 0 || Object.keys(opencodeCredentials).length > 0)) {
          logger.info('inference', 'auth.legacy_credentials_migrated', {
            path: secureStorePath,
            keys: Object.keys(dotenvCredentials).length + Object.keys(opencodeCredentials).length,
          });
        }
      } catch (error) {
        logger.warn('inference', 'auth.secure_store_write_failed', { path: secureStorePath, error });
      }
    }
  } else {
    logger.info('inference', 'auth.file_fallback_skipped', {
      consentEnv: LEGACY_FILE_FALLBACK_ENV,
      secureStorePath,
    });
  }

  const available = Object.values(PROVIDER_ENV_MAP).filter((k) => !!env[k]);
  logger.info('inference', 'auth.credentials_ready', { providers: available });
}

/** Returns true if any inference provider key is set. */
export function hasAnyCredential(): boolean {
  return Object.values(PROVIDER_ENV_MAP).some((k) => !!process.env[k]);
}
