// Does a seeker's plan cover how they use Plato? Pure, so it is tested on its own.
// "used" = Plato tokens spent so far this billing period; "projected" = that pace carried to the
// period's end. Ran out = 402 "not enough tokens" answers this period.

export type PlanFitInput = {
  plan: string;
  grant: number; // the plan's monthly tokens
  priceUsd: number;
  periodStart: Date;
  periodEnd: Date;
  used: number;
  toppedUp: number; // tokens bought this period
  balance: number;
  ranOut: number;
  now?: Date;
};

export type Verdict = 'unused' | 'enough' | 'tight' | 'short';

export function planFit(i: PlanFitInput) {
  const now = i.now ?? new Date();
  const total = Math.max(1, i.periodEnd.getTime() - i.periodStart.getTime());
  const elapsed = Math.min(
    total,
    Math.max(0, now.getTime() - i.periodStart.getTime()),
  );
  // under a day in, a projection is noise: only what was used counts
  const projected = elapsed >= 86_400_000 ? (i.used / elapsed) * total : i.used;
  const pct = (n: number) =>
    i.grant > 0 ? Math.round((n / i.grant) * 1000) / 10 : null;
  const usedPct = pct(i.used);
  const projectedPct = pct(projected);
  const verdict: Verdict =
    i.ranOut > 0 || i.toppedUp > 0 || (projectedPct ?? 0) > 100
      ? 'short'
      : (projectedPct ?? 0) >= 80
        ? 'tight'
        : i.used <= 0
          ? 'unused'
          : 'enough';
  const advice = {
    short:
      i.ranOut > 0
        ? `Ran out ${i.ranOut} time${i.ranOut === 1 ? '' : 's'} this period: the plan is too small for how they use Plato.`
        : i.toppedUp > 0
          ? 'Bought a top-up this period: the plan alone does not cover them.'
          : 'At this pace they run out before the period ends.',
    tight: 'Close to the limit: at this pace they use most of the grant.',
    enough: 'The plan covers how they use Plato, with room left.',
    unused: 'Nothing spent this period yet.',
  }[verdict];
  return {
    plan: i.plan,
    grant: i.grant,
    priceUsd: i.priceUsd,
    periodStart: i.periodStart,
    periodEnd: i.periodEnd,
    used: Math.round(i.used * 10) / 10,
    toppedUp: Math.round(i.toppedUp * 10) / 10,
    balance: Math.round(i.balance * 10) / 10,
    usedPct,
    projected: Math.round(projected * 10) / 10,
    projectedPct,
    ranOut: i.ranOut,
    daysLeft: Math.max(
      0,
      Math.ceil((i.periodEnd.getTime() - now.getTime()) / 86_400_000),
    ),
    verdict,
    advice,
  };
}
