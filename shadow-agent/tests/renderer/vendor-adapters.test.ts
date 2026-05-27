import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getGraphPhysicsAdapter,
  type GraphPhysicsSimulation
} from '../../src/renderer/canvas/force-simulation-adapter';
import { getMotionAdapter } from '../../src/renderer/motion-adapter';
import { getStyleVariantAdapter } from '../../src/renderer/style-variant-adapter';

const testDir = dirname(fileURLToPath(import.meta.url));
const rendererSrcDir = join(testDir, '..', '..', 'src', 'renderer');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe('renderer vendor adapters', () => {
  it('exposes graph physics through the internal adapter contract', () => {
    const adapter = getGraphPhysicsAdapter();
    const simulation: GraphPhysicsSimulation = adapter.createSimulation({
      nodes: [],
      edges: [],
      width: 640,
      height: 480,
      collideRadius: 44,
      onTick: () => undefined
    });

    expect(adapter.id).toBe('d3-force-graph-physics');
    expect(typeof simulation.updateNodes).toBe('function');
    expect(typeof simulation.updateLinks).toBe('function');
    expect(typeof simulation.updateCenter).toBe('function');
    expect(typeof simulation.restart).toBe('function');
    expect(typeof simulation.stop).toBe('function');

    simulation.stop();
  });

  it('exposes motion and style variant vendors through internal adapters', () => {
    const motion = getMotionAdapter();
    const variants = getStyleVariantAdapter();

    expect(motion.id).toBe('react-spring-motion');
    expect(['function', 'object']).toContain(typeof motion.AnimatedAside);
    expect(['function', 'object']).toContain(typeof motion.AnimatedDiv);
    expect(typeof motion.useSpring).toBe('function');

    expect(variants.id).toBe('class-variance-authority');
    expect(typeof variants.createClassVariants).toBe('function');
  });

  it('keeps swappable vendor imports centralized in adapter modules', () => {
    const allowed = new Set([
      'canvas/force-simulation-adapter.ts',
      'motion-adapter.tsx',
      'style-variant-adapter.ts'
    ]);
    const forbiddenImports = [
      "from 'd3-force'",
      "from '@react-spring/web'",
      "from 'class-variance-authority'"
    ];

    const violations = sourceFiles(rendererSrcDir).flatMap((file) => {
      const relativePath = relative(rendererSrcDir, file).split(/[\\/]/).join('/');
      if (allowed.has(relativePath)) {
        return [];
      }
      const contents = readFileSync(file, 'utf8');
      return forbiddenImports
        .filter((vendorImport) => contents.includes(vendorImport))
        .map((vendorImport) => `${relativePath}: ${vendorImport}`);
    });

    expect(violations).toEqual([]);
  });
});
