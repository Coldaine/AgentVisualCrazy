/**
 * CLI entry for the deterministic replay runner (see src/replay/replay-runner.ts
 * and plan-codex-replay.md D3). Wired as `npm run replay`.
 *
 * Usage:
 *   npm run replay -- <file> [flags]
 *   doppler run -p ai-models -c dev -- npm run replay -- <file> --infer live
 *
 * Flags:
 *   --driver codex|claude-code   Force a driver for raw transcripts (sniffed otherwise).
 *   --speed N                    60 (default) | 1 (real time) | 0 (as-fast-as-possible).
 *   --infer none|live            none (heuristics only, default) | live (real provider chain).
 *   --export-replay <path>       Write normalized CanonicalEvents (Electron-loadable) here.
 *   --report <path>              Write the JSON report here.
 *   --title <text>               Session title for derive/report.
 */
import { runReplay, type InferMode, type ReplayOptions } from '../src/replay/replay-runner';

interface ParsedArgs {
  file?: string;
  options: ReplayOptions;
}

function parseArgs(argv: string[]): ParsedArgs {
  const options: ReplayOptions = {};
  let file: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };
    switch (arg) {
      case '--driver': {
        const value = next();
        if (value !== 'codex' && value !== 'claude-code') {
          throw new Error(`--driver must be codex|claude-code, got "${value}"`);
        }
        options.driver = value;
        break;
      }
      case '--speed':
        options.speed = Number(next());
        break;
      case '--infer': {
        const value = next();
        if (value !== 'none' && value !== 'live') {
          throw new Error(`--infer must be none|live, got "${value}"`);
        }
        options.infer = value as InferMode;
        break;
      }
      case '--export-replay':
        options.exportReplayPath = next();
        break;
      case '--report':
        options.reportPath = next();
        break;
      case '--title':
        options.title = next();
        break;
      case '--help':
      case '-h':
        file = '--help';
        break;
      default:
        if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
        file = arg;
    }
  }

  options.filePath = file;
  return { file, options };
}

const HELP = `Deterministic replay runner

Usage: npm run replay -- <file> [flags]

  --driver codex|claude-code   Force driver for raw transcripts (sniffed otherwise)
  --speed N                    60 (default) | 1 (real time) | 0 (as-fast-as-possible)
  --infer none|live            none (heuristics only, default) | live (real provider chain)
  --export-replay <path>       Write normalized CanonicalEvents (Electron-loadable)
  --report <path>              Write JSON report
  --title <text>               Session title
`;

async function main(): Promise<void> {
  const { file, options } = parseArgs(process.argv.slice(2));

  if (!file || file === '--help') {
    process.stdout.write(HELP);
    process.exit(file === '--help' ? 0 : 1);
  }

  const report = await runReplay(options);

  const { meta, aggregates, determinismHash, checkpoints } = report;
  const lines: string[] = [];
  lines.push(`replay: ${meta.input}`);
  lines.push(`  driver=${meta.driver} session=${meta.sessionId} speed=${meta.speed} infer=${meta.infer}`);
  lines.push(
    `  events=${meta.events} virtual=${meta.durationVirtualMinutes.toFixed(1)}min ` +
      `(${meta.startVirtualUtc ?? '?'} → ${meta.endVirtualUtc ?? '?'})`,
  );
  lines.push(`  ${determinismHash}`);
  lines.push(
    `  triggersFired=${aggregates.triggersFired} inferCalls=${aggregates.inferCalls} ` +
      `latency p50/p95/max=${aggregates.latencyMs.p50}/${aggregates.latencyMs.p95}/${aggregates.latencyMs.max}ms ` +
      `bufferDepthMax=${aggregates.bufferDepthMax}`,
  );
  lines.push('  checkpoints:');
  for (const cp of checkpoints) {
    if (cp.surfaced) {
      const lead = cp.leadMinutes ?? 0;
      const dir = lead >= 0 ? 'lead' : 'lag';
      lines.push(`    [surfaced] ${cp.label} — ${Math.abs(lead).toFixed(1)}min ${dir}`);
    } else {
      lines.push(`    [ missed ] ${cp.label}`);
    }
  }
  if (options.reportPath) lines.push(`  report → ${options.reportPath}`);
  if (options.exportReplayPath) lines.push(`  replay → ${options.exportReplayPath}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

main().catch((err) => {
  process.stderr.write(`replay failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
