import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { FEATURE_LABELS, PLANS, planOf, TOPUPS } from './credit-prices';
import { creditAccount } from './credits';
import { tokenSummary } from './estimates';

const shown = (n: number) => Math.round(n * 10) / 10;

// The seeker's Plato tokens. Never returns what anything costs Plato: only
// tokens, and the public plan prices. The cost behind a token stays internal.
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
      // bought tokens still in the balance: they are spent last and never expire
      topup: shown(Math.max(0, Math.min(acc.topup ?? 0, acc.balance))),
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
            : r.kind === 'topup'
              ? 'Top-up'
              : r.kind === 'adjust'
                ? 'Adjustment by Plato'
                : r.kind,
        at: r.created_at,
      })),
    };
  }

  /** The plans and top-up packs on offer (public). */
  @Get('prices')
  prices() {
    return { plans: PLANS, topups: TOPUPS };
  }

  /**
   * What things are likely to cost, to show before the seeker spends tokens.
   * Rounded figures only (estimates.ts): the same answer the assistants get.
   */
  @Get('estimates')
  estimates(@Req() req: AuthenticatedRequest) {
    return tokenSummary(req.userId);
  }

  /**
   * Start paying for a plan. No payment provider is connected yet (it needs a
   * merchant account): until PAYMENTS_PROVIDER is set this answers 503
   * payments_unavailable. With one, this creates its checkout and returns the
   * URL; its webhook confirms the payment and calls setPlan().
   */
  @Post('checkout')
  async checkout(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    // a plan (monthly) or a top-up pack (one-time)
    const p = z
      .union([
        z.object({ plan: z.enum(['pro', 'max']) }),
        z.object({
          pack: z.enum(Object.keys(TOPUPS) as [string, ...string[]]),
        }),
      ])
      .safeParse(body);
    if (!p.success)
      throw new BadRequestException('Choose the Pro or Max plan, or a top-up.');
    if ('plan' in p.data) {
      const acc = await creditAccount(req.userId);
      if (acc.plan === p.data.plan)
        throw new BadRequestException(
          `You are already on ${PLANS[p.data.plan].label}.`,
        );
    }
    if (!process.env.PAYMENTS_PROVIDER)
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'payments_unavailable',
        message:
          'Online payment is not open yet. Contact support to upgrade your plan or buy tokens.',
      });
    // ponytail: provider checkout goes here (Paymob / Fawry / Stripe), then its webhook -> setPlan() or addTopup()
    throw new ServiceUnavailableException({
      statusCode: 503,
      code: 'payments_unavailable',
      message: `The ${process.env.PAYMENTS_PROVIDER} checkout is not connected yet.`,
    });
  }
}
