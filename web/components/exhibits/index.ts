/**
 * Exhibit Stage — curated gallery surface for typed ExhibitArtifact contracts.
 *
 * `live_graph` mapping: agent-flow's AgentVisualizer canvas is the living
 * graph. Pass it (or a canvas subtree) as `ExhibitStage`'s `liveGraph` slot
 * when that artifact is active. Default entry still mounts AgentVisualizer
 * alone; open the fixture stage with `?mode=exhibits`.
 */
export { default as ExhibitStage } from './ExhibitStage';
export type { ExhibitStageProps } from './ExhibitStage'
export { default as fixtureGallery } from './fixture-gallery'
export { ExhibitGalleryApp } from './ExhibitGalleryApp'
export { LiveExhibitStrip } from './LiveExhibitStrip'
export * from './types'
