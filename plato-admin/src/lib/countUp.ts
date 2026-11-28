// What CountUp can animate: a formatted number with an optional "$" / "-" in front, thousands
// separators, decimals and a "%" after ("1,612", "$93.53", "-$4.20", "21%", "10,465.3").
// Anything else ("80 / 56 / 61", "—", "max") is shown as is.
export type Countable = { to: number; prefix: string; suffix: string; decimals: number };

export function parseCountable(v: unknown): Countable | null {
  if (typeof v === 'number') return Number.isFinite(v) ? { to: v, prefix: '', suffix: '', decimals: 0 } : null;
  if (typeof v !== 'string') return null;
  const m = /^(-?)(\$?)(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d+))?(%?)$/.exec(v.trim());
  if (!m) return null;
  const [, minus, dollar, int, frac = '', pct] = m;
  const n = Number(`${int.replace(/,/g, '')}.${frac || '0'}`);
  return { to: minus ? -n : n, prefix: dollar, suffix: pct, decimals: frac.length };
}

/** `n` written the way the original value was: same prefix, separators, decimals and suffix. */
export function formatCountable(n: number, c: Countable): string {
  const body = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals });
  return `${n < 0 ? '-' : ''}${c.prefix}${body}${c.suffix}`;
}

/** Fast at first, settling at the end (close to the seeker app's [0.16, 1, 0.3, 1]). */
export const easeOutQuart = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 4;
};
