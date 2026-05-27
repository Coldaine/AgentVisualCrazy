import { animated, useSpring } from '@react-spring/web';
import type { ElementType } from 'react';

export interface MotionAdapter {
  readonly id: string;
  readonly AnimatedAside: ElementType;
  readonly AnimatedDiv: ElementType;
  readonly useSpring: typeof useSpring;
}

const reactSpringMotionAdapter: MotionAdapter = {
  id: 'react-spring-motion',
  AnimatedAside: animated.aside as ElementType,
  AnimatedDiv: animated.div as ElementType,
  useSpring
};

export function getMotionAdapter(): MotionAdapter {
  return reactSpringMotionAdapter;
}

export const AnimatedAside = reactSpringMotionAdapter.AnimatedAside;
export const AnimatedDiv = reactSpringMotionAdapter.AnimatedDiv;
export const useMotionSpring = reactSpringMotionAdapter.useSpring;
