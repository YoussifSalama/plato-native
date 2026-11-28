import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  AdminGuard,
  AdminPage,
  type AdminRequest,
} from '../admin/admin-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ejDate, ejId, num, parseRange, str } from '../usage/usage-stats';
import { allPlans, allTopups } from './credit-prices';
import { CreditsService } from './credits.service';
import { CreditsReportService } from './report.service';

const adjustSchema = z.object({
  amount: z.number().finite().min(-1_000_000).max(1_000_000),
  reason: z.string().trim().min(3).max(200),
});
// Any known plan or pack, on sale or not: an admin may keep a seeker on a switched-off one.
const planSchema = z.object({
  plan: z.string().refine((k) => k in allPlans(), 'Unknown plan'),
  // months paid for: the plan lapses to Free after them
  months: z.number().int().min(1).max(24).default(1),
});
const topupSchema = z.object({
  pack: z.string().refine((k) => k in allTopups(), 'Unknown top-up'),
  ref: z.string().trim().min(3).max(120),
});

// Internal: support, plan changes, manual top-ups and the margin view. Admin panel,
// Credits page. A seeker is named by user id or email. Every write records the
// acting admin in the ledger (meta.admin).
@Controller('admin/credits')
@UseGuards(AdminGuard)
@AdminPage('credits')
export class CreditsAdminController {
  constructor(
    private readonly credits: CreditsService,
    private readonly reports: CreditsReportService,
    private readonly prisma: PrismaService,
  ) {}

  /** Our cost vs the tokens charged, per feature and per seeker. */
  @Get('report')
  report(@Query('days') days = '30') {
    return this.reports.report(Number(days));
  }

  /**
   * Every token movement across seekers, newest first, 50 a page: who got or spent what, and
   * every manual change by an admin. kind = comma list of ledger kinds; manual=1 = only what an
   * admin did (adjustments, top-ups, plan grants); q = seeker email or name. Plus totals by kind.
   * Before ":user" so "ledger" is not read as a seeker.
   */
  @Get('ledger')
  async allLedger(
    @Query('kind') kind?: string,
    @Query('manual') manual?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
  ) {
    const range = parseRange(from, to);
    const p = Math.max(1, Math.floor(Number(page) || 1));
    let userIds: string[] | undefined;
    if (q?.trim()) {
      const hits = await this.prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: q.trim(), mode: 'insensitive' } },
            { full_name: { contains: q.trim(), mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 1000,
      });
      userIds = hits.map((h) => h.id);
      if (!userIds.length) return { items: [], total: 0, totals: [] };
    }
    const kinds = kind
      ?.split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const match = {
      created_at: { $gte: ejDate(range.from), $lt: ejDate(range.to) },
      ...(userIds && { user_id: { $in: userIds.map(ejId) } }),
      ...(kinds?.length && { kind: { $in: kinds } }),
      ...(manual === '1' && { 'meta.admin': { $exists: true } }),
    };
    const [out] = (await this.prisma.creditLedger.aggregateRaw({
      pipeline: [
        { $match: match },
        {
          $facet: {
            items: [
              { $sort: { created_at: -1 } },
              { $skip: (p - 1) * 50 },
              { $limit: 50 },
            ],
            total: [{ $count: 'n' }],
            totals: [
              {
                $group: {
                  _id: '$kind',
                  amount: { $sum: '$amount' },
                  n: { $sum: 1 },
                },
              },
            ],
          },
        },
      ],
    })) as unknown as {
      items: Record<string, unknown>[];
      total: { n: unknown }[];
      totals: { _id: unknown; amount: unknown; n: unknown }[];
    }[];
    const rows = out?.items ?? [];
    const ids = [
      ...new Set(
        rows.map((r) => str(r.user_id)).filter((x): x is string => !!x),
      ),
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, full_name: true },
    });
    const who = new Map(users.map((u) => [u.id, u]));
    return {
      items: rows.map((r) => {
        const userId = str(r.user_id);
        return {
          id: str(r._id),
          user_id: userId,
          email: userId ? (who.get(userId)?.email ?? null) : null,
          name: userId ? (who.get(userId)?.full_name ?? null) : null,
          kind: str(r.kind),
          amount: num(r.amount),
          balance_after: num(r.balance_after),
          feature: str(r.feature),
          meta: (r.meta ?? null) as Record<string, unknown> | null,
          created_at: str(r.created_at),
        };
      }),
      total: num(out?.total[0]?.n),
      totals: (out?.totals ?? []).map((t) => ({
        kind: str(t._id),
        amount: Math.round(num(t.amount) * 10) / 10,
        count: num(t.n),
      })),
    };
  }

  /** One seeker's account and latest movements. */
  @Get(':user')
  async show(@Param('user') ref: string) {
    return this.credits.adminView(await this.credits.resolveUser(ref));
  }

  /** Every ledger row of one seeker, newest first, 50 a page. */
  @Get(':user/ledger')
  async ledger(@Param('user') ref: string, @Query('page') page?: string) {
    const userId = await this.credits.resolveUser(ref);
    const p = Math.max(1, Math.floor(Number(page) || 1));
    const [items, total] = await Promise.all([
      this.prisma.creditLedger.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip: (p - 1) * 50,
        take: 50,
      }),
      this.prisma.creditLedger.count({ where: { user_id: userId } }),
    ]);
    return { items, total };
  }

  /** Add (or take away) tokens: support gestures, refunds, promotions. */
  @Post(':user/adjust')
  async adjust(
    @Req() req: AdminRequest,
    @Param('user') ref: string,
    @Body() body: unknown,
  ) {
    const p = adjustSchema.safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    return this.credits.adjust(
      await this.credits.resolveUser(ref),
      p.data.amount,
      p.data.reason,
      req.admin.id,
    );
  }

  /** Move a seeker to a plan (until payments do it): a fresh period with the plan's grant, paid for `months`. */
  @Post(':user/plan')
  async plan(
    @Req() req: AdminRequest,
    @Param('user') ref: string,
    @Body() body: unknown,
  ) {
    const p = planSchema.safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    return this.credits.setPlan(
      await this.credits.resolveUser(ref),
      p.data.plan,
      new Date(),
      p.data.months,
      req.admin.id,
    );
  }

  /** Record a top-up sold outside the app (until payments do it): the pack's tokens, never expiring. */
  @Post(':user/topup')
  async topup(
    @Req() req: AdminRequest,
    @Param('user') ref: string,
    @Body() body: unknown,
  ) {
    const p = topupSchema.safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    return this.credits.addTopup(
      await this.credits.resolveUser(ref),
      p.data.pack,
      p.data.ref,
      req.admin.id,
    );
  }
}
