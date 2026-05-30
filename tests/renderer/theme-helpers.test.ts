import { describe, expect, it } from 'vitest';
import { colors } from '../../src/renderer/theme/colors';
import { getStateColor, withAlpha } from '../../src/renderer/theme/helpers';
import { TIMING } from '../../src/renderer/theme/timing';

describe('theme helpers', () => {
  it('withAlpha appends alpha to partial rgba bases', () => {
    expect(withAlpha('rgba(80, 160, 220,', 0.5)).toBe('rgba(80, 160, 220, 0.5)');
  });

  it('withAlpha rejects non-partial bases', () => {
    expect(() => withAlpha('#66ccff', 0.5)).toThrow(/partial rgba/);
  });

  it('getStateColor maps agent node states', () => {
    expect(getStateColor('active')).toBe(colors.stateThinking);
    expect(getStateColor('completed')).toBe(colors.stateComplete);
    expect(getStateColor('idle')).toBe(colors.stateIdle);
  });

  it('TIMING.glassAnimMs matches glass card transition', () => {
    expect(TIMING.glassAnimMs).toBe(200);
  });
});
