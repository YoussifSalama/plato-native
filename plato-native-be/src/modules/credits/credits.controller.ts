import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { activePlans, activeTopups } from './credit-prices';
import { CreditsService } from './credits.service';
import { CreditsEstimatesService } from './estimates.service';

// Only what is on sale now (the plans collection can switch a plan or pack off); never Free.
const checkoutSchema = z.union([
  z.object({
    plan: z.string().refine((k) => k !== 'free' && k in activePlans()),
  }),
  z.object({ pack: z.string().refine((k) => k in activeTopups()) }),
]);
// The public shape, as before the plans collection: { label, monthly, priceUsd } / { label, tokens, priceUsd }.
const publicList = <T extends { active: boolean }>(r: Record<string, T>) =>
  Object.fromEntries(
    Object.entries(r).map(([k, { active: _active, ...v }]) => [k, v]),
  );

// The seeker's Plato tokens. Never returns what anything costs Plato: only
// tokens, and the public plan and top-up prices.
@Controller('job-seeker/credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(
    private readonly credits: CreditsService,
    private readonly estimates: CreditsEstimatesService,
  ) {}

  /** Balance, plan, refill date, this period's spending and one page of history (`before` = the last page's nextBefore). */
  @Get()
  get(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit = '20',
    @Query('before') before?: string,
  ) {
    const at = before ? new Date(before) : undefined;
    return this.credits.overview(
      req.userId,
      Number(limit),
      at && !isNaN(at.getTime()) ? at : undefined,
    );
  }

  /** The plans and top-up packs on offer (public). */
  @Get('prices')
  prices() {
    return {
      plans: publicList(activePlans()),
      topups: publicList(activeTopups()),
    };
  }

  /** What things are likely to cost, in rounded figures: the same answer the assistants get. */
  @Get('estimates')
  estimatesFor(@Req() req: AuthenticatedRequest) {
    return this.estimates.summary(req.userId);
  }

  /** Start paying for a plan (monthly) or a top-up pack (one-time). */
  @Post('checkout')
  checkout(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const p = checkoutSchema.safeParse(body);
    if (!p.success)
      throw new BadRequestException('Choose the Pro or Max plan, or a top-up.');
    return this.credits.checkout(req.userId, p.data);
  }
}
