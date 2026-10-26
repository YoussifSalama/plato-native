import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { assertAdminKey } from '../usage/admin-key';
import { PLANS, TOPUPS, USD_PER_TOKEN } from './credit-prices';
import { addTopup, adjustTokens, creditAccount, setPlan } from './credits';

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

// Internal: support, plan changes and the margin view. Same x-admin-key gate as
// /admin/usage (404 without it). A seeker is named by user id or email.
@Controller('admin/credits')
export class CreditsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async userId(ref: string) {
    const user = await this.prisma.user.findFirst({
      where: ref.includes('@')
        ? { email: { equals: ref, mode: 'insensitive' } }
        : /^[a-f0-9]{24}$/i.test(ref)
          ? { id: ref }
          : { id: '000000000000000000000000' },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('No such user');
    return user.id;
  }

  /** Our cost against the tokens charged, per feature and per seeker. */
  @Get('report')
  async report(
    @Headers('x-admin-key') key: string | undefined,
    @Query('days') days = '30',
  ) {
    assertAdminKey(this.config, key);
    const n = Math.min(Number(days) || 30, 365);
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
    type Line = { costUsd: number; calls: number; tokens: number };
    const blank = (): Line => ({ costUsd: 0, calls: 0, tokens: 0 });
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
      users: topUsers.map(([id, l]) => ({
        userId: id,
        email: email.get(id) ?? null,
        plan: account.get(id)?.plan ?? null,
        balance: account.get(id) ? round(account.get(id)!.balance, 1) : null,
        ...line(l),
      })),
    };
  }

  /** One seeker's account and latest movements. */
  @Get(':user')
  async show(
    @Headers('x-admin-key') key: string | undefined,
    @Param('user') ref: string,
  ) {
    assertAdminKey(this.config, key);
    const id = await this.userId(ref);
    const [acc, ledger] = await Promise.all([
      creditAccount(id),
      this.prisma.creditLedger.findMany({
        where: { user_id: id },
        orderBy: { created_at: 'desc' },
        take: 100,
      }),
    ]);
    return { account: acc, ledger };
  }

  /** Add (or take away) tokens: support gestures, refunds, promotions. */
  @Post(':user/adjust')
  async adjust(
    @Headers('x-admin-key') key: string | undefined,
    @Param('user') ref: string,
    @Body() body: unknown,
  ) {
    assertAdminKey(this.config, key);
    const p = z
      .object({
        amount: z.number().finite().min(-1_000_000).max(1_000_000),
        reason: z.string().trim().min(3).max(200),
      })
      .safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    return adjustTokens(await this.userId(ref), p.data.amount, p.data.reason);
  }

  /** Move a seeker to a plan (until payments do it): a fresh period with the plan's grant. */
  @Post(':user/plan')
  async plan(
    @Headers('x-admin-key') key: string | undefined,
    @Param('user') ref: string,
    @Body() body: unknown,
  ) {
    assertAdminKey(this.config, key);
    const p = z
      .object({ plan: z.enum(Object.keys(PLANS) as [string, ...string[]]) })
      .safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    return setPlan(await this.userId(ref), p.data.plan);
  }

  /** Record a top-up sold outside the app (until payments do it): the pack's tokens, never expiring. */
  @Post(':user/topup')
  async topup(
    @Headers('x-admin-key') key: string | undefined,
    @Param('user') ref: string,
    @Body() body: unknown,
  ) {
    assertAdminKey(this.config, key);
    const p = z
      .object({
        pack: z.enum(Object.keys(TOPUPS) as [string, ...string[]]),
        ref: z.string().trim().min(3).max(120),
      })
      .safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    return addTopup(await this.userId(ref), p.data.pack, p.data.ref);
  }
}
