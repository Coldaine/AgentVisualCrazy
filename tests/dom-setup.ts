/**
 * jsdom test setup: mock the canvas 2D context and the Electron preload bridge
 * so renderer components mount without crashing in a headless DOM.
 */
import '@testing-library/jest-dom/vitest'

// jsdom has no canvas — stub getContext so canvas-based components don't throw.
HTMLCanvasElement.prototype.getContext = (() => {
  const stub = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'canvas') return { width: 800, height: 600 }
        return () => undefined
      },
    },
  )
  return () => stub as CanvasRenderingContext2D
})() as typeof HTMLCanvasElement.prototype.getContext

// Mock the Electron preload bridge exposed on window.agentVisual.
;(globalThis as unknown as { agentVisual: unknown }).agentVisual = {
  onReady: (cb: () => void) => {
    queueMicrotask(cb)
    return () => {}
  },
  onConfig: () => () => {},
  onMessage: () => () => {},
  onExhibits: () => () => {},
  onConnectionStatus: () => () => {},
  send: () => {},
  queryRecent: () => Promise.resolve([]),
}

// jsdom doesn't implement matchMedia; some UI libs query it on mount.
if (!window.matchMedia) {
  // @ts-expect-error -- minimal matchMedia stub for jsdom
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

// jsdom doesn't implement ResizeObserver.
if (!globalThis.ResizeObserver) {
  // @ts-expect-error -- minimal ResizeObserver stub for jsdom
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
