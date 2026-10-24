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
import { v3Summary, type V3ItemInfo } from './v3-summary';

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
    this.assertKey(key);

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

  // Engine v3 cost per application (Phase 4): turns, tokens, cache hit rate
  // and dollars per item and model, model totals, and the jobs run on more
  // than one model side by side. Read-only.
  @Get('v3')
  async v3(
    @Headers('x-admin-key') key: string | undefined,
    @Query('days') days = '30',
    @Query('model') model?: string,
    @Query('item') item?: string,
  ) {
    this.assertKey(key);
    const n = Math.min(Number(days) || 30, 365);
    const all = await this.prisma.usageEvent.findMany({
      where: {
        feature: 'extension.v3.turn',
        created_at: { gte: new Date(Date.now() - n * 86_400_000) },
        ...(model && { model }),
      },
      select: {
        model: true,
        input_tokens: true,
        output_tokens: true,
        cost_usd: true,
        meta: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
      take: 20000,
    });
    // meta is Json: Prisma has no Json path filter on MongoDB, so the item is matched here
    const rows = item
      ? all.filter((r) => (r.meta as { item?: unknown } | null)?.item === item)
      : all;
    const ids = [
      ...new Set(
        rows
          .map((r) => (r.meta as { item?: unknown } | null)?.item)
          .filter(
            (v): v is string =>
              typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v),
          ),
      ),
    ];
    const batchItems = ids.length
      ? await this.prisma.applyBatchItem.findMany({
          where: { id: { in: ids } },
          select: { id: true, state: true, provider: true, job_id: true },
        })
      : [];
    const jobs = batchItems.length
      ? await this.prisma.job.findMany({
          where: { id: { in: [...new Set(batchItems.map((i) => i.job_id))] } },
          select: { id: true, title: true, company: true },
        })
      : [];
    const jobById = new Map(jobs.map((j) => [j.id, j]));
    const items = new Map<string, V3ItemInfo>(
      batchItems.map((i) => [
        i.id,
        {
          state: i.state,
          provider: i.provider,
          jobId: i.job_id,
          title: jobById.get(i.job_id)?.title ?? null,
          company: jobById.get(i.job_id)?.company ?? null,
        },
      ]),
    );
    return { days: n, ...v3Summary(rows, items) };
  }

  // Internal only: a wrong or missing key looks like no route at all.
  private assertKey(key: string | undefined) {
    const expected = this.config.get<IEnvParams>('env')!.adminReportKey;
    const ok =
      !!expected &&
      !!key &&
      key.length === expected.length &&
      timingSafeEqual(Buffer.from(key), Buffer.from(expected));
    if (!ok) throw new NotFoundException();
  }
}
