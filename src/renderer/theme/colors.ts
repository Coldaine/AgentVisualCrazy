export const colors = {
  // Canvas palette (cold, holographic)
  void:        '#050510',
  hexGrid:     '#0d0d1f',
  holoBase:    '#66ccff',
  holoBright:  '#aaeeff',
  holoHot:     '#ffffff',

  // Agent state colors
  stateIdle:     '#66ccff',
  stateThinking: '#66ccff',
  stateTool:     '#ffbb44',
  stateComplete: '#66ffaa',
  stateError:    '#ff5566',
  statePaused:   '#888899',
  stateWaiting:  '#ffaa33',
  stateSubagent: '#cc88ff',

  // Risk signal colors
  riskLow:      '#66ffaa',
  riskMedium:   '#ffbb44',
  riskHigh:     '#ff5566',
  riskCritical: '#ff2244',

  // Control palette (warm)
  surface:        '#2D2B2A',
  surfaceRaised:  '#3A3836',
  textPrimary:    '#E8E0D8',
  textSecondary:  '#888380',
  accent:         '#D97757',
  accentHover:    '#E89070',
  border:         '#4A4744',

  // Glass effects
  glassBg:     'rgba(10, 15, 30, 0.7)',
  glassBorder: 'rgba(100, 200, 255, 0.15)',
  glassBlur:   '20px',
  glassGlow:   'rgba(100, 200, 255, 0.08)',

  // Holo border opacities (mirror CSS --holo-border-* vars)
  holoBorder06: 'rgba(100, 200, 255, 0.06)',
  holoBorder08: 'rgba(100, 200, 255, 0.08)',
  holoBorder10: 'rgba(100, 200, 255, 0.10)',
  holoBorder12: 'rgba(100, 200, 255, 0.12)',

  // Edge / particle accents
  edgeDispatch: 'rgba(204, 136, 255, 1)',
  edgeReturn:   'rgba(102, 255, 170, 1)',
} as const;

export type ColorKey = keyof typeof colors;