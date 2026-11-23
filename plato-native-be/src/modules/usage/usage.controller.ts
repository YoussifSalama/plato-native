import { BadRequestException, Controller, Get, Headers, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { assertAdminKey } from './admin-key';
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
          select: { id: true, state: true, provider: true, job_id: true, detail: true },
        })
      : [];
    // failure reasons: every stop on these items by its reason code (plato-extension src/panel/main.ts STOP reasons)
    const stops: Record<string, number> = {};
    for (const i of batchItems)
      for (const st of (i.detail as { stops?: { reason?: string }[] } | null)?.stops ?? [])
        stops[st.reason ?? 'unknown'] = (stops[st.reason ?? 'unknown'] ?? 0) + 1;
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
    return { days: n, stops, ...v3Summary(rows, items) };
  }

  private assertKey(key: string | undefined) {
    assertAdminKey(this.config, key);
  }
}

type Stop = { at: string; reason: string; message: string; code?: string; detail?: string };

// Support: the seeker copies the error code from the extension panel ("Error code PL-XXXXXX") and sends it to us.
// GET /admin/errors?code=PL-XXXXXX (x-admin-key) answers with that stop: who, which job, what the panel said, the raw
// error behind it, and the item's stops before it. The server log has the same code on the Claude failure line.
@Controller('admin/errors')
export class ErrorsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async byCode(
    @Headers('x-admin-key') key: string | undefined,
    @Query('code') raw = '',
  ) {
    assertAdminKey(this.config, key);
    const code = raw.trim().toUpperCase();
    if (!/^PL-[A-Z2-9]{6}$/.test(code))
      throw new BadRequestException('code looks like PL-XXXXXX');
    const hits = (await this.prisma.applyBatchItem.findRaw({
      filter: { 'detail.stops.code': code },
      options: { projection: { _id: 1 } },
    })) as unknown as { _id: { $oid: string } }[];
    const items = await this.prisma.applyBatchItem.findMany({
      where: { id: { in: hits.map((h) => h._id.$oid) } },
      select: { id: true, batch_id: true, job_id: true, job_seeker_id: true, provider: true, state: true, detail: true },
    });
    return Promise.all(
      items.map(async (i) => {
        const stops = (i.detail as { stops?: Stop[] } | null)?.stops ?? [];
        const [job, seeker] = await Promise.all([
          this.prisma.job.findUnique({ where: { id: i.job_id }, select: { title: true, company: true, url: true, apply_url: true } }),
          this.prisma.jobSeeker.findUnique({ where: { id: i.job_seeker_id }, select: { user: { select: { id: true, email: true } } } }),
        ]);
        return {
          code,
          stop: stops.find((st) => st.code === code),
          seeker: { job_seeker_id: i.job_seeker_id, user_id: seeker?.user.id, email: seeker?.user.email },
          job,
          item: { id: i.id, batch_id: i.batch_id, provider: i.provider, state: i.state },
          stops, // the item's last 20 stops, oldest first: what happened before this one
        };
      }),
    );
  }
}
