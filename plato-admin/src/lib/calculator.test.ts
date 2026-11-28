import { describe, expect, it } from 'vitest';
import { calculate } from './calculator';

const data = {
  usdPerToken: 0.001,
  plans: [
    { key: 'free', users: 100, avgTokensUsed: 500, p50TokensUsed: 400, p90TokensUsed: 1000, avgCostUsd: 0.5 },
    { key: 'pro', users: 10, avgTokensUsed: 3500, p50TokensUsed: 3000, p90TokensUsed: 6300, avgCostUsd: 3.5 },
  ],
  perFeature: [
    { feature: 'chat.message', avgTokensPerEvent: 1, avgCostUsdPerEvent: 0.001 },
    { feature: 'apply.job', avgTokensPerEvent: 25, avgCostUsdPerEvent: 0.025 },
    { feature: 'broken', avgTokensPerEvent: 0, avgCostUsdPerEvent: 0 },
  ],
};
const grants = { free: 1000, pro: 7000 };

describe('calculate', () => {
  it('prices a grant fully used, at avg and p90 usage of the comparable plan', () => {
    const r = calculate(data, grants, { priceUsd: 19, tokens: 7000, compareKeys: ['pro'] });
    expect(r.fullCost.costUsd).toBeCloseTo(7);
    expect(r.fullCost.marginUsd).toBeCloseTo(12);
    expect(r.fullCost.marginPct).toBeCloseTo(12 / 19);
    expect(r.avgShare).toBeCloseTo(0.5);
    expect(r.avgCost!.costUsd).toBeCloseTo(3.5);
    expect(r.p90Cost!.costUsd).toBeCloseTo(6.3);
  });

  it('weights usage share by users across plans and caps it at the grant', () => {
    const r = calculate(data, grants, { priceUsd: 10, tokens: 2000 });
    // (0.5*100 + 0.5*10) / 110 = 0.5
    expect(r.avgShare).toBeCloseTo(0.5);
    // (1*100 + 0.9*10) / 110
    expect(r.p90Share).toBeCloseTo(109 / 110);
  });

  it('counts what T tokens buy per feature, skipping zero-cost features', () => {
    const r = calculate(data, grants, { priceUsd: 0, tokens: 1000 });
    expect(r.buys).toEqual([
      { feature: 'chat.message', avgTokensPerEvent: 1, count: 1000 },
      { feature: 'apply.job', avgTokensPerEvent: 25, count: 40 },
    ]);
    expect(r.fullCost.marginPct).toBeNull();
  });

  it('break-even users from a fixed cost and the avg margin', () => {
    const r = calculate(data, grants, { priceUsd: 19, tokens: 7000, compareKeys: ['pro'], fixedMonthlyUsd: 155 });
    // margin at avg = 19 - 3.5 = 15.5 → 10 users
    expect(r.breakEvenUsers).toBe(10);
  });

  it('no comparable usage → no avg/p90 numbers', () => {
    const r = calculate(data, grants, { priceUsd: 5, tokens: 100, compareKeys: ['max'] });
    expect(r.avgCost).toBeNull();
    expect(r.breakEvenUsers).toBeNull();
  });
});
