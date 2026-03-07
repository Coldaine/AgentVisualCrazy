const fs = require('fs');
const path = require('path');
const os = require('os');
const { runProgrammaticChecks } = require('../evaluator');

describe('runProgrammaticChecks', () => {
  test('tool_called passes when tool was called', () => {
    const transcript = {
      toolCalls: [{ tool: 'sidecar_start', params: { model: 'gemini' }, result: '{}' }],
      errors: [],
    };
    const criteria = [{ type: 'tool_called', tool: 'sidecar_start' }];
    const results = runProgrammaticChecks(criteria, transcript, '/tmp');
    expect(results[0].passed).toBe(true);
  });

  test('tool_called fails when tool was not called', () => {
    const transcript = { toolCalls: [], errors: [] };
    const criteria = [{ type: 'tool_called', tool: 'sidecar_start' }];
    const results = runProgrammaticChecks(criteria, transcript, '/tmp');
    expect(results[0].passed).toBe(false);
  });

  test('tool_param passes when param matches expected value', () => {
    const transcript = {
      toolCalls: [{ tool: 'sidecar_start', params: { agent: 'Build' }, result: '{}' }],
      errors: [],
    };
    const criteria = [{ type: 'tool_param', tool: 'sidecar_start', param: 'agent', expected: 'Build' }];
    const results = runProgrammaticChecks(criteria, transcript, '/tmp');
    expect(results[0].passed).toBe(true);
  });

  test('tool_param_matches passes on regex match', () => {
    const transcript = {
      toolCalls: [{ tool: 'sidecar_start', params: { model: 'openrouter/google/gemini-2.5-flash' }, result: '{}' }],
      errors: [],
    };
    const criteria = [{ type: 'tool_param_matches', tool: 'sidecar_start', param: 'model', pattern: 'gemini' }];
    const results = runProgrammaticChecks(criteria, transcript, '/tmp');
    expect(results[0].passed).toBe(true);
  });

  test('file_changed passes when file was modified', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-test-'));
    const filePath = path.join(tmpDir, 'src', 'auth.js');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'modified content');

    const criteria = [{ type: 'file_changed', path: 'src/auth.js' }];
    const results = runProgrammaticChecks(criteria, { toolCalls: [], errors: [] }, tmpDir);
    expect(results[0].passed).toBe(true);

    fs.rmSync(tmpDir, { recursive: true });
  });

  test('file_created passes when file matching pattern exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-test-'));
    const filePath = path.join(tmpDir, 'tests', 'todo.test.js');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'test content');

    const criteria = [{ type: 'file_created', pattern: 'tests/.*\\.js$' }];
    const results = runProgrammaticChecks(criteria, { toolCalls: [], errors: [] }, tmpDir);
    expect(results[0].passed).toBe(true);

    fs.rmSync(tmpDir, { recursive: true });
  });

  test('file_contains passes when file has matching content', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-test-'));
    const filePath = path.join(tmpDir, 'src', 'auth.js');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'const result = await refreshToken(old);');

    const criteria = [{ type: 'file_contains', path: 'src/auth.js', pattern: 'await.*refresh' }];
    const results = runProgrammaticChecks(criteria, { toolCalls: [], errors: [] }, tmpDir);
    expect(results[0].passed).toBe(true);

    fs.rmSync(tmpDir, { recursive: true });
  });

  test('no_errors passes when transcript has no errors', () => {
    const transcript = { toolCalls: [], errors: [] };
    const criteria = [{ type: 'no_errors' }];
    const results = runProgrammaticChecks(criteria, transcript, '/tmp');
    expect(results[0].passed).toBe(true);
  });

  test('no_errors fails when transcript has errors', () => {
    const transcript = { toolCalls: [], errors: ['Something broke'] };
    const criteria = [{ type: 'no_errors' }];
    const results = runProgrammaticChecks(criteria, transcript, '/tmp');
    expect(results[0].passed).toBe(false);
  });
});

const { buildJudgePrompt, parseJudgeResponse } = require('../evaluator');

describe('buildJudgePrompt', () => {
  test('includes rubric items and transcript summary', () => {
    const rubric = ['Was the model choice appropriate? (1-5)', 'Was the briefing good? (1-5)'];
    const transcript = {
      toolCalls: [{ tool: 'sidecar_start', params: { model: 'gemini' }, result: '{"taskId":"abc"}' }],
      errors: [],
    };
    const prompt = buildJudgePrompt(rubric, transcript);
    expect(prompt).toContain('model choice');
    expect(prompt).toContain('briefing');
    expect(prompt).toContain('sidecar_start');
    expect(prompt).toContain('gemini');
    expect(prompt).toContain('JSON');
  });
});

describe('parseJudgeResponse', () => {
  test('extracts scores from JSON response', () => {
    const response = '{"scores": [4, 3, 5, 4]}';
    const rubric = ['Q1', 'Q2', 'Q3', 'Q4'];
    const result = parseJudgeResponse(response, rubric, 3.5);
    expect(result.scores).toHaveLength(4);
    expect(result.scores[0].score).toBe(4);
    expect(result.average).toBe(4.0);
    expect(result.passed).toBe(true);
  });

  test('fails when average below threshold', () => {
    const response = '{"scores": [1, 2, 1, 2]}';
    const rubric = ['Q1', 'Q2', 'Q3', 'Q4'];
    const result = parseJudgeResponse(response, rubric, 3.5);
    expect(result.passed).toBe(false);
    expect(result.average).toBe(1.5);
  });

  test('handles JSON embedded in text', () => {
    const response = 'Here are my scores:\n{"scores": [5, 4, 5, 4]}\nDone.';
    const rubric = ['Q1', 'Q2', 'Q3', 'Q4'];
    const result = parseJudgeResponse(response, rubric, 3.5);
    expect(result.scores).toHaveLength(4);
    expect(result.passed).toBe(true);
  });
});
