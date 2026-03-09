/**
 * MCP Repomix E2E Test
 *
 * Proves that MCP servers discovered from the Claude Code plugin chain
 * are actually available and callable inside a headless sidecar session.
 *
 * Requires: OPENROUTER_API_KEY env var
 * Runtime: ~2-3 minutes (real LLM + real MCP tool call)
 * Run: npm run test:e2e:mcp
 */

const { startSidecar } = require('../src/sidecar/start');
const path = require('path');
const os = require('os');

const SKIP = !process.env.OPENROUTER_API_KEY;
const describeOrSkip = SKIP ? describe.skip : describe;

describeOrSkip('MCP Repomix E2E', () => {
  // 3 minutes — real LLM + real MCP call
  jest.setTimeout(3 * 60 * 1000);

  test('headless sidecar discovers and calls repomix MCP tool', async () => {
    const result = await startSidecar({
      model: process.env.SIDECAR_E2E_MODEL || 'openrouter/google/gemini-2.5-flash',
      prompt: [
        'You have access to the repomix MCP tool.',
        `Use it to pack the directory: ${path.join(os.homedir(), 'claude-code-projects/sidecar/src')}`,
        'Report: (1) the total number of files packed, (2) the first filename listed in the output.',
        'If you cannot access the repomix tool, say exactly: "repomix tool not available"'
      ].join(' '),
      noUi: true,
      headless: true,
      timeout: 2,
      agent: 'build',
      clientType: 'code',
      project: path.join(os.homedir(), 'claude-code-projects/sidecar'),
      includeContext: false,
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('complete');
    expect(result.summary).toBeTruthy();

    const summary = result.summary.toLowerCase();
    expect(summary).not.toContain('repomix tool not available');

    // Evidence of actual repomix output: file count number or known repomix text
    const hasRepomixEvidence = (
      /\d+\s+files?/i.test(result.summary) ||
      /packed/i.test(result.summary) ||
      /repomix/i.test(result.summary) ||
      /\.js/i.test(result.summary)
    );
    expect(hasRepomixEvidence).toBe(true);
  });
});
