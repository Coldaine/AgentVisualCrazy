'use strict';

describe('validateStartInputs', () => {
  let validateStartInputs, findSimilar;

  beforeAll(() => {
    ({ validateStartInputs, findSimilar } = require('../src/utils/validators'));
  });

  describe('prompt validation', () => {
    test('rejects empty prompt', () => {
      const result = validateStartInputs({ prompt: '', model: 'gemini' });
      expect(result.valid).toBe(false);
      expect(result.error.field).toBe('prompt');
    });

    test('rejects whitespace-only prompt', () => {
      const result = validateStartInputs({ prompt: '   ', model: 'gemini' });
      expect(result.valid).toBe(false);
      expect(result.error.field).toBe('prompt');
    });

    test('rejects undefined prompt', () => {
      const result = validateStartInputs({ model: 'gemini' });
      expect(result.valid).toBe(false);
      expect(result.error.field).toBe('prompt');
    });
  });

  describe('model validation', () => {
    test('rejects invalid model alias with suggestions', () => {
      const result = validateStartInputs({ prompt: 'test', model: 'gemni' });
      expect(result.valid).toBe(false);
      expect(result.error.field).toBe('model');
      expect(result.error.suggestions).toBeDefined();
      expect(result.error.available).toBeDefined();
    });

    test('accepts valid model alias and resolves it', () => {
      const result = validateStartInputs({ prompt: 'test', model: 'gemini' });
      expect(result.valid).toBe(true);
      expect(result.resolvedModel).toBeDefined();
      expect(result.resolvedModel).toContain('/');
    });

    test('accepts undefined model (uses default)', () => {
      const result = validateStartInputs({ prompt: 'test' });
      // Should either resolve default or fail gracefully
      // depends on config - if no default configured, may fail
      if (result.valid) {
        expect(result.resolvedModel).toBeDefined();
      } else {
        expect(result.error.field).toBe('model');
      }
    });

    test('accepts full model string as-is', () => {
      const result = validateStartInputs({
        prompt: 'test',
        model: 'openrouter/google/gemini-2.0-flash',
      });
      expect(result.valid).toBe(true);
      expect(result.resolvedModel).toBe('openrouter/google/gemini-2.0-flash');
    });
  });

  describe('timeout validation', () => {
    test('rejects negative timeout', () => {
      const result = validateStartInputs({ prompt: 'test', model: 'gemini', timeout: -5 });
      expect(result.valid).toBe(false);
      expect(result.error.field).toBe('timeout');
    });

    test('rejects zero timeout', () => {
      const result = validateStartInputs({ prompt: 'test', model: 'gemini', timeout: 0 });
      expect(result.valid).toBe(false);
      expect(result.error.field).toBe('timeout');
    });

    test('rejects timeout exceeding 60 minutes', () => {
      const result = validateStartInputs({ prompt: 'test', model: 'gemini', timeout: 999 });
      expect(result.valid).toBe(false);
      expect(result.error.field).toBe('timeout');
    });

    test('accepts valid timeout', () => {
      const result = validateStartInputs({ prompt: 'test', model: 'gemini', timeout: 15 });
      expect(result.valid).toBe(true);
    });

    test('accepts omitted timeout', () => {
      const result = validateStartInputs({ prompt: 'test', model: 'gemini' });
      expect(result.valid).toBe(true);
    });
  });

  describe('agent + headless validation', () => {
    test('rejects chat agent with noUi', () => {
      const result = validateStartInputs({
        prompt: 'test', model: 'gemini', agent: 'Chat', noUi: true,
      });
      expect(result.valid).toBe(false);
      expect(result.error.field).toBe('agent');
      expect(result.error.suggestions).toContain('Build');
    });

    test('accepts build agent with noUi', () => {
      const result = validateStartInputs({
        prompt: 'test', model: 'gemini', agent: 'Build', noUi: true,
      });
      expect(result.valid).toBe(true);
    });

    test('accepts chat agent without noUi', () => {
      const result = validateStartInputs({
        prompt: 'test', model: 'gemini', agent: 'Chat', noUi: false,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('error format', () => {
    test('error has type field', () => {
      const result = validateStartInputs({ prompt: '' });
      expect(result.error.type).toBe('validation_error');
    });

    test('error has field field', () => {
      const result = validateStartInputs({ prompt: '' });
      expect(result.error.field).toBeDefined();
    });

    test('error has message field', () => {
      const result = validateStartInputs({ prompt: '' });
      expect(result.error.message).toBeDefined();
    });
  });
});

describe('findSimilar', () => {
  let findSimilar;

  beforeAll(() => {
    ({ findSimilar } = require('../src/utils/validators'));
  });

  test('finds prefix matches', () => {
    const result = findSimilar('gem', ['gemini', 'gpt', 'opus']);
    expect(result).toContain('gemini');
    expect(result).not.toContain('gpt');
  });

  test('finds reverse prefix matches', () => {
    const result = findSimilar('gemini-pro', ['gemini', 'gpt']);
    expect(result).toContain('gemini');
  });

  test('returns empty for null input', () => {
    const result = findSimilar(null, ['gemini']);
    expect(result).toEqual([]);
  });

  test('limits to 3 results', () => {
    const result = findSimilar('g', ['g1', 'g2', 'g3', 'g4', 'g5']);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});
