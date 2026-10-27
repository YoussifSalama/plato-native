import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InsightsService } from './insights.service';

const createSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('FIELD'),
    title: z.string().trim().min(2).max(80),
    location: z.string().trim().max(80).nullish(),
    remote_only: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('COMPANY'),
    company: z.string().trim().min(2).max(80),
  }),
]);

const patchSchema = z.object({
  paused: z.boolean().optional(),
  title: z.string().trim().min(2).max(80).optional(),
  location: z.string().trim().max(80).nullish(),
  remote_only: z.boolean().optional(),
});

const settingsSchema = z.object({
  cadence: z.enum(['DAILY', 'EVERY_3_DAYS', 'WEEKLY']).optional(),
  email: z.boolean().optional(),
  in_app: z.boolean().optional(),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.issues[0]?.message);
  return r.data;
}

// Job alerts: new jobs in a field, or at companies the seeker follows. Free;
// how many depends on the plan.
@Controller('job-seeker/insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  /** Alerts, follows, settings, plan limits and when the next digest is due. */
  @Get()
  overview(@Req() req: AuthenticatedRequest) {
    return this.insights.overview(req.userId);
  }

  @Post('alerts')
  create(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.insights.create(req.userId, parse(createSchema, body));
  }

  @Patch('alerts/:id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.insights.update(req.userId, id, parse(patchSchema, body));
  }

  @Delete('alerts/:id')
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.insights.remove(req.userId, id);
  }

  @Patch('settings')
  settings(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.insights.updateSettings(
      req.userId,
      parse(settingsSchema, body),
    );
  }

  /** Digests already sent, with their jobs. */
  @Get('digests')
  digests(@Req() req: AuthenticatedRequest, @Query('limit') limit = '10') {
    return this.insights.digests(req.userId, Number(limit) || 10);
  }

  /** Companies in the index matching a name, for the follow box. */
  @Get('companies')
  companies(@Query('q') q = '') {
    return this.insights.companies(String(q));
  }
}

// The unsubscribe link in every alert email, no login. POST only, so mail
// scanners that open links can't unsubscribe anyone; the web page and the
// one-click List-Unsubscribe header both POST here.
@Controller('insights')
export class InsightsPublicController {
  constructor(private readonly insights: InsightsService) {}

  @Post('unsubscribe')
  @HttpCode(200)
  unsubscribe(
    @Query('token') queryToken?: string,
    @Body() body?: { token?: string },
  ) {
    return this.insights.unsubscribe(String(body?.token ?? queryToken ?? ''));
  }
}
