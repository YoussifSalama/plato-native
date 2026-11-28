import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard';
import { RateLimiter } from '../extension/extension-token';
import { PrismaService } from '../prisma/prisma.service';
import { activitySchema, pageShape, activityDay } from './activity';

// A beat a minute plus page views: generous, but a script can't fill the collection.
export const activityLimiter = new RateLimiter('activity');

// The seeker web app reports which page is open and for how long (a heartbeat while the tab is
// visible). It feeds the admin panel's per-user engagement view. Fire-and-forget for the client:
// it never shows an error from here.
@Controller('activity')
@UseGuards(JwtAuthGuard)
export class ActivityController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(204)
  async beat(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    if (!activityLimiter.hit(`user:${req.userId}`, 12, 60_000))
      throw new HttpException(
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const p = activitySchema.safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    const page = pageShape(p.data.page);
    const seconds = p.data.seconds ?? 0;
    const views = p.data.view ? 1 : 0;
    if (!page || (!seconds && !views)) return;
    const now = new Date();
    await this.prisma.pageActivity.upsert({
      where: {
        user_id_day_page: { user_id: req.userId, day: activityDay(now), page },
      },
      create: {
        user_id: req.userId,
        day: activityDay(now),
        page,
        views,
        seconds,
        first_at: now,
        last_at: now,
      },
      update: {
        views: { increment: views },
        seconds: { increment: seconds },
        last_at: now,
      },
    });
  }
}
