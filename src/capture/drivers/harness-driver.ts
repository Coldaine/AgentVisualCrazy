/**
 * Core abstractions for the harness driver layer.
 *
 * A HarnessDriver bundles everything needed to observe one AI coding agent:
 * which EventSource strings it owns, how it normalizes raw entries into
 * CanonicalEvents, and its capability flags that derive.ts consults to decide
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

/**
 * One discovered session candidate from a harness driver's session discovery.
 *
 * `source` is the EventSource the discovered session will be ingested as. A
 * driver may own multiple sources (Claude: 'claude-transcript' for tail,
 * 'claude-hook' for hook receiver); its DiscoveryStrategy stamps the source
 * matching the surface it discovered the session on. session-manager later
 * uses this source to look up the right driver via the registry.
 *
 * Without `source`, a non-Claude JSONL discovery (e.g. a hypothetical Codex
 * driver scanning ~/.codex/sessions/) would lose attribution when its session
 * won the "most recent" race and be silently normalized by the Claude driver.
 */
export interface DriverDiscoveredSession {
  filePath: string;
  sessionId: string;
  lastModified: number;
  source: EventSource;
}

/**
 * Pluggable session-discovery strategy. A driver implements this to locate
 * its harness's active session(s) (e.g. Claude's `~/.claude/projects/`,
 * Cursor's `.cursor/hooks.json`, etc.).
 *
 * Discovery is read-only and side-effect-free beyond filesystem stats.
 * The generic dispatcher in session-discovery.ts collects sessions from every
 * registered driver and picks the most recently modified.
 */
export interface DiscoveryStrategy {
  discoverSessions(): Promise<DriverDiscoveredSession[]>;
}

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
  /**
   * Translate one raw ParsedEntry into zero or more CanonicalEvents.
   *
   * `source` is supplied by session-manager from the active CaptureSession so
   * the same driver can serve multiple transports (e.g. Claude transcript-tail
   * AND Claude HTTP hook receiver). Drivers should stamp each emitted event
   * with this source rather than hardcoding one. Defaulted by the driver for
   * tests that call normalizeEntry directly without a session.
   */
  normalizeEntry(entry: ParsedEntry, sessionId: string, source?: EventSource): CanonicalEvent[];
  /**
   * Optional. When present, the generic session-discovery dispatcher
   * consults this strategy to find active sessions for this harness.
   */
  readonly discovery?: DiscoveryStrategy;
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
