import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PLANS, USD_PER_TOKEN } from './credit-prices';

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
type Line = { costUsd: number; calls: number; tokens: number };
const blank = (): Line => ({ costUsd: 0, calls: 0, tokens: 0 });

// Internal margin view: what we paid (usage_events) against the tokens charged
// (credit_ledger), per feature and for the top seekers by cost. Admin only.
@Injectable()
export class CreditsReportService {
  constructor(private readonly prisma: PrismaService) {}

  async report(days: number) {
    const n = Math.min(days || 30, 365);
    const since = new Date(Date.now() - n * 86_400_000);
    const [usage, consumed] = await Promise.all([
      this.prisma.usageEvent.findMany({
        where: { created_at: { gte: since } },
        select: { feature: true, user_id: true, cost_usd: true },
        take: 50000,
      }),
      this.prisma.creditLedger.findMany({
        where: { kind: 'consume', created_at: { gte: since } },
        select: { feature: true, user_id: true, amount: true },
        take: 50000,
      }),
    ]);
    const byFeature = new Map<string, Line>();
    const byUser = new Map<string, Line>();
    let unattributedUsd = 0;
    for (const u of usage) {
      const f = byFeature.get(u.feature) ?? blank();
      f.costUsd += u.cost_usd ?? 0;
      f.calls++;
      byFeature.set(u.feature, f);
      if (!u.user_id) unattributedUsd += u.cost_usd ?? 0;
      else {
        const l = byUser.get(u.user_id) ?? blank();
        l.costUsd += u.cost_usd ?? 0;
        l.calls++;
        byUser.set(u.user_id, l);
      }
    }
    for (const c of consumed) {
      const f = byFeature.get(c.feature ?? '?') ?? blank();
      f.tokens += -c.amount;
      byFeature.set(c.feature ?? '?', f);
      const l = byUser.get(c.user_id) ?? blank();
      l.tokens += -c.amount;
      byUser.set(c.user_id, l);
    }
    // tokens are priced at cost: charged x USD_PER_TOKEN vs what we paid shows
    // what the rates miss (exempt auto apply, unpriced models, board price gaps)
    const line = (l: Line) => ({
      calls: l.calls,
      costUsd: round(l.costUsd),
      tokens: round(l.tokens, 1),
      tokensAtCostUsd: round(l.tokens * USD_PER_TOKEN),
    });
    const topUsers = [...byUser.entries()]
      .sort((a, b) => b[1].costUsd - a[1].costUsd)
      .slice(0, 50);
    const [users, accounts] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: topUsers.map(([id]) => id) } },
        select: { id: true, email: true },
      }),
      this.prisma.creditAccount.findMany({
        where: { user_id: { in: topUsers.map(([id]) => id) } },
        select: { user_id: true, plan: true, balance: true },
      }),
    ]);
    const email = new Map(users.map((u) => [u.id, u.email]));
    const account = new Map(accounts.map((a) => [a.user_id, a]));
    return {
      days: n,
      usdPerToken: USD_PER_TOKEN,
      plans: PLANS,
      unattributedCostUsd: round(unattributedUsd),
      features: [...byFeature.entries()]
        .map(([feature, l]) => ({ feature, ...line(l) }))
        .sort((a, b) => b.costUsd - a.costUsd),
      users: topUsers.map(([id, l]) => {
        const a = account.get(id);
        return {
          userId: id,
          email: email.get(id) ?? null,
          plan: a?.plan ?? null,
          balance: a ? round(a.balance, 1) : null,
          ...line(l),
        };
      }),
    };
  }
}
