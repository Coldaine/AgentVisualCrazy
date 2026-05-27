import { deriveState } from './derive';
import {
  DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS,
  prepareEventsForStorage,
  resolvePrivacyPolicy,
  sanitizeTranscriptText
} from './privacy';
import { buildSessionRecord } from './replay-store';
import type {
  CanonicalEvent,
  LoadedSource,
  RendererInput,
  TranscriptPrivacySettings
} from './schema';

export interface RendererInputBuildOptions {
  source: LoadedSource;
  fallbackTitle?: string;
  privacySettings?: TranscriptPrivacySettings;
}

/**
 * Concrete renderer-input adapters must ship with focused unit tests that
 * exercise title resolution, privacy defaults, and derived-state assembly.
 */
export interface RendererInputAdapter<TInput = CanonicalEvent[]> {
  readonly id: string;
  build(input: TInput, options: RendererInputBuildOptions): RendererInput;
}

export function inferRendererInputTitle(
  events: CanonicalEvent[],
  fallback = 'Observed session'
): string {
  const labeledSession = events.find(
    (event) => event.kind === 'session_started' && typeof event.payload.label === 'string' && event.payload.label.length > 0
  );
  if (labeledSession) {
    return String(labeledSession.payload.label);
  }

  const sessionTitle = events.find(
    (event) => event.kind === 'context_snapshot' && typeof event.payload.title === 'string' && event.payload.title.length > 0
  );
  if (sessionTitle) {
    return String(sessionTitle.payload.title);
  }

  const firstUserMessage = events.find(
    (event) => event.kind === 'message' && event.actor === 'user' && typeof event.payload.text === 'string'
  );
  if (firstUserMessage) {
    return String(firstUserMessage.payload.text).slice(0, 80);
  }

  return fallback;
}

export const canonicalEventRendererInputAdapter: RendererInputAdapter<CanonicalEvent[]> = {
  id: 'canonical-event-renderer-input',
  build(events, options) {
    const privacySettings = options.privacySettings ?? DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS;
    const sanitizedEvents = prepareEventsForStorage(events, privacySettings);
    const source = {
      ...options.source,
      label: sanitizeTranscriptText(options.source.label),
      path: options.source.path ? sanitizeTranscriptText(options.source.path) : undefined
    };
    const fallbackTitle = sanitizeTranscriptText(options.fallbackTitle ?? source.label);
    const title = inferRendererInputTitle(sanitizedEvents, fallbackTitle);
    const record = buildSessionRecord(sanitizedEvents, title);

    return {
      source,
      record,
      state: deriveState(sanitizedEvents, record.title),
      events: sanitizedEvents,
      privacy: resolvePrivacyPolicy(privacySettings)
    };
  }
};

export function buildRendererInput(
  events: CanonicalEvent[],
  options: RendererInputBuildOptions
): RendererInput {
  return canonicalEventRendererInputAdapter.build(events, options);
}
