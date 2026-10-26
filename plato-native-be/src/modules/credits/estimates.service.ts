import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PLANS, planOf, TOPUPS } from './credit-prices';
import { CreditsService } from './credits.service';
import { buildEstimates } from './estimates';

// The seeker's tokens and what things cost, as the API and both assistants see
// them. This is the only view of pricing that leaves the server, so it holds no
// money costs, rates, models, providers or formulas (see estimates.ts).
@Injectable()
export class CreditsEstimatesService {
  // Average real charge per feature over 30 days, refreshed at most every 10
  // minutes; a feature with fewer than 5 charges uses the action's starting figure.
  private cache: { at: number; avg: Map<string, number> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
  ) {}

  private async averages() {
    if (this.cache && Date.now() - this.cache.at < 10 * 60_000)
      return this.cache.avg;
    const rows = await this.prisma.creditLedger.groupBy({
      by: ['feature'],
      where: {
        kind: 'consume',
        created_at: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
      _avg: { amount: true },
      _count: { _all: true },
    });
    const avg = new Map<string, number>();
    for (const r of rows)
      if (r.feature && r._count._all >= 5)
        avg.set(r.feature, -(r._avg.amount ?? 0));
    this.cache = { at: Date.now(), avg };
    return avg;
  }

  async summary(userId: string) {
    const [acc, avg] = await Promise.all([
      this.credits.account(userId),
      this.averages(),
    ]);
    return {
      plan: planOf(acc.plan).label,
      balance: Math.max(0, Math.floor(acc.balance)),
      // bought tokens left in the balance (spent last, never expire)
      boughtTokensLeft: Math.floor(
        Math.max(0, Math.min(acc.topup ?? 0, acc.balance)),
      ),
      monthly: planOf(acc.plan).monthly,
      refillsOn: acc.period_end.toISOString().slice(0, 10),
      estimates: buildEstimates(avg),
      plans: Object.values(PLANS).map((p) => ({
        name: p.label,
        tokensPerMonth: p.monthly,
        priceUsdPerMonth: p.priceUsd,
      })),
      topUps: Object.values(TOPUPS).map((t) => ({
        name: t.label,
        tokens: t.tokens,
        priceUsd: t.priceUsd,
        expires: false,
      })),
    };
  }
}
