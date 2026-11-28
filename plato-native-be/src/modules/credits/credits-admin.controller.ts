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
