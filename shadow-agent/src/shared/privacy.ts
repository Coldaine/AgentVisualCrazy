import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseDotenv } from './dotenv';
import type { CanonicalEvent, PrivacyPolicy, TranscriptPrivacySettings } from './schema';

export interface OffHostDeliveryOptions {
  includeRawTranscript?: boolean;
}

export const DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS: TranscriptPrivacySettings = {
  allowRawTranscriptStorage: false,
  allowOffHostInference: false
};

export const TRANSCRIPT_PRIVACY_ENV_KEYS = {
  allowRawTranscriptStorage: 'SHADOW_ALLOW_RAW_TRANSCRIPT_STORAGE',
  allowOffHostInference: 'SHADOW_ALLOW_OFF_HOST_INFERENCE'
} as const;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Z0-9._-]{12,}\b/gi;
const KEY_VALUE_SECRET_PATTERN =
  /\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret|password)\b\s*[:=]\s*["']?([^\s"',}]{4,})/gi;
const PROVIDER_TOKEN_PATTERN =
  /\b(?:sk-[A-Z0-9]{12,}|gh[pousr]_[A-Z0-9_]{12,}|AIza[A-Z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b/gi;
const WINDOWS_PATH_PATTERN = /\b[A-Z]:\\(?:[^\s\\\r\n:*?"<>|]+\\)*[^\s\\\r\n:*?"<>|]*/gi;
const HOME_PATH_PATTERN = /(^|[\s(])~\/[^\s)]+/g;
const ABSOLUTE_PATH_PATTERN = /(^|[\s(])\/(?:Users|home|workspace|tmp|var|private|opt)\/[^\s)]+/g;

function parseBooleanSetting(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return undefined;
}

export function resolveTranscriptPrivacySettings(
  overrides: Partial<TranscriptPrivacySettings> = {},
  env: NodeJS.ProcessEnv = process.env
): TranscriptPrivacySettings {
  const allowRawTranscriptStorage =
    overrides.allowRawTranscriptStorage ??
    parseBooleanSetting(env[TRANSCRIPT_PRIVACY_ENV_KEYS.allowRawTranscriptStorage]) ??
    DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS.allowRawTranscriptStorage;

  const allowOffHostInference =
    overrides.allowOffHostInference ??
    parseBooleanSetting(env[TRANSCRIPT_PRIVACY_ENV_KEYS.allowOffHostInference]) ??
    DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS.allowOffHostInference;

  return {
    allowRawTranscriptStorage,
    allowOffHostInference
  };
}

export async function loadTranscriptPrivacySettings(
  overrides: Partial<TranscriptPrivacySettings> = {},
  envPath = join(homedir(), '.shadow-agent', '.env'),
  env: NodeJS.ProcessEnv = process.env
): Promise<TranscriptPrivacySettings> {
  try {
    const contents = await readFile(envPath, 'utf8');
    const fileEnv = parseDotenv(contents);
    return resolveTranscriptPrivacySettings(overrides, {
      ...fileEnv,
      ...env
    });
  } catch {
    return resolveTranscriptPrivacySettings(overrides, env);
  }
}

export function resolvePrivacyPolicy(
  settings: TranscriptPrivacySettings = DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS
): PrivacyPolicy {
  return {
    ...settings,
    processingMode: settings.allowOffHostInference ? 'off-host-opted-in' : 'local-only',
    transcriptHandling: 'sanitized-by-default'
  };
}

export function sanitizeTranscriptText(input: string): string {
  return input
    .replace(KEY_VALUE_SECRET_PATTERN, (_match, key) => `${String(key)}=[redacted-secret]`)
    .replace(BEARER_PATTERN, 'Bearer [redacted-token]')
    .replace(PROVIDER_TOKEN_PATTERN, '[redacted-token]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(WINDOWS_PATH_PATTERN, '[redacted-path]')
    .replace(HOME_PATH_PATTERN, '$1[redacted-path]')
    .replace(ABSOLUTE_PATH_PATTERN, '$1[redacted-path]');
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeTranscriptText(value);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item));
  }

  const output: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    output[childKey] = typeof childValue === 'string' ? sanitizeTranscriptText(childValue) : sanitizeUnknown(childValue);
  }
  return output;
}

export function sanitizeCanonicalEvent<TPayload = Record<string, unknown>>(event: CanonicalEvent<TPayload>): CanonicalEvent<TPayload> {
  return {
    ...event,
    payload: sanitizeUnknown(event.payload) as TPayload
  };
}

export function sanitizeCanonicalEvents(events: CanonicalEvent[]): CanonicalEvent[] {
  return events.map((event) => sanitizeCanonicalEvent(event));
}

export function prepareEventsForStorage(
  events: CanonicalEvent[],
  settings: TranscriptPrivacySettings = DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS,
  options: { storeRawTranscript?: boolean } = {}
): CanonicalEvent[] {
  if (options.storeRawTranscript) {
    if (!settings.allowRawTranscriptStorage) {
      throw new Error('Raw transcript storage requires explicit opt-in.');
    }
    return events;
  }

  return sanitizeCanonicalEvents(events);
}

export function assertOffHostInferenceAllowed(
  settings: TranscriptPrivacySettings = DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS,
  options: OffHostDeliveryOptions = {}
): void {
  if (!settings.allowOffHostInference) {
    throw new Error('Off-host inference is disabled until the user explicitly opts in.');
  }

  if (options.includeRawTranscript && !settings.allowRawTranscriptStorage) {
    throw new Error('Sending raw transcripts off-host requires raw transcript opt-in.');
  }
}
