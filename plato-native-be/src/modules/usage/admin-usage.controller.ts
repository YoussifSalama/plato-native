import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, AdminPage } from '../admin/admin-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  OBJECT_ID,
  PAGE_SIZE,
  pageOf,
  parseRange,
  parseSort,
  PROVIDERS,
  Provider,
  round,
  sumBy,
  tokensSpentBy,
  usageGroups,
  usageOverview,
} from './usage-stats';
import { memo } from '../admin-users/memo';
import { searchItems, summarize, type SearchItem } from './search-stats';

// Admin panel, Usage page: what we paid, by provider, feature, day and seeker.
@Controller('admin/usage')
@UseGuards(AdminGuard)
@AdminPage('usage')
export class AdminUsageController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview(@Query('from') from?: string, @Query('to') to?: string) {
    const range = parseRange(from, to);
    return usageOverview(
      await usageGroups(this.prisma, range, ['day', 'feature']),
      range,
    );
  }

  @Get('providers/:provider')
  async provider(
    @Param('provider') provider: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!PROVIDERS.includes(provider as Provider))
      throw new BadRequestException(
        `provider is one of ${PROVIDERS.join(', ')}`,
      );
    const range = parseRange(from, to);
    const [rows, perUser] = await Promise.all([
      usageGroups(this.prisma, range, ['day', 'feature']),
      usageGroups(this.prisma, range, ['user']),
    ]);
    const mine = rows.filter((r) => r.provider === provider);
    const models = new Map<
      string,
      {
        model: string;
        costUsd: number;
        inputTokens: number;
        outputTokens: number;
        events: number;
      }
    >();
    for (const r of mine) {
      const k = r.model ?? '(none)';
      const g = models.get(k) ?? {
        model: k,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        events: 0,
      };
      g.costUsd += r.costUsd;
      g.inputTokens += r.inputTokens;
      g.outputTokens += r.outputTokens;
      g.events += r.events;
      models.set(k, g);
    }
    const top = sumBy(
      perUser.filter((r) => r.provider === provider && r.userId),
      'userId',
      (r) => r.userId!,
    ).slice(0, 20);
    const users = await this.prisma.user.findMany({
      where: { id: { in: top.map((t) => t.userId) } },
      select: { id: true, email: true },
    });
    const email = new Map(users.map((u) => [u.id, u.email]));
    const overview = usageOverview(mine, range);
    return {
      provider,
      totalCostUsd: overview.totalCostUsd,
      events: overview.events,
      byModel: [...models.values()]
        .map((g) => ({ ...g, costUsd: round(g.costUsd) }))
        .sort((a, b) => b.costUsd - a.costUsd),
      byFeature: overview.byFeature,
      byDay: overview.byDay.map(({ day, costUsd }) => ({ day, costUsd })),
      topUsers: top.map((t) => ({ ...t, email: email.get(t.userId) ?? null })),
    };
  }

  /** Seekers by what they cost us in the range. sort = [-]costUsd (default -costUsd) | events | tokensSpent | email. */
  @Get('users')
  async users(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('sort') sort?: string,
  ) {
    const range = parseRange(from, to);
    let ids: string[] | undefined;
    if (q?.trim()) {
      const hits = await this.prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: q.trim(), mode: 'insensitive' } },
            { full_name: { contains: q.trim(), mode: 'insensitive' } },
            ...(OBJECT_ID.test(q.trim()) ? [{ id: q.trim() }] : []),
          ],
        },
        select: { id: true },
        take: 1000,
      });
      ids = hits.map((h) => h.id);
      if (!ids.length) return { items: [], total: 0 };
    }
    const [groups, tokens] = await Promise.all([
      usageGroups(this.prisma, range, ['user'], { userIds: ids }),
      tokensSpentBy(this.prisma, range, ids),
    ]);
    const rows = sumBy(
      groups.filter((g) => g.userId),
      'userId',
      (g) => g.userId!,
    ).map((r) => ({ ...r, tokensSpent: tokens.get(r.userId) ?? 0 }));
    const order = parseSort(
      sort,
      ['costUsd', 'events', 'tokensSpent', 'email'] as const,
      '-costUsd',
    );
    if (order.field === 'email') {
      const emails = new Map(
        (
          await this.prisma.user.findMany({
            where: { id: { in: rows.map((r) => r.userId) } },
            select: { id: true, email: true },
          })
        ).map((u) => [u.id, u.email]),
      );
      rows.sort((a, b) =>
        (emails.get(a.userId) ?? '').localeCompare(emails.get(b.userId) ?? ''),
      );
    } else {
      const f = order.field;
      rows.sort((a, b) => a[f] - b[f]);
    }
    if (order.desc) rows.reverse();
    const p = pageOf(page);
    const slice = rows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
    const sliceIds = slice.map((r) => r.userId);
    const [users, accounts] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: sliceIds } },
        select: { id: true, email: true, full_name: true },
      }),
      this.prisma.creditAccount.findMany({
        where: { user_id: { in: sliceIds } },
        select: { user_id: true, plan: true },
      }),
    ]);
    const user = new Map(users.map((u) => [u.id, u]));
    const plan = new Map(accounts.map((a) => [a.user_id, a.plan]));
    return {
      items: slice.map((r) => ({
        userId: r.userId,
        email: user.get(r.userId)?.email ?? null,
        name: user.get(r.userId)?.full_name ?? null,
        plan: plan.get(r.userId) ?? 'free',
        costUsd: r.costUsd,
        events: r.events,
        tokensSpent: r.tokensSpent,
      })),
      total: rows.length,
    };
  }

  @Get('users/:userId')
  async user(
    @Param('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!OBJECT_ID.test(userId)) throw new NotFoundException('No such user');
    const range = parseRange(from, to);
    const [u, rows] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, full_name: true },
      }),
      usageGroups(this.prisma, range, ['day', 'feature'], { userId }),
    ]);
    if (!u) throw new NotFoundException('No such user');
    return {
      user: { id: u.id, email: u.email, name: u.full_name },
      ...usageOverview(rows, range),
    };
  }

  /**
   * Every job search in the range: who, when, how long, what it found (counts only, never the
   * query), what it cost us and the seeker. With the averages the owner prices plans from.
   * sort = [-]startedAt (default -startedAt) | costUsd | tokens | durationSec | shortlisted.
   */
  @Get('searches')
  async searches(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('sort') sort?: string,
  ) {
    const range = parseRange(from, to);
    // the same range asked again within a minute is not recomputed (sorting, paging, the status filter)
    const all = await memo(
      `searches:${range.from.toISOString()}:${range.to.toISOString()}:${userId ?? ''}`,
      () => searchItems(this.prisma, range, userId || undefined),
    );
    const st = status?.toUpperCase();
    const rows =
      st && ['DONE', 'FAILED', 'RUNNING'].includes(st)
        ? all.filter((r) => r.status === st)
        : [...all];
    const order = parseSort(
      sort,
      ['startedAt', 'costUsd', 'tokens', 'durationSec', 'shortlisted'] as const,
      '-startedAt',
    );
    const key = (r: SearchItem) =>
      order.field === 'startedAt'
        ? r.startedAt.getTime()
        : order.field === 'durationSec'
          ? (r.durationSec ?? -1)
          : r[order.field];
    rows.sort((a, b) => (order.desc ? key(b) - key(a) : key(a) - key(b)));
    const p = pageOf(page);
    const slice = rows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
    const ids = [
      ...new Set(slice.map((r) => r.userId).filter((x): x is string => !!x)),
    ];
    const [users, accounts] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, email: true, full_name: true },
      }),
      this.prisma.creditAccount.findMany({
        where: { user_id: { in: ids } },
        select: { user_id: true, plan: true },
      }),
    ]);
    const user = new Map(users.map((u) => [u.id, u]));
    const plan = new Map(accounts.map((a) => [a.user_id, a.plan]));
    return {
      // the averages cover every status in the range, whatever the list is filtered to
      summary: summarize(all),
      items: slice.map((r) => ({
        id: r.id,
        userId: r.userId,
        email: r.userId ? (user.get(r.userId)?.email ?? null) : null,
        name: r.userId ? (user.get(r.userId)?.full_name ?? null) : null,
        plan: r.userId ? (plan.get(r.userId) ?? 'free') : null,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        durationSec: r.durationSec,
        status: r.status,
        fetched: r.fetched,
        shortlisted: r.shortlisted,
        costUsd: r.costUsd,
        tokens: r.tokens,
        events: r.events,
        byProvider: r.byProvider,
        attribution: r.attribution,
      })),
      total: rows.length,
    };
  }
}
