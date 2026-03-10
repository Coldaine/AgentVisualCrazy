/**
 * Agent Mapping Tests
 *
 * Tests for agent name mapping, validation, and the custom chat agent default.
 */

const {
  PRIMARY_AGENTS,
  HEADLESS_SAFE_AGENTS,
  mapAgentToOpenCode,
  isValidAgent,
  isHeadlessSafe
} = require('../src/utils/agent-mapping');

describe('Agent Mapping', () => {
  describe('PRIMARY_AGENTS', () => {
    it('should include chat, build, and plan', () => {
      expect(PRIMARY_AGENTS).toContain('chat');
      expect(PRIMARY_AGENTS).toContain('build');
      expect(PRIMARY_AGENTS).toContain('plan');
    });
  });

  describe('mapAgentToOpenCode', () => {
    it('should default to chat when no agent specified', () => {
      expect(mapAgentToOpenCode()).toEqual({ agent: 'chat' });
      expect(mapAgentToOpenCode(null)).toEqual({ agent: 'chat' });
      expect(mapAgentToOpenCode('')).toEqual({ agent: 'chat' });
      expect(mapAgentToOpenCode('  ')).toEqual({ agent: 'chat' });
    });

    it('should map native agents case-insensitively', () => {
      expect(mapAgentToOpenCode('Build')).toEqual({ agent: 'build' });
      expect(mapAgentToOpenCode('PLAN')).toEqual({ agent: 'plan' });
      expect(mapAgentToOpenCode('Chat')).toEqual({ agent: 'chat' });
      expect(mapAgentToOpenCode('general')).toEqual({ agent: 'general' });
      expect(mapAgentToOpenCode('Explore')).toEqual({ agent: 'explore' });
    });

    it('should pass through custom agent names as lowercase', () => {
      expect(mapAgentToOpenCode('MyCustomAgent')).toEqual({ agent: 'mycustomagent' });
    });
  });

  describe('isValidAgent', () => {
    it('should return true for non-empty strings', () => {
      expect(isValidAgent('chat')).toBe(true);
      expect(isValidAgent('build')).toBe(true);
      expect(isValidAgent('custom-agent')).toBe(true);
    });

    it('should return false for empty/null/undefined', () => {
      expect(isValidAgent(null)).toBe(false);
      expect(isValidAgent(undefined)).toBe(false);
      expect(isValidAgent('')).toBe(false);
      expect(isValidAgent('  ')).toBe(false);
    });
  });

  describe('HEADLESS_SAFE_AGENTS', () => {
    it('should contain build, plan, explore, general', () => {
      expect(HEADLESS_SAFE_AGENTS).toContain('build');
      expect(HEADLESS_SAFE_AGENTS).toContain('plan');
      expect(HEADLESS_SAFE_AGENTS).toContain('explore');
      expect(HEADLESS_SAFE_AGENTS).toContain('general');
    });

    it('should NOT contain chat', () => {
      expect(HEADLESS_SAFE_AGENTS).not.toContain('chat');
    });
  });

  describe('isHeadlessSafe', () => {
    it('should return true for headless-safe agents', () => {
      expect(isHeadlessSafe('build')).toBe(true);
      expect(isHeadlessSafe('plan')).toBe(true);
      expect(isHeadlessSafe('explore')).toBe(true);
      expect(isHeadlessSafe('general')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isHeadlessSafe('Build')).toBe(true);
      expect(isHeadlessSafe('PLAN')).toBe(true);
    });

    it('should return false for chat agent', () => {
      expect(isHeadlessSafe('chat')).toBe(false);
      expect(isHeadlessSafe('Chat')).toBe(false);
    });

    it('should return null for unknown/custom agents', () => {
      expect(isHeadlessSafe('my-custom-agent')).toBeNull();
      expect(isHeadlessSafe('unknown')).toBeNull();
    });

    it('should return null for empty/undefined', () => {
      expect(isHeadlessSafe(null)).toBeNull();
      expect(isHeadlessSafe(undefined)).toBeNull();
      expect(isHeadlessSafe('')).toBeNull();
    });
  });

});
