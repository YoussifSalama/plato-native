import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard, AdminPage } from '../admin/admin-auth.guard';
import { planOf } from '../credits/credit-prices';
import { PrismaService } from '../prisma/prisma.service';
import { parseRange, round } from '../usage/usage-stats';
import {
  AdminInsightsService,
  change,
  previousRange,
} from './admin-insights.service';

const DAY = 86_400_000;

// Admin panel, Dashboard: the period's numbers against the period before, the daily trend, the
// signup funnel, the costliest seekers, retention, and what needs the owner's attention.
@Controller('admin')
@UseGuards(AdminGuard)
@AdminPage('dashboard')
export class AdminOverviewController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly insights: AdminInsightsService,
  ) {}

  @Get('overview')
  async overview(@Query('from') from?: string, @Query('to') to?: string) {
    const range = parseRange(from, to);
    const prev = previousRange(range);
    const now = new Date();
    const [
      cur,
      before,
      total,
      verified,
      blocked,
      paid,
      byDay,
      funnel,
      topUsers,
    ] = await Promise.all([
      this.insights.period(range),
      this.insights.period(prev),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { email_verified_at: { not: null } } }),
      this.prisma.user.count({ where: { blocked_at: { not: null } } }),
      this.prisma.creditAccount.groupBy({
        by: ['plan'],
        where: {
          plan: { not: 'free' },
          OR: [{ paid_until: null }, { paid_until: { gt: now } }],
        },
        _count: { _all: true },
      }),
      this.insights.byDay(range),
      this.insights.funnel(range),
      this.insights.topUsers(range),
    ]);
    const days = Math.max(1, (range.to.getTime() - range.from.getTime()) / DAY);
    return {
      users: {
        total,
        new: cur.signups,
        verified,
        blocked,
        activeInRange: cur.active,
      },
      // No payment provider yet: paid plans are set by hand in Credits. This is what those plans
      // are priced at per month, not money received.
      revenue: {
        plansMonthlyUsd: round(
          paid.reduce(
            (s, p) => s + (planOf(p.plan).priceUsd ?? 0) * p._count._all,
            0,
          ),
          2,
        ),
        paidUsers: paid.reduce((s, p) => s + p._count._all, 0),
        paymentsConnected: !!process.env.PAYMENTS_PROVIDER,
      },
      costUsd: cur.costUsd,
      // the range's cost scaled to 30 days, comparable with a monthly price
      costMonthlyRunRateUsd: round((cur.costUsd / days) * 30, 2),
      byProvider: cur.byProvider,
      applications: cur.applications,
      errors: cur.errors,
      perActiveUser: cur.perActiveUser,
      searches: cur.searches,
      // the same length of time just before, and the change (0.12 = +12%)
      previous: { from: prev.from, to: prev.to, ...before },
      changes: {
        signups: change(cur.signups, before.signups),
        active: change(cur.active, before.active),
        costUsd: change(cur.costUsd, before.costUsd),
        searches: change(cur.searches.total, before.searches.total),
        avgSearchCostUsd: change(
          cur.searches.avgCostUsd,
          before.searches.avgCostUsd,
        ),
        avgSearchSec: change(
          cur.searches.avgDurationSec,
          before.searches.avgDurationSec,
        ),
        costPerActiveUser: change(
          cur.perActiveUser.costUsd,
          before.perActiveUser.costUsd,
        ),
        applications: change(cur.applications.total, before.applications.total),
        serverErrors: change(cur.errors.server, before.errors.server),
      },
      byDay,
      funnel,
      topUsers,
    };
  }

  /** What needs a look now: error spikes, stuck searches, spend jumps, loss-making seekers, ran out of tokens. */
  @Get('attention')
  attention() {
    return this.insights.attention();
  }

  /** Signup-week cohorts and the share of each active in the weeks after. */
  @Get('retention')
  retention(@Query('weeks') weeks?: string) {
    return this.insights.retention(
      Math.min(12, Math.max(4, Number(weeks) || 8)),
    );
  }
}
