import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { JobSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_POSTING_AGE_DAYS, postedCutoff } from './discovery-run.helpers';

// Has the posting been taken down? A listing page that is gone (404/410) or says
// so in words is closed; anything else (blocked, error, timeout) is "don't know"
// and the job stays. Returns null for "don't know".
const CLOSED_WORDS =
  /(no longer (available|accepting|open)|position (has been|is) (filled|closed)|job (is )?(closed|expired|no longer)|this (job|posting|position|role) (has )?(expired|closed|been (filled|removed))|not accepting applications|vacancy (has been|is) (filled|closed)|the job you are looking for)/i;

export function listingGone(status: number, body: string): boolean | null {
  if (status === 404 || status === 410) return true;
  if (status >= 200 && status < 300) return CLOSED_WORDS.test(body);
  return null;
}

// Only places whose pages answer plain requests and tell the truth when a job
// closes. Boards that block bots (LinkedIn, Indeed, Glassdoor...) are never
// polled: a block would look like "closed".
// ponytail: Ashby is a single-page app whose closed jobs still return 200; add a check through its API if needed.
export const CHECKABLE: JobSource[] = [
  JobSource.GREENHOUSE,
  JobSource.LEVER,
  JobSource.WORKABLE,
  JobSource.REMOTIVE,
  JobSource.JOBICY,
  JobSource.REMOTEOK,
  JobSource.HIMALAYAS,
];
const BATCH = 100;
const RECHECK_MS = 3 * 86_400_000;
const EVERY_MS = 6 * 3_600_000;
const UA = 'Plato/1.0 (checking whether a posting is still open)';

// One look at a listing page: true closed, false open, null don't know.
export async function probeListing(url: string): Promise<boolean | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
    });
    return listingGone(res.status, (await res.text()).slice(0, 200_000));
  } catch {
    return null;
  }
}

@Injectable()
export class JobFreshnessService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobFreshnessService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.FRESHNESS_CHECK === 'off') return;
    // Soon after boot, then a batch every few hours.
    const first = setTimeout(() => void this.checkBatch(), 2 * 60_000);
    const loop = setInterval(() => void this.checkBatch(), EVERY_MS);
    first.unref();
    loop.unref();
    this.timers.push(first, loop);
  }

  onModuleDestroy() {
    this.timers.forEach(clearTimeout);
  }

  async checkBatch(limit = BATCH) {
    const jobs = await this.prisma.job.findMany({
      where: {
        source: { in: CHECKABLE },
        expired_at: null,
        posted_at: { gte: postedCutoff(MAX_POSTING_AGE_DAYS) },
        OR: [
          { checked_at: null },
          { checked_at: { lt: new Date(Date.now() - RECHECK_MS) } },
        ],
      },
      orderBy: { checked_at: 'asc' },
      take: limit,
      select: { id: true, url: true, apply_url: true },
    });
    let closed = 0;
    for (let i = 0; i < jobs.length; i += 5) {
      await Promise.all(
        jobs.slice(i, i + 5).map(async (job) => {
          const gone = await probeListing(job.apply_url || job.url);
          if (gone) closed++;
          await this.prisma.job.update({
            where: { id: job.id },
            data: {
              checked_at: new Date(),
              ...(gone && { expired_at: new Date() }),
            },
          });
        }),
      );
    }
    if (jobs.length)
      this.logger.log(`Freshness: checked ${jobs.length}, closed ${closed}`);
    return { checked: jobs.length, closed };
  }
}
