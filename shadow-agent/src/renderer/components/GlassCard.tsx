import { cva, type VariantProps } from 'class-variance-authority';

/**
 * GlassCard — glass-morphism card with backdrop blur.
 *
 * Variants:
 *   size   — sm | md | lg  (controls padding + radius)
 *   glow   — none | subtle | bright  (outer glow intensity)
 *   slide  — none | left | right | bottom  (entry direction, for animation)
 */
const glassCVA = cva('glass-card', {
  variants: {
    size: {
      sm:  'glass-card--sm',
      md:  'glass-card--md',
      lg:  'glass-card--lg',
    },
    glow: {
      none:    '',
      subtle:  'glass-card--glow-subtle',
      bright:  'glass-card--glow-bright',
    },
    slide: {
      none:    '',
      left:    'glass-card--slide-left',
      right:   'glass-card--slide-right',
      bottom:  'glass-card--slide-bottom',
    },
  },
  defaultVariants: {
    size:  'md',
    glow:  'none',
    slide: 'none',
  },
});

export type GlassCardVariant = VariantProps<typeof glassCVA>;

export { glassCVA };
