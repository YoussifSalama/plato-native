import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  APIFY_PRICES,
  FEATURE_LABELS,
  PLANS,
  planOf,
  toTokens,
  VOICE_USD_PER_MINUTE,
} from './credit-prices';
import { creditAccount } from './credits';

const shown = (n: number) => Math.round(n * 10) / 10;

// The seeker's Plato tokens. Never returns dollars: the cost behind a token
// stays internal (/admin/usage).
@Controller('job-seeker/credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Balance, plan, reset date and the latest movements. */
  @Get()
  async get(@Req() req: AuthenticatedRequest, @Query('limit') limit = '20') {
    const acc = await creditAccount(req.userId);
    const rows = await this.prisma.creditLedger.findMany({
      where: { user_id: req.userId },
      orderBy: { created_at: 'desc' },
      take: Math.min(Math.max(Number(limit) || 20, 1), 100),
    });
    return {
      plan: acc.plan,
      balance: shown(acc.balance),
      monthly: planOf(acc.plan).monthly,
      periodStart: acc.period_start,
      resetsAt: acc.period_end,
      history: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        amount: shown(r.amount),
        balanceAfter: shown(r.balance_after),
        feature: r.feature,
        label: r.feature
          ? (FEATURE_LABELS[r.feature] ?? r.feature)
          : r.kind === 'grant'
            ? 'Monthly tokens'
            : r.kind,
        at: r.created_at,
      })),
    };
  }

  /** What things cost in tokens, to show before the seeker spends them. */
  @Get('prices')
  async prices() {
    // the average real charge per call over the last 30 days, across seekers
    const since = new Date(Date.now() - 30 * 86_400_000);
    const rows = await this.prisma.creditLedger.groupBy({
      by: ['feature'],
      where: { kind: 'consume', created_at: { gte: since } },
      _avg: { amount: true },
      _count: { _all: true },
    });
    return {
      plans: PLANS,
      voicePerMinute: toTokens(VOICE_USD_PER_MINUTE),
      features: rows
        .filter((r) => r.feature)
        .map((r) => ({
          feature: r.feature,
          label: FEATURE_LABELS[r.feature!] ?? r.feature,
          average: shown(-(r._avg.amount ?? 0)),
          calls: r._count._all,
        })),
      boards: Object.values(APIFY_PRICES).map((p) => ({
        label: p.label,
        perResult: toTokens(p.perResult),
        perRun: toTokens(p.perRun), // the board's start fee, once per search
      })),
    };
  }
}
