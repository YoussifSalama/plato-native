import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { assertAdminKey } from '../usage/admin-key';
import { PLANS, TOPUPS } from './credit-prices';
import { CreditsService } from './credits.service';
import { CreditsReportService } from './report.service';

const adjustSchema = z.object({
  amount: z.number().finite().min(-1_000_000).max(1_000_000),
  reason: z.string().trim().min(3).max(200),
});
const planSchema = z.object({
  plan: z.enum(Object.keys(PLANS) as [string, ...string[]]),
});
const topupSchema = z.object({
  pack: z.enum(Object.keys(TOPUPS) as [string, ...string[]]),
  ref: z.string().trim().min(3).max(120),
});

// Internal: support, plan changes, manual top-ups and the margin view. Same
// x-admin-key gate as /admin/usage (404 without it). A seeker is named by user id or email.
@Controller('admin/credits')
export class CreditsAdminController {
  constructor(
    private readonly credits: CreditsService,
    private readonly reports: CreditsReportService,
    private readonly config: ConfigService,
  ) {}

  /** Our cost vs the tokens charged, per feature and per seeker. */
  @Get('report')
  report(
    @Headers('x-admin-key') key: string | undefined,
    @Query('days') days = '30',
  ) {
    assertAdminKey(this.config, key);
    return this.reports.report(Number(days));
  }

  /** One seeker's account and latest movements. */
  @Get(':user')
  async show(
    @Headers('x-admin-key') key: string | undefined,
    @Param('user') ref: string,
  ) {
    assertAdminKey(this.config, key);
    return this.credits.adminView(await this.credits.resolveUser(ref));
  }

  /** Add (or take away) tokens: support gestures, refunds, promotions. */
  @Post(':user/adjust')
  async adjust(
    @Headers('x-admin-key') key: string | undefined,
    @Param('user') ref: string,
    @Body() body: unknown,
  ) {
    assertAdminKey(this.config, key);
    const p = adjustSchema.safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    return this.credits.adjust(
      await this.credits.resolveUser(ref),
      p.data.amount,
      p.data.reason,
    );
  }

  /** Move a seeker to a plan (until payments do it): a fresh period with the plan's grant. */
  @Post(':user/plan')
  async plan(
    @Headers('x-admin-key') key: string | undefined,
    @Param('user') ref: string,
    @Body() body: unknown,
  ) {
    assertAdminKey(this.config, key);
    const p = planSchema.safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    return this.credits.setPlan(
      await this.credits.resolveUser(ref),
      p.data.plan,
    );
  }

  /** Record a top-up sold outside the app (until payments do it): the pack's tokens, never expiring. */
  @Post(':user/topup')
  async topup(
    @Headers('x-admin-key') key: string | undefined,
    @Param('user') ref: string,
    @Body() body: unknown,
  ) {
    assertAdminKey(this.config, key);
    const p = topupSchema.safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    return this.credits.addTopup(
      await this.credits.resolveUser(ref),
      p.data.pack,
      p.data.ref,
    );
  }
}
