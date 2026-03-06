/**
 * Tests for electron/toolbar.js
 *
 * Verifies dynamic branding based on client type.
 */

const { buildToolbarHTML, TOOLBAR_H, getBrandName } = require('../electron/toolbar');

describe('toolbar', () => {
  describe('getBrandName', () => {
    it('should return "Claude Sidecar" for code-local client', () => {
      expect(getBrandName('code-local')).toBe('Claude Sidecar');
    });

    it('should return "Claude Sidecar" for code-web client', () => {
      expect(getBrandName('code-web')).toBe('Claude Sidecar');
    });

    it('should return "Openwork Sidecar" for cowork client', () => {
      expect(getBrandName('cowork')).toBe('Openwork Sidecar');
    });

    it('should default to "Claude Sidecar" when no client specified', () => {
      expect(getBrandName()).toBe('Claude Sidecar');
      expect(getBrandName(undefined)).toBe('Claude Sidecar');
    });
  });

  describe('buildToolbarHTML', () => {
    it('should show "Claude Sidecar" by default', () => {
      const html = buildToolbarHTML({ mode: 'sidecar' });
      expect(html).toContain('Claude Sidecar');
      expect(html).not.toContain('Openwork Sidecar');
    });

    it('should show "Openwork Sidecar" for cowork client', () => {
      const html = buildToolbarHTML({ mode: 'sidecar', client: 'cowork' });
      expect(html).toContain('Openwork Sidecar');
      expect(html).not.toContain('Claude Sidecar');
    });

    it('should show "Claude Sidecar" for code-local client', () => {
      const html = buildToolbarHTML({ mode: 'sidecar', client: 'code-local' });
      expect(html).toContain('Claude Sidecar');
    });

    it('should show correct branding in setup mode for cowork', () => {
      const html = buildToolbarHTML({ mode: 'setup', client: 'cowork' });
      expect(html).toContain('Openwork Sidecar');
      expect(html).not.toContain('Claude Sidecar');
    });

    it('should show correct branding in setup mode for code-local', () => {
      const html = buildToolbarHTML({ mode: 'setup', client: 'code-local' });
      expect(html).toContain('Claude Sidecar');
    });
  });

  describe('TOOLBAR_H', () => {
    it('should be 40', () => {
      expect(TOOLBAR_H).toBe(40);
    });
  });
});
