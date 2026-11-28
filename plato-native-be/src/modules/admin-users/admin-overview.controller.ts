import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard, AdminPage } from '../admin/admin-auth.guard';
import { planOf } from '../credits/credit-prices';
import { PrismaService } from '../prisma/prisma.service';
import { parseRange, round, sumBy, usageGroups } from '../usage/usage-stats';
import { AdminUsersService } from './admin-users.service';

// Admin panel, Dashboard: one look at users, cost, revenue, applications and errors.
@Controller('admin/overview')
@UseGuards(AdminGuard)
@AdminPage('dashboard')
export class AdminOverviewController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: AdminUsersService,
  ) {}

  @Get()
  async overview(@Query('from') from?: string, @Query('to') to?: string) {
    const range = parseRange(from, to);
    const inRange = { gte: range.from, lt: range.to };
    const now = new Date();
    const [
      total,
      fresh,
      verified,
      blocked,
      activeInRange,
      usage,
      paid,
      apps,
      submitted,
      failed,
      errors,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { created_at: inRange } }),
      this.prisma.user.count({ where: { email_verified_at: { not: null } } }),
      this.prisma.user.count({ where: { blocked_at: { not: null } } }),
      this.users.activeUsers(range),
      usageGroups(this.prisma, range, []),
      // ponytail: no payments yet, so revenue = paid plans set by hand that are still running
      this.prisma.creditAccount.groupBy({
        by: ['plan'],
        where: { plan: { not: 'free' }, OR: [{ paid_until: null }, { paid_until: { gt: now } }] },
        _count: { _all: true },
      }),
      this.prisma.jobApplication.count({ where: { created_at: inRange } }),
      this.prisma.jobApplication.count({ where: { status: 'SUBMITTED', created_at: inRange } }),
      this.prisma.jobApplication.count({ where: { status: 'FAILED', created_at: inRange } }),
      this.prisma.errorLog.groupBy({
        by: ['platform'],
        where: { created_at: inRange },
        _count: { _all: true },
      }),
    ]);
    const platform = { web: 0, extension: 0, api: 0 };
    for (const e of errors)
      if (e.platform in platform) platform[e.platform as keyof typeof platform] = e._count._all;
    return {
      users: { total, new: fresh, verified, blocked, activeInRange },
      costUsd: round(usage.reduce((s, r) => s + r.costUsd, 0)),
      revenueUsdMonthly: round(
        paid.reduce((s, p) => s + (planOf(p.plan).priceUsd ?? 0) * p._count._all, 0),
        2,
      ),
      byProvider: sumBy(usage, 'provider', (r) => r.provider).map(({ provider, costUsd }) => ({
        provider,
        costUsd,
      })),
      applications: { total: apps, submitted, failed },
      errors: { total: errors.reduce((s, e) => s + e._count._all, 0), platform },
    };
  }
}
