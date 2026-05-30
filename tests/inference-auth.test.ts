import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LEGACY_FILE_FALLBACK_ENV,
  SECURE_CREDENTIAL_STORE_FILE,
  loadCredentials,
} from '../src/inference/auth';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((rootDir) => rm(rootDir, { recursive: true, force: true }))
  );
});

function registerTempRoot(rootDir: string): string {
  tempRoots.push(rootDir);
  return rootDir;
}

async function createTempHomeDir(label: string): Promise<string> {
  return registerTempRoot(await mkdtemp(path.join(os.tmpdir(), `shadow-auth-${label}-`)));
}

function createFakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf8'),
    decryptString: (buffer: Buffer) => {
      const raw = buffer.toString('utf8');
      if (!raw.startsWith('enc:')) {
        throw new Error('Unexpected ciphertext.');
      }
      return raw.slice(4);
    },
  };
}

async function writeSecureStoreFile(
  homeDir: string,
  payload: Record<string, string>
): Promise<void> {
  const safeStorage = createFakeSafeStorage();
  const shadowDir = path.join(homeDir, '.shadow-agent');
  const secureStorePath = path.join(shadowDir, SECURE_CREDENTIAL_STORE_FILE);
  await mkdir(shadowDir, { recursive: true });
  await writeFile(
    secureStorePath,
    `${JSON.stringify({
      version: 1,
      cipher: 'electron.safeStorage',
      payload: safeStorage.encryptString(JSON.stringify(payload)).toString('base64'),
      updatedAt: '2026-04-20T00:00:00.000Z',
    }, null, 2)}\n`,
    'utf8'
  );
}

describe('loadCredentials', () => {
  it('loads supported credentials from the encrypted store without fallback consent', async () => {
    const homeDir = await createTempHomeDir('secure-load');
    await writeSecureStoreFile(homeDir, {
      ANTHROPIC_API_KEY: 'sk-secure-anthropic',
      OPENAI_API_KEY: 'sk-secure-openai',
      UNUSED_SECRET: 'ignore-me',
    });

    const env: NodeJS.ProcessEnv = {};
    await loadCredentials({
      env,
      homeDir,
      safeStorage: createFakeSafeStorage(),
    });

    expect(env.ANTHROPIC_API_KEY).toBe('sk-secure-anthropic');
    expect(env.OPENAI_API_KEY).toBe('sk-secure-openai');
    expect(env.UNUSED_SECRET).toBeUndefined();
  });

  it('does not override process env values with secure-store credentials', async () => {
    const homeDir = await createTempHomeDir('env-wins');
    await writeSecureStoreFile(homeDir, {
      ANTHROPIC_API_KEY: 'sk-secure-anthropic',
    });

    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_API_KEY: 'sk-from-env',
    };
    await loadCredentials({
      env,
      homeDir,
      safeStorage: createFakeSafeStorage(),
    });

    expect(env.ANTHROPIC_API_KEY).toBe('sk-from-env');
  });

  it('skips legacy file-based fallbacks until consent is explicit', async () => {
    const homeDir = await createTempHomeDir('no-consent');
    const shadowDir = path.join(homeDir, '.shadow-agent');
    const opencodeDir = path.join(homeDir, '.local', 'share', 'opencode');
    await mkdir(shadowDir, { recursive: true });
    await mkdir(opencodeDir, { recursive: true });
    await writeFile(path.join(shadowDir, '.env'), 'ANTHROPIC_API_KEY=sk-legacy-anthropic\n', 'utf8');
    await writeFile(path.join(opencodeDir, 'auth.json'), JSON.stringify({ openai: { key: 'sk-legacy-openai' } }), 'utf8');

    const env: NodeJS.ProcessEnv = {};
    await loadCredentials({
      env,
      homeDir,
      safeStorage: null,
    });

    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it('migrates consented legacy file credentials into the encrypted store', async () => {
    const homeDir = await createTempHomeDir('migrate');
    const shadowDir = path.join(homeDir, '.shadow-agent');
    const opencodeDir = path.join(homeDir, '.local', 'share', 'opencode');
    const secureStorePath = path.join(shadowDir, SECURE_CREDENTIAL_STORE_FILE);
    await mkdir(shadowDir, { recursive: true });
    await mkdir(opencodeDir, { recursive: true });
    await writeFile(path.join(shadowDir, '.env'), 'ANTHROPIC_API_KEY=sk-legacy-anthropic\n', 'utf8');
    await writeFile(path.join(opencodeDir, 'auth.json'), JSON.stringify({ openai: { key: 'sk-legacy-openai' } }), 'utf8');

    const env: NodeJS.ProcessEnv = {
      [LEGACY_FILE_FALLBACK_ENV]: '1',
    };
    await loadCredentials({
      env,
      homeDir,
      safeStorage: createFakeSafeStorage(),
    });

    expect(env.ANTHROPIC_API_KEY).toBe('sk-legacy-anthropic');
    expect(env.OPENAI_API_KEY).toBe('sk-legacy-openai');

    const rawStore = await readFile(secureStorePath, 'utf8');
    expect(rawStore).toContain('electron.safeStorage');
    expect(rawStore).not.toContain('sk-legacy-anthropic');
    expect(rawStore).not.toContain('sk-legacy-openai');

    const envFromSecureStoreOnly: NodeJS.ProcessEnv = {};
    await loadCredentials({
      env: envFromSecureStoreOnly,
      homeDir,
      safeStorage: createFakeSafeStorage(),
    });

    expect(envFromSecureStoreOnly.ANTHROPIC_API_KEY).toBe('sk-legacy-anthropic');
    expect(envFromSecureStoreOnly.OPENAI_API_KEY).toBe('sk-legacy-openai');

    if (process.platform !== 'win32') {
      const dirStats = await stat(shadowDir);
      const fileStats = await stat(secureStorePath);
      expect(dirStats.mode & 0o777).toBe(0o700);
      expect(fileStats.mode & 0o777).toBe(0o600);
    }
  });

  it('preserves secure-store credentials when legacy fallback contains overlapping keys', async () => {
    const homeDir = await createTempHomeDir('preserve-secure-store');
    const shadowDir = path.join(homeDir, '.shadow-agent');
    await mkdir(shadowDir, { recursive: true });
    await writeSecureStoreFile(homeDir, {
      ANTHROPIC_API_KEY: 'sk-secure-anthropic',
      OPENAI_API_KEY: 'sk-secure-openai',
    });
    await writeFile(
      path.join(shadowDir, '.env'),
      'ANTHROPIC_API_KEY=sk-legacy-anthropic\nGOOGLE_API_KEY=sk-legacy-google\n',
      'utf8'
    );

    const env: NodeJS.ProcessEnv = {
      [LEGACY_FILE_FALLBACK_ENV]: '1',
    };
    await loadCredentials({
      env,
      homeDir,
      safeStorage: createFakeSafeStorage(),
    });

    expect(env.ANTHROPIC_API_KEY).toBe('sk-secure-anthropic');
    expect(env.OPENAI_API_KEY).toBe('sk-secure-openai');
    expect(env.GOOGLE_API_KEY).toBe('sk-legacy-google');

    const envFromSecureStoreOnly: NodeJS.ProcessEnv = {};
    await loadCredentials({
      env: envFromSecureStoreOnly,
      homeDir,
      safeStorage: createFakeSafeStorage(),
    });

    expect(envFromSecureStoreOnly.ANTHROPIC_API_KEY).toBe('sk-secure-anthropic');
    expect(envFromSecureStoreOnly.OPENAI_API_KEY).toBe('sk-secure-openai');
    expect(envFromSecureStoreOnly.GOOGLE_API_KEY).toBe('sk-legacy-google');
  });
});
