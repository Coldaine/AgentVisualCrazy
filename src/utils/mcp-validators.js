/**
 * MCP Validators
 *
 * Validation for MCP spec and config file arguments.
 * Extracted from validators.js to keep modules under 300 lines.
 */

const fs = require('fs');

/**
 * Validate MCP spec format (OPTIONAL - only validates if provided)
 * @param {string} mcp
 * @returns {{valid: boolean, error?: string}}
 */
function validateMcpSpec(mcp) {
  // Skip validation if not provided - MCP is optional
  if (!mcp) {
    return { valid: true };
  }

  // Format: name=url or name=command
  if (!mcp.includes('=')) {
    return {
      valid: false,
      error: `Error: --mcp must be in format 'name=url' or 'name=command'. Got: '${mcp}'`
    };
  }

  // Split on first '=' only (value can contain '=')
  const eqIndex = mcp.indexOf('=');
  const name = mcp.slice(0, eqIndex);
  const value = mcp.slice(eqIndex + 1);

  if (!name || !value) {
    return {
      valid: false,
      error: `Error: --mcp must have both name and value. Got: '${mcp}'`
    };
  }

  return { valid: true };
}

/**
 * Validate MCP config file exists and is valid JSON (OPTIONAL)
 * @param {string} mcpConfig
 * @returns {{valid: boolean, error?: string}}
 */
function validateMcpConfigFile(mcpConfig) {
  // Skip validation if not provided - MCP config is optional
  if (!mcpConfig) {
    return { valid: true };
  }

  if (!fs.existsSync(mcpConfig)) {
    return {
      valid: false,
      error: `Error: --mcp-config file does not exist: ${mcpConfig}`
    };
  }

  try {
    const content = fs.readFileSync(mcpConfig, 'utf-8');
    JSON.parse(content);
  } catch (e) {
    return {
      valid: false,
      error: `Error: --mcp-config file is not valid JSON: ${mcpConfig}`
    };
  }

  return { valid: true };
}

module.exports = {
  validateMcpSpec,
  validateMcpConfigFile
};
