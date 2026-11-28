import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ADMIN_TZ, dayStart, nextDay, tzDay } from './tz';
import { ejDate, forgetRolledThrough, rolledThrough } from './usage-stats';

const EVERY_MS = 60 * 60_000;
// a day is rolled up an hour after it ends (late writes from calls still finishing settle first)
const SETTLE_MS = 60 * 60_000;
const MAX_DAYS_PER_PASS = 62;

/** The last calendar day that is over (and settled) at `now`. */
export function lastFinishedDay(now = new Date()): string {
  const settled = new Date(now.getTime() - SETTLE_MS);
  return tzDay(new Date(dayStart(tzDay(settled)).getTime() - 1));
}

/**
 * Sums finished days of usage_events into usage_daily, inside Mongo ($merge), oldest first and at
 * most MAX_DAYS_PER_PASS per pass. Days are only ever added after the last one rolled up, never
 * redone, so a total never counts twice. USAGE_ROLLUP=off turns it (and reading from it) off.
 */
@Injectable()
export class UsageRollupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('UsageRollup');
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.USAGE_ROLLUP === 'off') return;
    const first = setTimeout(() => void this.run(), 60_000);
    const loop = setInterval(() => void this.run(), EVERY_MS);
    first.unref();
    loop.unref();
    this.timers.push(first, loop);
  }

  onModuleDestroy() {
    for (const t of this.timers) clearTimeout(t);
  }

  /** One pass. Returns the days it rolled up. Never throws. */
  async run(now = new Date()): Promise<{ from: string; to: string } | null> {
    if (this.running) return null;
    this.running = true;
    try {
      forgetRolledThrough();
      const done = await rolledThrough(this.prisma);
      let from = done ? nextDay(done) : null;
      if (!from) {
        const oldest = await this.prisma.usageEvent.findFirst({
          orderBy: { created_at: 'asc' },
          select: { created_at: true },
        });
        if (!oldest) return null;
        from = tzDay(oldest.created_at);
      }
      const finished = lastFinishedDay(now);
      if (from > finished) return null;
      let to = from;
      for (let i = 1; i < MAX_DAYS_PER_PASS && to < finished; i++)
        to = nextDay(to);
      await this.prisma.usageEvent.aggregateRaw({
        pipeline: [
          {
            $match: {
              created_at: {
                $gte: ejDate(dayStart(from)),
                $lt: ejDate(dayStart(nextDay(to))),
              },
            },
          },
          {
            $group: {
              _id: {
                day: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$created_at',
                    timezone: ADMIN_TZ,
                  },
                },
                user: '$user_id',
                model: '$model',
                apify: { $gt: ['$apify_usd', 0] },
                feature: '$feature',
              },
              cost: { $sum: { $ifNull: ['$cost_usd', 0] } },
              events: { $sum: 1 },
              input: { $sum: { $ifNull: ['$input_tokens', 0] } },
              output: { $sum: { $ifNull: ['$output_tokens', 0] } },
            },
          },
          {
            $project: {
              _id: {
                $concat: [
                  '$_id.day',
                  '|',
                  { $ifNull: [{ $toString: '$_id.user' }, '-'] },
                  '|',
                  { $ifNull: ['$_id.model', '-'] },
                  '|',
                  { $cond: ['$_id.apify', '1', '0'] },
                  '|',
                  { $ifNull: ['$_id.feature', '-'] },
                ],
              },
              day: '$_id.day',
              user_id: '$_id.user',
              model: '$_id.model',
              apify: '$_id.apify',
              feature: { $ifNull: ['$_id.feature', ''] },
              cost: 1,
              events: 1,
              input: 1,
              output: 1,
            },
          },
          {
            $merge: {
              into: 'usage_daily',
              on: '_id',
              whenMatched: 'replace',
              whenNotMatched: 'insert',
            },
          },
        ],
      });
      forgetRolledThrough();
      this.logger.log(`usage rolled up ${from} .. ${to}`);
      return { from, to };
    } catch (e) {
      this.logger.warn(`usage rollup failed: ${(e as Error).message}`);
      return null;
    } finally {
      this.running = false;
    }
  }
}
