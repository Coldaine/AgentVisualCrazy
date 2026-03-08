const { buildClaudeCommand, createSandbox, buildMcpConfig } = require('../claude_runner');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('buildMcpConfig', () => {
  test('generates valid MCP config pointing to sidecar binary', () => {
    const config = buildMcpConfig();
    expect(config.mcpServers).toHaveProperty('sidecar');
    expect(config.mcpServers.sidecar.command).toBe('node');
    expect(config.mcpServers.sidecar.args[0]).toContain('sidecar.js');
    expect(config.mcpServers.sidecar.args[1]).toBe('mcp');
  });
});

describe('createSandbox', () => {
  test('copies fixture to temp directory', () => {
    const fixturesDir = path.join(__dirname, '..', 'fixtures');
    if (!fs.existsSync(path.join(fixturesDir, 'buggy-auth-app'))) {
      return;
    }
    const sandbox = createSandbox('buggy-auth-app');
    expect(fs.existsSync(sandbox)).toBe(true);
    expect(fs.existsSync(path.join(sandbox, 'src', 'auth.js'))).toBe(true);
    fs.rmSync(sandbox, { recursive: true });
  });

  test('throws if fixture does not exist', () => {
    expect(() => createSandbox('nonexistent-fixture')).toThrow('Fixture not found');
  });
});

describe('buildClaudeCommand', () => {
  test('builds command with required flags', () => {
    const cmd = buildClaudeCommand({
      prompt: 'test prompt',
      model: 'sonnet',
      maxBudget: 2.0,
      mcpConfigPath: '/tmp/mcp.json',
      sandboxDir: '/tmp/sandbox',
    });
    expect(cmd.command).toBe('claude');
    expect(cmd.args).toContain('-p');
    expect(cmd.args).toContain('test prompt');
    expect(cmd.args).toContain('--output-format');
    expect(cmd.args).toContain('stream-json');
    expect(cmd.args).toContain('--model');
    expect(cmd.args).toContain('sonnet');
    expect(cmd.args).toContain('--max-budget-usd');
    expect(cmd.args).toContain('2');
    expect(cmd.args).toContain('--mcp-config');
    expect(cmd.args).toContain('/tmp/mcp.json');
    expect(cmd.env.CLAUDECODE).toBe('');
  });

  test('MCP mode includes --mcp-config flag', () => {
    const cmd = buildClaudeCommand({
      prompt: 'test', model: 'sonnet', maxBudget: 2.0,
      mcpConfigPath: '/tmp/mcp.json', sandboxDir: '/tmp/sandbox',
    });
    expect(cmd.args).toContain('--mcp-config');
    expect(cmd.args).toContain('/tmp/mcp.json');
  });

  test('CLI mode omits --mcp-config and adds sidecar to PATH', () => {
    const cmd = buildClaudeCommand({
      prompt: 'test', model: 'sonnet', maxBudget: 2.0,
      mcpConfigPath: null, sandboxDir: '/tmp/sandbox',
    });
    expect(cmd.args).not.toContain('--mcp-config');
    expect(cmd.args).not.toContain(null);
    expect(cmd.env.PATH).toContain('bin');
  });
});
