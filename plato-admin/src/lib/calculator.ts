import type { CalculatorData } from './types';

export type CalcInput = {
  /** Monthly price the seeker pays, USD. */
  priceUsd: number;
  /** Monthly token grant. */
  tokens: number;
  /** Plans whose usage we compare against (keys from the calculator data). Empty = all paid plans with users. */
  compareKeys?: string[];
  /** Fixed monthly cost to cover for break-even, USD (optional). */
  fixedMonthlyUsd?: number;
};

export type Margin = { costUsd: number; marginUsd: number; marginPct: number | null };

export type CalcResult = {
  fullCost: Margin;
  /** Share of the grant a comparable seeker uses (avg / p90 of the comparable plans), 0..1. */
  avgShare: number | null;
  p90Share: number | null;
  avgCost: Margin | null;
  p90Cost: Margin | null;
  /** Users needed to cover `fixedMonthlyUsd` at the avg margin; null when it can't be covered. */
  breakEvenUsers: number | null;
  buys: { feature: string; count: number; avgTokensPerEvent: number }[];
};

const margin = (price: number, cost: number): Margin => ({
  costUsd: cost,
  marginUsd: price - cost,
  marginPct: price > 0 ? (price - cost) / price : null,
});

/**
 * The plans page's live calculator. Usage of comparable plans is read as a share of their
 * own grant (a Pro seeker using 3,500 of 7,000 = 50%), then applied to the new grant T.
 */
export function calculate(
  data: Pick<CalculatorData, 'usdPerToken' | 'plans' | 'perFeature'>,
  grants: Record<string, number>,
  input: CalcInput,
): CalcResult {
  const P = Math.max(0, input.priceUsd || 0);
  const T = Math.max(0, input.tokens || 0);
  const rate = data.usdPerToken;

  const pool = data.plans.filter(
    (p) =>
      p.users > 0 &&
      (grants[p.key] ?? 0) > 0 &&
      (input.compareKeys?.length ? input.compareKeys.includes(p.key) : true),
  );
  const users = pool.reduce((s, p) => s + p.users, 0);
  // user-weighted mean of each plan's usage share
  const share = (pick: (p: (typeof pool)[number]) => number) =>
    users > 0 ? Math.min(1, pool.reduce((s, p) => s + (pick(p) / grants[p.key]) * p.users, 0) / users) : null;
  const avgShare = share((p) => p.avgTokensUsed);
  const p90Share = share((p) => p.p90TokensUsed);

  const avgCost = avgShare === null ? null : margin(P, T * avgShare * rate);
  const p90Cost = p90Share === null ? null : margin(P, T * p90Share * rate);

  const fixed = input.fixedMonthlyUsd ?? 0;
  const perUser = avgCost?.marginUsd ?? null;
  const breakEvenUsers = fixed > 0 && perUser !== null && perUser > 0 ? Math.ceil(fixed / perUser) : null;

  const buys = data.perFeature
    .filter((f) => f.avgTokensPerEvent > 0)
    .map((f) => ({ feature: f.feature, avgTokensPerEvent: f.avgTokensPerEvent, count: Math.floor(T / f.avgTokensPerEvent) }))
    .sort((a, b) => a.avgTokensPerEvent - b.avgTokensPerEvent);

  return { fullCost: margin(P, T * rate), avgShare, p90Share, avgCost, p90Cost, breakEvenUsers, buys };
}
