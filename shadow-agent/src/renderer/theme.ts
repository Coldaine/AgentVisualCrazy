/**
 * Holographic color palette, role colors, and animation constants.
 *
 * Ported from agent-flow (`web/lib/colors.ts`, `web/lib/agent-types.ts`).
 */

import type { AgentNode } from '../shared/schema';

export const COLORS = {
  // Background
  void: '#050510',
  hexGrid: '#0d0d1f',

  // Primary Hologram
  holoBase: '#66ccff',
  holoBright: '#aaeeff',
  holoHot: '#ffffff',

  // Agent States
  idle: '#66ccff',
  thinking: '#66ccff',
  tool_calling: '#ffbb44',
  complete: '#66ffaa',
  error: '#ff5566',
  paused: '#888899',
  waiting_permission: '#ffaa33',

  // Edge / Particle Colors
  dispatch: '#cc88ff',
  return: '#66ffaa',
  tool: '#ffbb44',
  message: '#66ccff',

  // Context breakdown colors
  contextSystem: '#555577',
  contextUser: '#66ccff',
  contextToolResults: '#ffbb44',
  contextReasoning: '#cc88ff',
  contextSubagent: '#66ffaa',

  // UI Chrome
  nodeInterior: 'rgba(10, 15, 40, 0.5)',
  textPrimary: '#aaeeff',
  textDim: '#66ccff90',
  textMuted: '#66ccff50',

  // Glass card
  glassBg: 'rgba(10, 15, 30, 0.7)',
  glassBorder: 'rgba(100, 200, 255, 0.15)',
  glassHighlight: 'rgba(100, 200, 255, 0.08)',

  // Holo background / border opacities
  holoBg03: 'rgba(100, 200, 255, 0.03)',
  holoBg05: 'rgba(100, 200, 255, 0.05)',
  holoBg10: 'rgba(100, 200, 255, 0.1)',
  holoBorder06: 'rgba(100, 200, 255, 0.06)',
  holoBorder08: 'rgba(100, 200, 255, 0.08)',
  holoBorder10: 'rgba(100, 200, 255, 0.1)',
  holoBorder12: 'rgba(100, 200, 255, 0.12)',

  // Panel chrome
  panelBg: 'rgba(8, 12, 24, 0.85)',
  panelSeparator: 'rgba(100, 200, 255, 0.04)',

  // Toggle button states
  toggleActive: 'rgba(100, 200, 255, 0.15)',
  toggleInactive: 'rgba(100, 200, 255, 0.05)',
  toggleBorder: 'rgba(100, 200, 255, 0.1)',

  // Live indicator
  liveDot: '#ff4444',
  liveText: '#ff6666',
  liveResumeBg: 'rgba(255, 68, 68, 0.15)',
  liveResumeBorder: 'rgba(255, 68, 68, 0.35)',

  // Discovery type colors
  discoveryFile: '#66ccff',
  discoveryPattern: '#cc88ff',
  discoveryFinding: '#66ffaa',
  discoveryCode: '#ffbb44',

  // Session tab states
  tabSelectedBg: 'rgba(100, 200, 255, 0.15)',
  tabInactiveBg: 'rgba(100, 200, 255, 0.03)',
  tabSelectedBorder: 'rgba(100, 200, 255, 0.3)',
  tabInactiveBorder: 'rgba(100, 200, 255, 0.08)',
  tabClose: '#ff6688',

  // Role colors (message bubbles)
  roleAssistantBg: 'rgba(80, 160, 220, 0.12)',
  roleAssistantBgSelected: 'rgba(80, 160, 220, 0.2)',
  roleAssistantText: '#a0d4f0',
  roleThinkingBg: 'rgba(140, 100, 200, 0.12)',
  roleThinkingBgSelected: 'rgba(140, 100, 200, 0.2)',
  roleThinkingText: '#c0a0e0',
  roleUserBg: 'rgba(200, 160, 80, 0.12)',
  roleUserBgSelected: 'rgba(200, 160, 80, 0.2)',
  roleUserText: '#e0c888',

  // Result / success
  resultBg: 'rgba(102, 255, 170, 0.05)',
  resultBorder: 'rgba(102, 255, 170, 0.1)',

  // Unread indicator
  unreadDot: '#ff6666',

  // Canvas drawing — card backgrounds
  cardBgDark: 'rgba(5, 5, 16, 0.8)',
  cardBg: 'rgba(10, 15, 30, 0.6)',
  cardBgSelected: 'rgba(10, 15, 30, 0.8)',
  cardBgError: 'rgba(40, 10, 15, 0.8)',
  cardBgSelectedHolo: 'rgba(100, 200, 255, 0.15)',
  cardBgFaintOverlay: 'rgba(0, 0, 0, 0.01)',

  // Canvas drawing — partial rgba bases (alpha appended at draw time)
  bubbleThinkingBase: 'rgba(140, 100, 200,',
  bubbleUserBase: 'rgba(200, 160, 80,',
  bubbleAssistantBase: 'rgba(80, 160, 220,',
  toolCardErrorBase: 'rgba(40, 10, 15,',
  toolCardSelectedBase: 'rgba(100, 200, 255,',
  toolCardBase: 'rgba(10, 15, 30,',

  // Cost labels
  costText: '#66ffaa',
  costTextDim: '#66ffaa80',
  costPillBg: 'rgba(10, 20, 40, 0.75)',
  costPillStroke: 'rgba(102, 255, 170, 0.3)',

  // Cost panel bar fills
  barFillMain: 'rgba(102, 204, 255, 0.15)',
  barFillSub: 'rgba(204, 136, 255, 0.15)',

  // Transcript / message feed
  userMsgBg: 'rgba(255, 187, 68, 0.06)',
  userMsgBorder: 'rgba(255, 187, 68, 0.12)',
  userLabel: '#ffbb4490',
  userText: '#ffcc66',
  assistantLabel: '#66ccff80',
  assistantText: '#aaeeff',
  thinkingBgExpanded: 'rgba(180, 140, 255, 0.06)',
  thinkingBgCollapsed: 'rgba(180, 140, 255, 0.03)',
  thinkingBorder: 'rgba(180, 140, 255, 0.08)',
  thinkingLabel: '#bb99ff70',
  thinkingArrow: '#bb99ff55',
  thinkingPreview: '#bb99ff',
  thinkingTextExpanded: '#bb99ff80',
  thinkingBorderLeft: 'rgba(180, 140, 255, 0.15)',
  toolCallBg: 'rgba(255, 187, 68, 0.05)',
  toolCallBorder: 'rgba(255, 187, 68, 0.1)',
  bashResultBg: 'rgba(0,0,0,0.25)',
  toolResultBg: 'rgba(102, 255, 170, 0.04)',
  bashResultBorder: 'rgba(255, 187, 68, 0.1)',
  toolResultBorder: 'rgba(102, 255, 170, 0.08)',
  bashResultText: '#aaeeff80',
  toolResultText: '#66ffaa80',
  textFaint: '#aaeeff60',
  searchHighlightBg: 'rgba(255,187,68,0.3)',

  // Diff / code blocks
  codeBlockBg: 'rgba(0,0,0,0.3)',
  diffRemoved: '#ff6666',
  diffRemovedBg: 'rgba(255,80,80,0.08)',
  diffAdded: '#66ff88',
  diffAddedBg: 'rgba(80,255,120,0.08)',

  // Tool content
  filePathActive: '#66ccff',
  filePathInactive: '#66ccff90',
  todoCompleted: '#66ffaa',
  todoCompletedText: '#66ffaa90',
  todoPending: '#66ccff60',
  contentDim: '#aaeeff90',
  searchIcon: '#66ccff60',

  // Panel header / chrome text
  panelLabel: '#66ccff90',
  panelLabelDim: '#66ccff65',
  scrollBtnText: '#66ccff',
  scrollbarThumb: 'rgba(100,200,255,0.15)',
} as const;

export const ROLE_COLORS: Record<
  'assistant' | 'thinking' | 'user',
  { bg: string; bgSelected: string; text: string; label: string }
> = {
  assistant: {
    bg: COLORS.roleAssistantBg,
    bgSelected: COLORS.roleAssistantBgSelected,
    text: COLORS.roleAssistantText,
    label: 'CLAUDE'
  },
  thinking: {
    bg: COLORS.roleThinkingBg,
    bgSelected: COLORS.roleThinkingBgSelected,
    text: COLORS.roleThinkingText,
    label: 'THINKING'
  },
  user: {
    bg: COLORS.roleUserBg,
    bgSelected: COLORS.roleUserBgSelected,
    text: COLORS.roleUserText,
    label: 'USER'
  }
};

export function getStateColor(state: AgentNode['state']): string {
  switch (state) {
    case 'active':
      return COLORS.thinking;
    case 'completed':
      return COLORS.complete;
    case 'idle':
    default:
      return COLORS.idle;
  }
}

export function withAlpha(rgbaBase: string, alpha: number): string {
  return `${rgbaBase} ${alpha})`;
}

// ─── Animation timing constants (ported from agent-flow) ────────────────────

export const TIMING = {
  controlBarHideMs: 3000,
  glassAnimMs: 200,
  contextMenuDelayMs: 50,
  chatFocusDelayMs: 300,
  autoPlayDelayMs: 500,
  resumeLiveDelayMs: 20,
  seekCompleteDelayMs: 50,
  livePulseMs: 1000
} as const;

export const ANIM = {
  inertiaDecay: 0.94,
  inertiaThreshold: 0.5,
  dragLerp: 0.25,
  autoFitLerp: 0.06,
  dragThresholdPx: 5,
  viewportPadding: 120,
  breathe: {
    thinkingSpeed: 2,
    thinkingAmp: 0.03,
    idleSpeed: 0.7,
    idleAmp: 0.015
  },
  scanline: { thinking: 40, normal: 15 },
  orbitSpeed: 1.5,
  pulseSpeed: 4
} as const;

export const FX = {
  spawnDuration: 0.8,
  completeDuration: 1.0,
  shatterDuration: 0.8,
  shatterCount: 12,
  shatterSpeed: { min: 30, range: 60 },
  shatterSize: { min: 1, range: 2 },
  trailSegments: 8
} as const;

export const BEAM = {
  curvature: 0.15,
  cp1: 0.33,
  cp2: 0.66,
  segments: 16,
  parentChild: { startW: 3, endW: 1 },
  tool: { startW: 1.5, endW: 0.5 },
  glowExtra: { startW: 3, endW: 1, alpha: 0.08 },
  idleAlpha: 0.08,
  activeAlpha: 0.3,
  wobble: { amp: 3, freq: 10, timeFreq: 3, trailOffset: 0.15 }
} as const;

// ─── Visibility threshold ──────────────────────────────────────────────────

export const MIN_VISIBLE_OPACITY = 0.05;
