import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { IEnvParams } from '../../types/config/env.types';
import { PrismaService } from '../prisma/prisma.service';

const round = (n: number) => Math.round(n * 1e6) / 1e6;

// Internal report on metered usage and estimated cost, by feature. NOT for
// customers: it needs the ADMIN_REPORT_KEY header and answers 404 otherwise
// (or when no key is configured), so the app and its users never see cost data.
@Controller('admin/usage')
export class UsageController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get('summary')
  async summary(
    @Headers('x-admin-key') key: string | undefined,
    @Query('days') days = '30',
    @Query('feature') feature?: string,
    @Query('userId') userId?: string,
  ) {
    const expected = this.config.get<IEnvParams>('env')!.adminReportKey;
    const ok =
      !!expected &&
      !!key &&
      key.length === expected.length &&
      timingSafeEqual(Buffer.from(key), Buffer.from(expected));
    if (!ok) throw new NotFoundException();

    const n = Math.min(Number(days) || 30, 365);
    const rows = await this.prisma.usageEvent.findMany({
      where: {
        created_at: { gte: new Date(Date.now() - n * 86_400_000) },
        ...(feature && { feature }),
        ...(userId && { user_id: userId }),
      },
      orderBy: { created_at: 'desc' },
      take: 20000,
    });
    const byFeature = new Map<
      string,
      {
        feature: string;
        events: number;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
        seconds: number;
      }
    >();
    for (const r of rows) {
      const g = byFeature.get(r.feature) ?? {
        feature: r.feature,
        events: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        seconds: 0,
      };
      g.events++;
      g.inputTokens += r.input_tokens;
      g.outputTokens += r.output_tokens;
      g.costUsd += r.cost_usd ?? 0;
      g.seconds += (r.meta as { seconds?: number } | null)?.seconds ?? 0;
      byFeature.set(r.feature, g);
    }
    const features = [...byFeature.values()]
      .map((g) => ({ ...g, costUsd: round(g.costUsd) }))
      .sort((a, b) => b.costUsd - a.costUsd);
    return {
      days: n,
      totalCostUsd: round(features.reduce((s, g) => s + g.costUsd, 0)),
      features,
      // Voice calls one by one: the numbers to report after a test.
      voiceCalls: rows
        .filter((r) => r.feature === 'career.voice')
        .map((r) => ({
          at: r.created_at,
          userId: r.user_id,
          costUsd: r.cost_usd,
          ...(r.meta as object),
        })),
    };
  }
}
