import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogDomain = 'app' | 'capture' | 'ipc' | 'renderer' | 'inference' | 'mcp' | 'persistence';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  domain: LogDomain;
  event: string;
  context?: Record<string, unknown>;
}

export interface LoggerOptions {
  minLevel?: LogLevel;
  includeConsole?: boolean;
  includeMemory?: boolean;
  memoryCapacity?: number;
  filePath?: string;
  /** Maximum file size in bytes before rotation. Default: 10 MiB. 0 = disabled. */
  rotationMaxBytes?: number;
  /** Maximum number of pending file writes before drops occur. Default: 200. */
  maxQueueDepth?: number;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const VALID_LOG_LEVELS = new Set<string>(['debug', 'info', 'warn', 'error']);
const SENSITIVE_KEY_PATTERN = /(?:^|[_-])(text|prompt|content)(?:$|[_-])/i;
const ensuredLogDirs = new Map<string, Promise<void>>();

/**
 * Resolve the minimum log level from the SHADOW_LOG_LEVEL environment variable.
 * Falls back to 'info' when the variable is absent or has an unrecognised value.
 */
function resolveEnvLogLevel(): LogLevel {
  const val = process.env['SHADOW_LOG_LEVEL']?.toLowerCase();
  if (val && VALID_LOG_LEVELS.has(val)) {
    return val as LogLevel;
  }
  return 'info';
}

function isErrorLike(value: unknown): value is { name?: unknown; message?: unknown; stack?: unknown } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return 'message' in (value as Record<string, unknown>) || 'stack' in (value as Record<string, unknown>);
}

function serializeCause(cause: unknown, redacted: boolean, depth: number): unknown {
  if (depth > 5) {
    return '[cause chain truncated]';
  }
  if (cause instanceof Error || isErrorLike(cause)) {
    return serializeError(
      cause as { name?: unknown; message?: unknown; stack?: unknown; cause?: unknown },
      redacted,
      depth
    );
  }
  return String(cause);
}

function serializeError(
  value: { name?: unknown; message?: unknown; stack?: unknown; cause?: unknown },
  redacted: boolean,
  depth = 0
): Record<string, unknown> {
  const name = typeof value.name === 'string' ? value.name : 'Error';
  const message =
    typeof value.message === 'string'
      ? value.message
      : value.message !== undefined
        ? String(value.message)
        : 'Unknown error';
  const stack = typeof value.stack === 'string' ? value.stack : undefined;

  if (redacted) {
    return {
      name,
      message: '[redacted]',
      stack: '[redacted]',
      redacted: true
    };
  }

  const hasCause = 'cause' in value && value.cause !== undefined;
  return {
    name,
    message,
    ...(stack ? { stack } : {}),
    ...(hasCause ? { cause: serializeCause(value.cause, redacted, depth + 1) } : {}),
    redacted: false
  };
}

function redactContext(context: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }

  const seen = new WeakSet<object>();

  const sanitize = (value: unknown, keyHint?: string): unknown => {
    const sensitiveKey = typeof keyHint === 'string' && SENSITIVE_KEY_PATTERN.test(keyHint);

    if (value instanceof Error) {
      return serializeError(value as { name?: unknown; message?: unknown; stack?: unknown; cause?: unknown }, sensitiveKey);
    }
    if (isErrorLike(value)) {
      return serializeError(value as { name?: unknown; message?: unknown; stack?: unknown; cause?: unknown }, sensitiveKey);
    }
    if (sensitiveKey) {
      return '[redacted]';
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    if (seen.has(value as object)) {
      return '[circular]';
    }
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.map((element) => sanitize(element));
    }

    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      output[childKey] = sanitize(childValue, childKey);
    }
    return output;
  };

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    redacted[key] = sanitize(value, key);
  }
  return redacted;
}

async function ensureLogDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  const existing = ensuredLogDirs.get(dir);
  if (existing) {
    await existing;
    return;
  }

  const pending = mkdir(dir, { recursive: true })
    .then(() => undefined)
    .catch((error) => {
      ensuredLogDirs.delete(dir);
      throw error;
    });
  ensuredLogDirs.set(dir, pending);
  await pending;
}

async function getFileSizeBytes(filePath: string): Promise<number> {
  try {
    const s = await stat(filePath);
    return s.size;
  } catch {
    return 0;
  }
}

async function writeJsonLine(filePath: string, entry: LogEntry): Promise<void> {
  await ensureLogDir(filePath);
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
}

const DEFAULT_ROTATION_MAX_BYTES = 10 * 1024 * 1024; // 10 MiB

export class StructuredLogger {
  private readonly minLevel: LogLevel;
  private readonly includeConsole: boolean;
  private readonly includeMemory: boolean;
  private readonly memoryCapacity: number;
  private readonly filePath?: string;
  private readonly rotationMaxBytes: number;
  private readonly maxQueueDepth: number;
  private readonly memory: Array<LogEntry | undefined>;
  private memoryStart = 0;
  private memorySize = 0;
  private writeFailureCount = 0;
  private droppedWriteCount = 0;
  private readonly writeQueue: LogEntry[] = [];
  private isProcessingQueue = false;

  public constructor(options: LoggerOptions = {}) {
    this.minLevel = options.minLevel ?? 'info';
    this.includeConsole = options.includeConsole ?? true;
    this.includeMemory = options.includeMemory ?? true;
    this.memoryCapacity = Math.max(0, options.memoryCapacity ?? 500);
    this.filePath = options.filePath;
    this.rotationMaxBytes = options.rotationMaxBytes ?? DEFAULT_ROTATION_MAX_BYTES;
    this.maxQueueDepth = Math.max(1, options.maxQueueDepth ?? 200);
    this.memory = this.memoryCapacity > 0 ? new Array(this.memoryCapacity) : [];
  }

  public debug(domain: LogDomain, event: string, context?: Record<string, unknown>): void {
    this.log('debug', domain, event, context);
  }

  public info(domain: LogDomain, event: string, context?: Record<string, unknown>): void {
    this.log('info', domain, event, context);
  }

  public warn(domain: LogDomain, event: string, context?: Record<string, unknown>): void {
    this.log('warn', domain, event, context);
  }

  public error(domain: LogDomain, event: string, context?: Record<string, unknown>): void {
    this.log('error', domain, event, context);
  }

  public getRecent(limit = 100): LogEntry[] {
    if (limit <= 0 || this.memorySize === 0 || this.memoryCapacity === 0) {
      return [];
    }

    const take = Math.min(limit, this.memorySize);
    const offset = this.memorySize - take;
    const output: LogEntry[] = [];

    for (let i = 0; i < take; i += 1) {
      const index = (this.memoryStart + offset + i) % this.memoryCapacity;
      const entry = this.memory[index];
      if (entry) {
        output.push(entry);
      }
    }

    return output;
  }

  public getWriteFailureCount(): number {
    return this.writeFailureCount;
  }

  public getDroppedWriteCount(): number {
    return this.droppedWriteCount;
  }

  private log(level: LogLevel, domain: LogDomain, event: string, context?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      domain,
      event,
      context: redactContext(context)
    };

    if (this.includeMemory && this.memoryCapacity > 0) {
      const writeIndex = (this.memoryStart + this.memorySize) % this.memoryCapacity;
      this.memory[writeIndex] = entry;

      if (this.memorySize < this.memoryCapacity) {
        this.memorySize += 1;
      } else {
        this.memoryStart = (this.memoryStart + 1) % this.memoryCapacity;
      }
    }

    if (this.includeConsole) {
      const line = `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.domain}:${entry.event}`;
      if (entry.context) {
        console.log(line, entry.context);
      } else {
        console.log(line);
      }
    }

    if (this.filePath) {
      this.enqueueWrite(entry);
    }
  }

  /**
   * Enqueue a log entry for file writing with bounded backpressure.
   * If the queue is full, the write is silently dropped and the drop counter incremented.
   */
  private enqueueWrite(entry: LogEntry): void {
    if (this.writeQueue.length >= this.maxQueueDepth) {
      this.droppedWriteCount += 1;
      return;
    }
    this.writeQueue.push(entry);
    if (!this.isProcessingQueue) {
      this.isProcessingQueue = true;
      void this.drainQueue();
    }
  }

  /** Serially drain the write queue, applying rotation before each write. */
  private async drainQueue(): Promise<void> {
    while (true) {
      while (this.writeQueue.length > 0) {
        const entry = this.writeQueue.shift()!;
        try {
          await this.maybeRotate();
          await writeJsonLine(this.filePath!, entry);
        } catch (error) {
          this.writeFailureCount += 1;
          if (this.includeConsole) {
            console.error('logger_write_failed', error);
          }
        }
      }

      this.isProcessingQueue = false;
      if (this.writeQueue.length === 0) {
        return;
      }

      this.isProcessingQueue = true;
    }
  }

  /**
   * Rotate the log file if it exceeds `rotationMaxBytes`.
   * The current file is renamed to `<filePath>.1` (overwriting any prior .1 file).
   */
  private async maybeRotate(): Promise<void> {
    if (!this.filePath || this.rotationMaxBytes <= 0) {
      return;
    }
    const size = await getFileSizeBytes(this.filePath);
    if (size >= this.rotationMaxBytes) {
      const rotatedPath = `${this.filePath}.1`;
      try {
        await rm(rotatedPath, { force: true });
        await rename(this.filePath, rotatedPath);
      } catch (error) {
        this.writeFailureCount += 1;
        if (this.includeConsole) {
          console.error('logger_rotate_failed', error);
        }
      }
    }
  }
}

/**
 * Create a `StructuredLogger`.
 *
 * `minLevel` defaults to the value of the `SHADOW_LOG_LEVEL` environment variable
 * (case-insensitive), or `'info'` if the variable is absent or unrecognised.
 */
export function createLogger(options: LoggerOptions = {}): StructuredLogger {
  return new StructuredLogger({
    ...options,
    minLevel: options.minLevel ?? resolveEnvLogLevel()
  });
}
