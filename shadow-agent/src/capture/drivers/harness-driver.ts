/**
 * Core abstractions for the harness driver layer.
 *
 * A HarnessDriver bundles everything needed to observe one AI coding agent:
 * which EventSource strings it owns, how it normalizes raw entries into
 * CanonicalEvents, and its capability flags that drive.ts consults to decide
 * how to extract file attention, risk signals, and subagent topology.
 *
 * The registry is the single lookup table. Session-manager resolves a driver
 * by the source string stamped on a CaptureSession and falls back to the
 * default (claude-code) when no match is found.
 */
import type { CanonicalEvent, EventSource } from '../../shared/schema';
import type { ParsedEntry } from '../incremental-parser';

/**
 * A simple string signal a driver can emit to flag elevated risk.
 * Kept minimal for MVP; can grow into a struct with severity + evidence.
 */
export type RiskHeuristic = string;

export interface HarnessCapabilities {
  /** Whether this agent emits agent_spawned / agent_completed events. */
  emitsSubagentEvents: boolean;
  /**
   * How file paths surface in the event stream.
   * 'tool-args'          — paths appear in tool_started payload.args (Claude Code, Codex)
   * 'explicit-event'     — a dedicated event type carries file metadata (reserved)
   * 'inferred-from-text' — derive.ts must regex-scan message text (Aider)
   */
  fileAttention: 'tool-args' | 'explicit-event' | 'inferred-from-text';
  /** Optional per-driver tool name normalizer (e.g. 'str_replace_editor' → 'Edit'). */
  toolNameMap?: (toolName: string) => string;
  /** Additive risk signals — derive.ts unions them with other heuristics. */
  riskHeuristics: RiskHeuristic[];
}

export interface HarnessDriver {
  /** Stable identifier — used as the `harnessId` on every CanonicalEvent. */
  readonly id: string;
  /**
   * EventSource strings this driver owns. Session-manager looks the driver up
   * by matching session.source against this list.
   */
  readonly sources: readonly EventSource[];
  readonly capabilities: HarnessCapabilities;
  /** Translate one raw ParsedEntry into zero or more CanonicalEvents. */
  normalizeEntry(entry: ParsedEntry, sessionId: string): CanonicalEvent[];
}

export class HarnessDriverRegistry {
  private readonly byId = new Map<string, HarnessDriver>();
  private readonly bySource = new Map<EventSource, HarnessDriver>();
  private defaultDriverId: string | null = null;

  register(driver: HarnessDriver): this {
    this.byId.set(driver.id, driver);
    for (const source of driver.sources) {
      this.bySource.set(source, driver);
    }
    if (this.defaultDriverId === null) {
      this.defaultDriverId = driver.id;
    }
    return this;
  }

  get(driverId: string): HarnessDriver | undefined {
    return this.byId.get(driverId);
  }

  getForSource(source: EventSource): HarnessDriver | undefined {
    return this.bySource.get(source);
  }

  /** Returns the first registered driver. Falls back gracefully when no driver matches. */
  getDefault(): HarnessDriver {
    const driver = this.defaultDriverId ? this.byId.get(this.defaultDriverId) : undefined;
    if (!driver) {
      throw new Error('HarnessDriverRegistry has no registered drivers');
    }
    return driver;
  }

  get registeredIds(): string[] {
    return [...this.byId.keys()];
  }
}
