import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getTranscriptPrivacySettingsPath,
  loadTranscriptPrivacySettings,
  resolveTranscriptPrivacySettings,
  saveTranscriptPrivacySettings,
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
  it('redacts real secrets and tokens from transcript text but leaves emails and paths unchanged', () => {
    const sanitized = sanitizeTranscriptText(
      'Contact dev@example.com with Bearer abcdefghijklmnop and inspect D:\\_projects\\AgentVisualCrazy\\secret.txt or /Users/dev/.ssh/id_rsa and sk-abcdefghijklmnop'
    );

    // Secrets/tokens are scrubbed
    expect(sanitized).toContain('Bearer [redacted-token]');
    expect(sanitized).toContain('[redacted-token]'); // provider token sk-...
    // Emails and file paths now pass through unchanged
    expect(sanitized).toContain('dev@example.com');
    expect(sanitized).toContain('D:\\_projects\\AgentVisualCrazy\\secret.txt');
    expect(sanitized).toContain('/Users/dev/.ssh/id_rsa');
    expect(sanitized).not.toContain('[redacted-email]');
    expect(sanitized).not.toContain('[redacted-path]');
  });

  it('defaults privacy settings to both-on (full power) for this single-user tool', () => {
    expect(resolveTranscriptPrivacySettings()).toEqual({
      allowRawTranscriptStorage: true,
      allowOffHostInference: true
    });
  });

  it('SHADOW_LOCAL_ONLY=1 forces both settings to false as a kill switch', () => {
    expect(resolveTranscriptPrivacySettings({}, { SHADOW_LOCAL_ONLY: '1' })).toEqual({
      allowRawTranscriptStorage: false,
      allowOffHostInference: false
    });

    // Other truthy values also trigger the kill switch
    expect(resolveTranscriptPrivacySettings({}, { SHADOW_LOCAL_ONLY: 'true' })).toEqual({
      allowRawTranscriptStorage: false,
      allowOffHostInference: false
    });
  });

  it('granular env keys override the default even when SHADOW_LOCAL_ONLY is not set', () => {
    const settings = resolveTranscriptPrivacySettings({}, {
      SHADOW_ALLOW_RAW_TRANSCRIPT_STORAGE: '0',
      SHADOW_ALLOW_OFF_HOST_INFERENCE: 'false'
    });
    expect(settings).toEqual({
      allowRawTranscriptStorage: false,
      allowOffHostInference: false
    });
  });

  it('explicit overrides win over SHADOW_LOCAL_ONLY kill switch', () => {
    const settings = resolveTranscriptPrivacySettings(
      { allowOffHostInference: true },
      { SHADOW_LOCAL_ONLY: '1' }
    );
    // overrides param beats the kill switch
    expect(settings.allowOffHostInference).toBe(true);
    // but the un-overridden key is still forced off by the kill switch
    expect(settings.allowRawTranscriptStorage).toBe(false);
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

    // With no env file and no process env overrides, defaults are both true
    await expect(loadTranscriptPrivacySettings({}, envPath, {})).resolves.toEqual({
      allowRawTranscriptStorage: true,
      allowOffHostInference: true
    });
  });

  it('loads persisted privacy settings when no env opt-in is present', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'shadow-privacy-store-'));
    tempDirs.push(tempDir);
    const settingsPath = getTranscriptPrivacySettingsPath(tempDir);
    await saveTranscriptPrivacySettings({
      allowRawTranscriptStorage: true,
      allowOffHostInference: false
    }, settingsPath);

    await expect(loadTranscriptPrivacySettings({}, path.join(tempDir, '.env'), {}, settingsPath)).resolves.toEqual({
      allowRawTranscriptStorage: true,
      allowOffHostInference: false
    });
  });
});
