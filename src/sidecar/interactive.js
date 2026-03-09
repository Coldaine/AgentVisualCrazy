/**
 * Sidecar Interactive Mode - Electron GUI session management
 * Extracted from start.js for file size compliance (< 300 lines).
 */

const path = require('path');
const { spawn } = require('child_process');

const { startOpenCodeServer } = require('./session-utils');
const { createSession, sendPromptAsync } = require('../opencode-client');
const { mapAgentToOpenCode } = require('../utils/agent-mapping');
const { logger } = require('../utils/logger');

/** Check if Electron is available (lazy loading guard) */
function checkElectronAvailable() {
  try {
    require.resolve('electron');
    return true;
  } catch {
    return false;
  }
}

/** Build environment variables for Electron process */
function buildElectronEnv(taskId, model, project, nodeModulesBin, existingPath, options = {}) {
  const { agent, isResume, conversation, mcp, client } = options;
  const env = {
    ...process.env,
    PATH: `${nodeModulesBin}:${existingPath}`,
    SIDECAR_TASK_ID: taskId,
    SIDECAR_MODEL: model,
    SIDECAR_PROJECT: project
  };

  if (client) { env.SIDECAR_CLIENT = client; }

  if (agent) {
    const agentConfig = mapAgentToOpenCode(agent);
    env.SIDECAR_AGENT = agentConfig.agent;
    if (agentConfig.permissions) { env.SIDECAR_PERMISSIONS = agentConfig.permissions; }
  }

  if (isResume) {
    env.SIDECAR_RESUME = 'true';
    if (conversation) { env.SIDECAR_CONVERSATION = conversation; }
  }

  if (mcp) { env.SIDECAR_MCP_CONFIG = JSON.stringify(mcp); }

  return env;
}

/** Handle Electron process stdout/stderr and exit */
function handleElectronProcess(electronProcess, taskId, resolve) {
  let stdout = '';

  electronProcess.stdout.on('data', (data) => { stdout += data.toString(); });

  electronProcess.stderr.on('data', (data) => {
    data.toString().trim().split('\n').filter(l => l.trim())
      .forEach(line => logger.debug('Electron', { output: line.trim() }));
  });

  electronProcess.on('error', (error) => {
    logger.error('Electron process error', { error: error.message });
    resolve({
      summary: '', completed: false, timedOut: false, taskId,
      error: `Failed to start Electron: ${error.message}`
    });
  });

  electronProcess.on('close', (code) => {
    logger.debug('Electron closed', { code, stdoutLength: stdout.length });
    resolve({
      summary: stdout.trim() || 'Session ended without summary.',
      completed: code === 0, timedOut: false, taskId, exitCode: code
    });
  });
}

/** Run sidecar in interactive mode (Electron GUI) */
async function runInteractive(model, systemPrompt, userMessage, taskId, project, options = {}) {
  if (!checkElectronAvailable()) {
    logger.error('Electron not installed — interactive mode unavailable');
    return {
      summary: '', completed: false, timedOut: false, taskId,
      error: 'Interactive mode requires electron. Install with: npm install -g claude-sidecar (or use --no-ui for headless mode)'
    };
  }

  const { agent, isResume, conversation, mcp, reasoning, opencodeSessionId, client } = options;

  // Start OpenCode server (shared with headless mode)
  let ocClient, server;
  try {
    const result = await startOpenCodeServer(mcp, { client });
    ocClient = result.client;
    server = result.server;
  } catch (error) {
    logger.error('Failed to start OpenCode server', { error: error.message });
    return {
      summary: '', completed: false, timedOut: false, taskId,
      error: `Failed to start server: ${error.message}`
    };
  }

  // Create or reconnect to session
  let sessionId;
  try {
    if (isResume && opencodeSessionId) {
      // Resume: reconnect to existing OpenCode session
      sessionId = opencodeSessionId;
      logger.info('Reconnecting to existing session', { sessionId });
    } else {
      // New session: create and send initial prompt
      sessionId = await createSession(ocClient);

      const promptOptions = {
        model, system: systemPrompt,
        parts: [{ type: 'text', text: userMessage }]
      };

      // Always set agent — defaults to 'chat' when not specified
      const agentConfig = mapAgentToOpenCode(agent);
      promptOptions.agent = agentConfig.agent;
      if (reasoning) { promptOptions.reasoning = reasoning; }

      await sendPromptAsync(ocClient, sessionId, promptOptions);
    }
    logger.debug('Interactive session ready', { sessionId, isResume: !!isResume });
  } catch (error) {
    server.close();
    return {
      summary: '', completed: false, timedOut: false, taskId,
      error: `Session setup failed: ${error.message}`
    };
  }

  const serverPort = new URL(server.url).port;

  return new Promise((resolve, _reject) => {
    const electronPath = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'electron');
    const mainPath = path.join(__dirname, '..', '..', 'electron', 'main.js');

    const nodeModulesBin = path.join(__dirname, '..', '..', 'node_modules', '.bin');
    const existingPath = process.env.PATH || '';
    const env = buildElectronEnv(
      taskId, model, project, nodeModulesBin, existingPath,
      { agent, isResume, conversation, mcp, client }
    );

    // Pass OpenCode server info to Electron
    env.SIDECAR_OPENCODE_PORT = serverPort;
    env.SIDECAR_SESSION_ID = sessionId;

    const debugPort = process.env.SIDECAR_DEBUG_PORT || '9222';
    logger.debug('Launching Electron', { taskId, model, debugPort, serverPort, sessionId });

    const electronProcess = spawn(electronPath, [
      `--remote-debugging-port=${debugPort}`,
      mainPath
    ], { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] });

    // Clean up server when Electron exits
    const originalResolve = resolve;
    handleElectronProcess(electronProcess, taskId, (result) => {
      server.close();
      logger.debug('OpenCode server closed after Electron exit');
      result.opencodeSessionId = sessionId;
      originalResolve(result);
    });
  });
}

module.exports = {
  checkElectronAvailable,
  buildElectronEnv,
  handleElectronProcess,
  runInteractive
};
