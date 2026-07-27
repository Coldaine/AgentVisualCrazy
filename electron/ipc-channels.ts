/** IPC channel names shared by main and preload. Frozen at runtime so a rename is a deliberate act. */
export const IPC = Object.freeze({
  /** Renderer → main (webview protocol messages) */
  RENDERER_MESSAGE: 'avc:renderer-message',
  /** Main → renderer (extension→webview protocol messages) */
  HOST_MESSAGE: 'avc:host-message',
} as const)
