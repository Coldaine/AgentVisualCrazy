const { createFoldHandler } = require('../electron/fold');

// Mock dependencies
jest.mock('../electron/summary', () => ({
  requestSummaryFromModel: jest.fn().mockResolvedValue('Test summary'),
}));
jest.mock('../src/prompt-builder', () => ({
  getSummaryTemplate: jest.fn().mockReturnValue('template'),
}));
jest.mock('electron', () => ({
  app: { quit: jest.fn() },
}));

describe('Fold nudge message', () => {
  let stdoutSpy;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  test('shows nudge overlay after fold completes', async () => {
    const executedScripts = [];
    const mockWindow = {
      close: jest.fn(),
      isDestroyed: () => false,
      webContents: {
        executeJavaScript: jest.fn((script) => {
          executedScripts.push(script);
          return Promise.resolve();
        }),
      },
    };
    const mockContentView = {
      webContents: {
        executeJavaScript: jest.fn((script) => {
          executedScripts.push(script);
          return Promise.resolve();
        }),
      },
    };

    const handler = createFoldHandler({
      model: 'gemini', client: 'cowork', cwd: '/tmp',
      sessionId: 'ses_123', taskId: 'task-1', port: 4096,
    });

    await handler.triggerFold(mockWindow, mockContentView);

    const allScripts = executedScripts.join(' ');
    expect(allScripts).toContain('Tell Claude');
    expect(allScripts).toContain('done with the sidecar');
  });
});
