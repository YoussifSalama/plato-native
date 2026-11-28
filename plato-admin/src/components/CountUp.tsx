import { useEffect, useRef, type ReactNode } from 'react';
import { easeOutQuart, formatCountable, parseCountable } from '../lib/countUp';
import { prefersReducedMotion } from '../lib/motion';

const DURATION_MS = 900;

/**
 * Counts a stat up when it appears, and from the old value to the new one when it changes
 * (a new date range). Numbers animate; anything else renders as is. Reduced motion, a hidden
 * tab or a server render show the final value at once. Writes text directly: no re-renders.
 */
export function CountUp({ value }: { value: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const c = parseCountable(value);
  const key = c ? `${c.prefix}|${c.to}|${c.decimals}|${c.suffix}` : null;

  useEffect(() => {
    const el = ref.current;
    if (!el || !c) return;
    const from = shown.current;
    if (prefersReducedMotion() || document.hidden || from === c.to) {
      shown.current = c.to;
      el.textContent = formatCountable(c.to, c);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // a frame's timestamp can be a little before `start`: clamp, or the first frame goes negative
      const t = Math.min(1, Math.max(0, (now - start) / DURATION_MS));
      shown.current = from + (c.to - from) * easeOutQuart(t);
      el.textContent = formatCountable(t === 1 ? c.to : shown.current, c);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key carries everything c holds
  }, [key]);

  if (!c) return <>{value}</>;
  // Screen readers get the final value once; the visible text animates.
  return (
    <>
      <span className="sr-only">{formatCountable(c.to, c)}</span>
      <span ref={ref} aria-hidden>
        {formatCountable(prefersReducedMotion() ? c.to : shown.current, c)}
      </span>
    </>
  );
}
