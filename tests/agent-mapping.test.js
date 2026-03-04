/**
 * Agent Mapping Tests
 *
 * Tests for agent name mapping, validation, and the custom chat agent default.
 */

const {
  PRIMARY_AGENTS,
  mapAgentToOpenCode,
  isValidAgent,
  isValidSubagent,
  normalizeSubagent
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

  describe('isValidSubagent', () => {
    it('should accept General and Explore', () => {
      expect(isValidSubagent('General')).toBe(true);
      expect(isValidSubagent('Explore')).toBe(true);
    });

    it('should reject primary agents', () => {
      expect(isValidSubagent('chat')).toBe(false);
      expect(isValidSubagent('build')).toBe(false);
      expect(isValidSubagent('plan')).toBe(false);
    });
  });

  describe('normalizeSubagent', () => {
    it('should normalize valid subagent names', () => {
      expect(normalizeSubagent('General')).toBe('general');
      expect(normalizeSubagent('EXPLORE')).toBe('explore');
    });

    it('should return null for invalid names', () => {
      expect(normalizeSubagent('chat')).toBeNull();
      expect(normalizeSubagent(null)).toBeNull();
    });
  });
});
