import '../helpers/path2d-polyfill';
import { describe, expect, it } from 'vitest';
import { drawScene } from '../../src/renderer/canvas/scene-drawer';
import { ALL_CANONICAL_SCENES } from '../fixtures/canvas-scenes';
import {
  createRecordedContext,
  type CanvasCommand,
  type RecordedGradient
} from '../helpers/record-2d-context';

function isRecordedGradient(value: unknown): value is RecordedGradient {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'id' in value &&
    'type' in value &&
    'addColorStop' in value
  );
}

function normalizeForSnapshot(command: CanvasCommand): Record<string, unknown> {
  if (command.type === 'setProperty' && isRecordedGradient(command.value)) {
    return {
      ...command,
      value: {
        gradientId: command.value.id,
        type: command.value.type
      }
    };
  }

  return { ...command };
}

function commandTypes(commands: readonly CanvasCommand[]): CanvasCommand['type'][] {
  return commands.map((command) => command.type);
}

describe('canvas scene pixel snapshots', () => {
  it('shared recording context captures the frame prologue used by scene snapshots', () => {
    const ctx = createRecordedContext();
    drawScene(ctx, ALL_CANONICAL_SCENES[0]);

    // This guards the renderer frame reset/background contract before scene-specific drawing starts.
    expect(commandTypes(ctx.getRecordedCommands()).slice(0, 5)).toEqual([
      'setTransform',
      'clearRect',
      'setTransform',
      'setProperty',
      'fillRect'
    ]);
  });

  for (const scene of ALL_CANONICAL_SCENES) {
    it(`matches the "${scene.label}" canonical scene`, () => {
      const ctx = createRecordedContext();
      drawScene(ctx, scene);
      const commands = ctx.getRecordedCommands();

      // Snapshots catch broad command drift; semantic assertions catch missing scene content directly.
      const types = commandTypes(commands);
      expect(types).toContain('fillRect');
      expect(commands.filter((command) => command.type === 'quadraticCurveTo')).toHaveLength(scene.edges.length);
      expect(commands.filter((command) => command.type === 'arc')).toHaveLength(scene.particles.length);

      for (const node of scene.nodes) {
        expect(commands).toContainEqual({
          type: 'fillText',
          text: node.label,
          x: node.x,
          y: node.y - 4,
          maxWidth: undefined
        });
        expect(commands).toContainEqual({
          type: 'fillText',
          text: `${node.toolCount} tools`,
          x: node.x,
          y: node.y + 10,
          maxWidth: undefined
        });
      }

      if (scene.riskLevel === 'low') {
        expect(types).not.toContain('createRadialGradient');
      } else {
        expect(types).toContain('createRadialGradient');
      }

      expect(commands.map(normalizeForSnapshot)).toMatchSnapshot(scene.label);
    });
  }
});
