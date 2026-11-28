import type { Transition } from 'motion/react';

// One motion vocabulary, the seeker app's (plato-job-seeker-native-fe/lib/motion-system.ts):
// primary events spring, secondary ease, micro events stay near-instant.
export const spring = {
  enter: { type: 'spring', stiffness: 260, damping: 26, mass: 0.9 } satisfies Transition,
  settle: { type: 'spring', stiffness: 180, damping: 24 } satisfies Transition,
  micro: { type: 'spring', stiffness: 500, damping: 30 } satisfies Transition,
};

export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
};

/** True when the person asked the OS for less motion (read once per call; cheap). */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
