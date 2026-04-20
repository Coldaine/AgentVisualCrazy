import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadTranscriptPrivacySettings,
  resolveTranscriptPrivacySettings,
  sanitizeTranscriptText
} from '../src/shared/privacy';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempEnvFile(contents: string): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'shadow-privacy-'));
  tempDirs.push(tempDir);
  const envPath = path.join(tempDir, '.env');
  await writeFile(envPath, contents, 'utf8');
  return envPath;
}

describe('privacy sanitization', () => {
  it('redacts emails, tokens, and local paths from transcript text', () => {
    const sanitized = sanitizeTranscriptText(
      'Contact dev@example.com with Bearer abcdefghijklmnop and inspect D:\\_projects\\AgentVisualCrazy\\secret.txt or /Users/dev/.ssh/id_rsa'
    );

    expect(sanitized).toBe(
      'Contact [redacted-email] with Bearer [redacted-token] and inspect [redacted-path] or [redacted-path]'
    );
  });

  it('defaults privacy settings to local-only processing until explicitly opted in', () => {
    expect(resolveTranscriptPrivacySettings()).toEqual({
      allowRawTranscriptStorage: false,
      allowOffHostInference: false
    });
  });

  it('accepts explicit opt-in from environment-style settings', () => {
    const settings = resolveTranscriptPrivacySettings({}, {
      SHADOW_ALLOW_RAW_TRANSCRIPT_STORAGE: 'true',
      SHADOW_ALLOW_OFF_HOST_INFERENCE: '1'
    });

    expect(settings).toEqual({
      allowRawTranscriptStorage: true,
      allowOffHostInference: true
    });
  });

  it('loads privacy settings from a dotenv file and lets process env override them', async () => {
    const envPath = await createTempEnvFile([
      'SHADOW_ALLOW_RAW_TRANSCRIPT_STORAGE=true',
      'SHADOW_ALLOW_OFF_HOST_INFERENCE=yes'
    ].join('\n'));

    const settings = await loadTranscriptPrivacySettings({}, envPath, {
      SHADOW_ALLOW_OFF_HOST_INFERENCE: 'off'
    });

    expect(settings).toEqual({
      allowRawTranscriptStorage: true,
      allowOffHostInference: false
    });
  });

  it('falls back to defaults when the dotenv file is missing or invalid', async () => {
    const envPath = await createTempEnvFile('SHADOW_ALLOW_OFF_HOST_INFERENCE=maybe\n');
    await rm(envPath, { force: true });

    await expect(loadTranscriptPrivacySettings({}, envPath, {})).resolves.toEqual({
      allowRawTranscriptStorage: false,
      allowOffHostInference: false
    });
  });
});
