import { advanceParticleEngineState, createParticleEngineState, syncParticleEngineState, type ParticleSceneEdge, type ParticleEngineState } from './particle-engine-core';
import type { ParticleWorkerInput, ParticleWorkerOutput } from './particle-worker-protocol';
import type { QualityTier } from './quality';
import type { Particle } from './types';

interface WorkerLike {
  onmessage: ((event: MessageEvent<ParticleWorkerOutput>) => void) | null;
  postMessage(message: ParticleWorkerInput): void;
  terminate(): void;
}

export interface ParticleEngine {
  readonly mode: 'worker' | 'inline';
  syncScene(edges: ParticleSceneEdge[], qualityTier: QualityTier): void;
  setQuality(qualityTier: QualityTier): void;
  step(dtMs: number): void;
  snapshot(): Particle[];
  destroy(): void;
}

export interface ParticleEngineOptions {
  initialTier: QualityTier;
  workerFactory?: () => WorkerLike | null;
}

class InlineParticleEngine implements ParticleEngine {
  readonly mode = 'inline' as const;
  private state: ParticleEngineState;

  constructor(initialTier: QualityTier) {
    this.state = createParticleEngineState([], initialTier);
  }

  syncScene(edges: ParticleSceneEdge[], qualityTier: QualityTier): void {
    this.state = syncParticleEngineState(this.state, edges, qualityTier);
  }

  setQuality(qualityTier: QualityTier): void {
    this.state = syncParticleEngineState(this.state, this.state.edges, qualityTier);
  }

  step(dtMs: number): void {
    this.state = advanceParticleEngineState(this.state, dtMs);
  }

  snapshot(): Particle[] {
    return this.state.particles;
  }

  destroy(): void {
    this.state = createParticleEngineState([], this.state.qualityTier);
  }
}

class WorkerParticleEngine implements ParticleEngine {
  readonly mode = 'worker' as const;
  private readonly worker: WorkerLike;
  private snapshotBuffer: Particle[] = [];
  private pending = false;
  private queuedDtMs = 0;
  private sceneEdges: ParticleSceneEdge[] = [];
  private qualityTier: QualityTier;

  constructor(worker: WorkerLike, initialTier: QualityTier) {
    this.worker = worker;
    this.qualityTier = initialTier;
    this.worker.onmessage = (event) => {
      this.snapshotBuffer = event.data.particles;
      this.pending = false;
      if (this.queuedDtMs > 0) {
        const queuedDtMs = this.queuedDtMs;
        this.queuedDtMs = 0;
        this.step(queuedDtMs);
      }
    };
  }

  syncScene(edges: ParticleSceneEdge[], qualityTier: QualityTier): void {
    this.sceneEdges = [...edges];
    this.qualityTier = qualityTier;
    this.snapshotBuffer = [];
    this.worker.postMessage({
      type: 'scene',
      edges,
      qualityTier
    });
  }

  setQuality(qualityTier: QualityTier): void {
    this.qualityTier = qualityTier;
    this.worker.postMessage({
      type: 'quality',
      qualityTier
    });
  }

  step(dtMs: number): void {
    if (this.pending) {
      this.queuedDtMs = Math.min(96, this.queuedDtMs + dtMs);
      return;
    }
    this.pending = true;
    this.worker.postMessage({
      type: 'tick',
      dtMs
    });
  }

  snapshot(): Particle[] {
    return this.snapshotBuffer;
  }

  destroy(): void {
    this.worker.terminate();
    this.snapshotBuffer = [];
  }
}

function defaultWorkerFactory(): WorkerLike | null {
  if (typeof Worker === 'undefined') {
    return null;
  }

  try {
    return new Worker(new URL('./particle-worker.ts', import.meta.url), {
      type: 'module'
    });
  } catch {
    return null;
  }
}

export function createParticleEngine(options: ParticleEngineOptions): ParticleEngine {
  const worker = (options.workerFactory ?? defaultWorkerFactory)();
  if (worker) {
    return new WorkerParticleEngine(worker, options.initialTier);
  }
  return new InlineParticleEngine(options.initialTier);
}
