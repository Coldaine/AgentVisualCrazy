import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { TIMING } from '../theme/timing';

/**
 * GlassCard — glass-morphism card with backdrop blur and mount animation.
 */
const glassCVA = cva('glass-card', {
  variants: {
    size: {
      sm: 'glass-card--sm',
      md: 'glass-card--md',
      lg: 'glass-card--lg',
    },
    glow: {
      none: '',
      subtle: 'glass-card--glow-subtle',
      bright: 'glass-card--glow-bright',
    },
    slide: {
      none: '',
      left: 'glass-card--slide-left',
      right: 'glass-card--slide-right',
      bottom: 'glass-card--slide-bottom',
    },
  },
  defaultVariants: {
    size: 'md',
    glow: 'none',
    slide: 'none',
  },
});

export type GlassCardVariant = VariantProps<typeof glassCVA>;

export interface GlassCardProps extends GlassCardVariant {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  visible?: boolean;
}

export function GlassCard({
  children,
  className = '',
  style,
  visible = true,
  size,
  glow,
  slide,
}: GlassCardProps) {
  const [mounted, setMounted] = useState(visible);
  const [animating, setAnimating] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setAnimating(true);
      });
      return () => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
    }

    setAnimating(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const timer = setTimeout(() => setMounted(false), TIMING.glassAnimMs);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!mounted) {
    return null;
  }

  const transitionMs = TIMING.glassAnimMs;

  return (
    <div
      className={glassCVA({ size, glow, slide, className })}
      style={{
        ...style,
        opacity: animating ? 1 : 0,
        transform: animating ? 'scale(1)' : 'scale(0.95)',
        transition: `opacity ${transitionMs}ms ease-out, transform ${transitionMs}ms ease-out`,
      }}
    >
      {children}
    </div>
  );
}

export { glassCVA };
