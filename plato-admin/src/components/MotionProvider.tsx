import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';

const features = () => import('../lib/motion-features').then((m) => m.default);

/**
 * Motion for the whole panel: the animation engine loads after first paint (LazyMotion + `m.*`
 * components, `strict` so a stray `motion.*` fails loudly), and every animation honours the
 * OS "reduce motion" setting.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={features} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
