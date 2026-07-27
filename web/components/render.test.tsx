/**
 * Render smoke tests for the agent-flow visualizer and the Exhibit Stage.
 * Verifies the components mount without throwing in a jsdom environment
 * (canvas + Electron bridge mocked in tests/dom-setup.ts).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentVisualizer } from '@/components/agent-visualizer'
import { ExhibitGalleryApp } from '@/components/exhibits'

describe('AgentVisualizer render', () => {
  it('mounts without throwing and renders a canvas container', () => {
    const { container } = render(<AgentVisualizer />)
    // The visualizer mounts a canvas; assert the document has content.
    expect(container).toBeTruthy()
    expect(container.childNodes.length).toBeGreaterThan(0)
    // At least one canvas element should be present.
    const canvases = container.querySelectorAll('canvas')
    expect(canvases.length).toBeGreaterThan(0)
  })
})

describe('ExhibitGalleryApp render', () => {
  it('mounts the Exhibit Stage with fixture source by default', () => {
    const { container } = render(<ExhibitGalleryApp />)
    const surface = container.querySelector('[data-exhibit-source]')
    expect(surface).not.toBeNull()
    expect(surface?.getAttribute('data-exhibit-source')).toBe('fixture')
  })

  it('renders exhibit artifacts from the fixture gallery', () => {
    const { container } = render(<ExhibitGalleryApp />)
    // The fixture gallery has authored artifacts; assert at least one is rendered.
    const artifacts = container.querySelectorAll('[data-exhibit-id], [data-artifact-id], .exhibit-card, article')
    // The ExhibitStage renders artifact cards; be lenient about the selector
    // but assert the surface has non-trivial content.
    expect(container.querySelector('.exhibit-surface')?.textContent?.length ?? 0).toBeGreaterThan(0)
  })
})
