/** IPC channel names shared by main and preload. */
export const IPC = {
  /** Renderer → main (webview protocol messages) */
  RENDERER_MESSAGE: 'avc:renderer-message',
  /** Main → renderer (extension→webview protocol messages) */
  HOST_MESSAGE: 'avc:host-message',
  /** Curator lookback: ObservationStore.recent(n) */
  OBSERVATION_QUERY_RECENT: 'avc:observation-query-recent',
  /**
   * Main → renderer exhibit gallery publish.
   * Payload also arrives as `{ type: 'exhibit-artifacts', ... }` on HOST_MESSAGE.
   */
  EXHIBIT_ARTIFACTS: 'avc:exhibit-artifacts',
} as const
