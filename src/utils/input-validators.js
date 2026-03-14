'use strict';

/**
 * @module input-validators
 * MCP input validation with structured error responses.
 * Composes validators from validators.js and adds model resolution.
 */

// Lazy require to avoid circular dependency (validators.js re-exports from here)
let _validators;
function getValidators() {
  if (!_validators) { _validators = require('./validators'); }
  return _validators;
}

/**
 * Find candidates that start with the input or vice versa.
 * @param {string} input
 * @param {string[]} candidates
 * @returns {string[]} Up to 3 matching candidates
 */
function findSimilar(input, candidates) {
  if (!input) { return []; }
  const lower = input.toLowerCase();
  return candidates.filter(c => {
    const cl = c.toLowerCase();
    return cl.startsWith(lower) || lower.startsWith(cl);
  }).slice(0, 3);
}

/**
 * Validate sidecar_start inputs before session creation.
 * Composes existing validators and adds model resolution.
 * @param {Object} input - Raw MCP tool input
 * @returns {{ valid: true, resolvedModel: string } | { valid: false, error: Object }}
 */
function validateStartInputs(input) {
  // 1. Prompt
  const { validatePromptContent, validateHeadlessAgent } = getValidators();
  const promptResult = validatePromptContent(input.prompt);
  if (!promptResult.valid) {
    return {
      valid: false,
      error: {
        type: 'validation_error',
        field: 'prompt',
        message: promptResult.error,
      },
    };
  }

  // 2. Model: resolve alias to full provider/model string
  const { tryResolveModel, getEffectiveAliases } = require('./config');
  const { model: resolved, error: modelError } = tryResolveModel(input.model);
  if (modelError) {
    const aliases = Object.keys(getEffectiveAliases());
    const suggestions = findSimilar(input.model, aliases);
    return {
      valid: false,
      error: {
        type: 'validation_error',
        field: 'model',
        message: `Model '${input.model}' not found. ${modelError}`,
        suggestions,
        available: aliases,
      },
    };
  }

  // 3. Timeout: positive number, max 60 minutes
  if (input.timeout !== undefined) {
    const t = Number(input.timeout);
    if (isNaN(t) || t <= 0) {
      return {
        valid: false,
        error: {
          type: 'validation_error',
          field: 'timeout',
          message: `Timeout must be a positive number (minutes). Got: ${input.timeout}`,
        },
      };
    }
    if (t > 60) {
      return {
        valid: false,
        error: {
          type: 'validation_error',
          field: 'timeout',
          message: `Timeout cannot exceed 60 minutes. Got: ${t}`,
        },
      };
    }
  }

  // 4. Agent + headless compatibility
  if (input.noUi) {
    const agentResult = validateHeadlessAgent(input.agent);
    if (!agentResult.valid) {
      return {
        valid: false,
        error: {
          type: 'validation_error',
          field: 'agent',
          message: agentResult.error,
          suggestions: ['Build', 'Plan'],
        },
      };
    }
  }

  return { valid: true, resolvedModel: resolved };
}

module.exports = { validateStartInputs, findSimilar };
