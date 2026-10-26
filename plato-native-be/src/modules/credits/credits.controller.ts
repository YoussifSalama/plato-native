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
import { PLANS, TOPUPS } from './credit-prices';
import { CreditsService } from './credits.service';
import { CreditsEstimatesService } from './estimates.service';

const checkoutSchema = z.union([
  z.object({ plan: z.enum(['pro', 'max']) }),
  z.object({ pack: z.enum(Object.keys(TOPUPS) as [string, ...string[]]) }),
]);

// The seeker's Plato tokens. Never returns what anything costs Plato: only
// tokens, and the public plan and top-up prices.
@Controller('job-seeker/credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(
    private readonly credits: CreditsService,
    private readonly estimates: CreditsEstimatesService,
  ) {}

  /** Balance, plan, refill date and the latest movements. */
  @Get()
  get(@Req() req: AuthenticatedRequest, @Query('limit') limit = '20') {
    return this.credits.overview(req.userId, Number(limit));
  }

  /** The plans and top-up packs on offer (public). */
  @Get('prices')
  prices() {
    return { plans: PLANS, topups: TOPUPS };
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
