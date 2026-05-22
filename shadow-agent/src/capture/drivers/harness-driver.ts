import type { CanonicalEvent, EventSource } from '../../shared/schema';
import type { CaptureTransportKind } from '../capture-transport';
import type { ParsedEntry } from '../incremental-parser';
import type { DiscoveredSession } from '../session-discovery';

export interface HarnessCapabilities {
  supportsSubagents: boolean;
  supportsThinking: boolean;
  supportsPermissions: boolean;
  transportKinds: CaptureTransportKind[];
}

export interface HarnessDiscovery {
  discoverActiveSession(overridePath?: string): Promise<DiscoveredSession | null>;
}

export interface HarnessAdapter {
  parseEntry(entry: ParsedEntry, sessionId: string, harnessId: string): CanonicalEvent[];
}

export interface HarnessNormalizer {
  extractTimestamp(entry: ParsedEntry): string;
  detectSessionStart(entry: ParsedEntry): boolean;
}

export interface HarnessDriver {
  readonly id: string;
  readonly displayName: string;
  readonly eventSource: EventSource;
  readonly capabilities: HarnessCapabilities;
  discovery: HarnessDiscovery;
  adapter: HarnessAdapter;
  normalizer: HarnessNormalizer;
}
