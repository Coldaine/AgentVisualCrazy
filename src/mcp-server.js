/**
 * Sidecar MCP Server
 *
 * Exposes sidecar operations as MCP tools over stdio transport.
 * Wraps existing sidecar functions for use in Claude Cowork,
 * Claude Desktop, and Claude Code MCP integrations.
 *
 * Usage: sidecar mcp
 *
 * @module mcp-server
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { TOOLS, getGuideText } = require('./mcp-tools');
const { logger } = require('./utils/logger');

/** Get the project directory (cwd of the MCP client) */
function getProjectDir() {
  return process.cwd();
}

/**
 * Read session metadata from disk.
 * @param {string} taskId - The task ID to look up
 * @param {string} project - Project directory path
 * @returns {object|null} Parsed metadata or null if not found
 */
function readMetadata(taskId, project) {
  const metaPath = path.join(
    project, '.claude', 'sidecar_sessions', taskId, 'metadata.json'
  );
  if (!fs.existsSync(metaPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
}

/**
 * Spawn a sidecar process in the background (fire-and-forget).
 * Uses spawn with detached: true so the process outlives the MCP call.
 *
 * @param {string[]} args - CLI arguments for bin/sidecar.js
 */
function spawnSidecarProcess(args) {
  const sidecarBin = path.join(__dirname, '..', 'bin', 'sidecar.js');
  const child = spawn('node', [sidecarBin, ...args], {
    cwd: getProjectDir(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.unref();
  return child;
}

/** Tool handler implementations */
const handlers = {
  /** Start a new sidecar session */
  async sidecar_start(input, project) {
    const cwd = project || getProjectDir();
    const args = ['start', '--prompt', input.prompt];

    if (input.model) { args.push('--model', input.model); }
    if (input.agent) { args.push('--agent', input.agent); }
    if (input.noUi) { args.push('--no-ui'); }
    if (input.thinking) { args.push('--thinking', input.thinking); }
    args.push('--cwd', cwd);

    const { generateTaskId } = require('./sidecar/start');
    const taskId = generateTaskId();

    try {
      spawnSidecarProcess(args);
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to start sidecar: ${err.message}` }],
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          taskId,
          status: 'running',
          message: 'Sidecar started. Use sidecar_status to check progress, sidecar_read to get results.',
        }),
      }],
    };
  },

  /** Check status of a running sidecar task */
  async sidecar_status(input, project) {
    const cwd = project || getProjectDir();
    const metadata = readMetadata(input.taskId, cwd);

    if (!metadata) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Session ${input.taskId} not found.` }],
      };
    }

    const elapsed = Date.now() - new Date(metadata.createdAt).getTime();
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          taskId: metadata.taskId,
          status: metadata.status,
          model: metadata.model,
          agent: metadata.agent,
          elapsed: `${mins}m ${secs}s`,
          briefing: (metadata.briefing || '').slice(0, 100),
        }),
      }],
    };
  },

  /** Read results of a sidecar task */
  async sidecar_read(input, project) {
    const cwd = project || getProjectDir();
    const sessionDir = path.join(
      cwd, '.claude', 'sidecar_sessions', input.taskId
    );

    if (!fs.existsSync(sessionDir)) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Session ${input.taskId} not found.` }],
      };
    }

    const mode = input.mode || 'summary';

    if (mode === 'metadata') {
      const metaPath = path.join(sessionDir, 'metadata.json');
      const content = fs.readFileSync(metaPath, 'utf-8');
      return { content: [{ type: 'text', text: content }] };
    }

    if (mode === 'conversation') {
      const convPath = path.join(sessionDir, 'conversation.jsonl');
      if (!fs.existsSync(convPath)) {
        return { content: [{ type: 'text', text: 'No conversation recorded.' }] };
      }
      const content = fs.readFileSync(convPath, 'utf-8');
      return { content: [{ type: 'text', text: content }] };
    }

    // Default: summary
    const summaryPath = path.join(sessionDir, 'summary.md');
    if (!fs.existsSync(summaryPath)) {
      return {
        content: [{
          type: 'text',
          text: 'No summary available (session may still be running or was not folded).',
        }],
      };
    }
    const content = fs.readFileSync(summaryPath, 'utf-8');
    return { content: [{ type: 'text', text: content }] };
  },

  /** List all sidecar sessions for the current project */
  async sidecar_list(input, project) {
    const cwd = project || getProjectDir();
    const sessionsDir = path.join(cwd, '.claude', 'sidecar_sessions');

    if (!fs.existsSync(sessionsDir)) {
      return { content: [{ type: 'text', text: 'No sidecar sessions found.' }] };
    }

    let sessions = fs.readdirSync(sessionsDir)
      .filter(d => {
        const metaPath = path.join(sessionsDir, d, 'metadata.json');
        return fs.existsSync(metaPath);
      })
      .map(d => {
        const metaPath = path.join(sessionsDir, d, 'metadata.json');
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        return { id: d, ...meta };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (input.status && input.status !== 'all') {
      sessions = sessions.filter(s => s.status === input.status);
    }

    if (sessions.length === 0) {
      return { content: [{ type: 'text', text: 'No sidecar sessions found.' }] };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(sessions.map(s => ({
          id: s.id,
          model: s.model,
          status: s.status,
          agent: s.agent,
          briefing: (s.briefing || '').slice(0, 80),
          createdAt: s.createdAt,
        })), null, 2),
      }],
    };
  },

  /** Resume a previous sidecar session */
  async sidecar_resume(input, project) {
    const cwd = project || getProjectDir();
    const args = ['resume', input.taskId, '--cwd', cwd];
    if (input.noUi) { args.push('--no-ui'); }

    try {
      spawnSidecarProcess(args);
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to resume: ${err.message}` }],
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          taskId: input.taskId,
          status: 'running',
          message: 'Session resumed. Use sidecar_status to check progress.',
        }),
      }],
    };
  },

  /** Continue from a previous session with new prompt */
  async sidecar_continue(input, project) {
    const cwd = project || getProjectDir();
    const args = [
      'continue', input.taskId, '--prompt', input.prompt, '--cwd', cwd,
    ];
    if (input.model) { args.push('--model', input.model); }
    if (input.noUi) { args.push('--no-ui'); }

    try {
      spawnSidecarProcess(args);
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to continue: ${err.message}` }],
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          taskId: input.taskId,
          status: 'running',
          message: 'Continuation started. Use sidecar_status to check progress.',
        }),
      }],
    };
  },

  /** Launch the setup wizard */
  async sidecar_setup() {
    try {
      spawnSidecarProcess(['setup']);
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to launch setup: ${err.message}` }],
      };
    }
    return {
      content: [{
        type: 'text',
        text: 'Setup wizard launched. The Electron window should appear on your desktop.',
      }],
    };
  },

  /** Return the sidecar usage guide */
  async sidecar_guide() {
    return { content: [{ type: 'text', text: getGuideText() }] };
  },
};

/**
 * Start the MCP server on stdio transport.
 * Registers all tools from mcp-tools.js and connects via stdio.
 */
async function startMcpServer() {
  const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

  const server = new McpServer({
    name: 'sidecar',
    version: require('../package.json').version,
  });

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (input) => {
        try {
          return await handlers[tool.name](input);
        } catch (err) {
          logger.error(`MCP tool error: ${tool.name}`, { error: err.message });
          return {
            isError: true,
            content: [{ type: 'text', text: `Error: ${err.message}` }],
          };
        }
      }
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[sidecar] MCP server running on stdio\n');
}

module.exports = { handlers, startMcpServer };
