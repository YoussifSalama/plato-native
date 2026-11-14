import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { DiscoveryService } from '../discovery/discovery.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CatalogSource } from './company-catalog';
import {
  afterVisit,
  CRAWLABLE,
  fetchSource,
  TIER_EVERY_MS,
} from './company-crawler';

const EVERY_MS = 15 * 60_000;
const PER_RUN = 25; // companies per pass; the next pass picks up the rest

// The company crawler (FOLLOWING.md 2.2): walks the catalogue, not the users. Each due company's free public jobs
// feeds are read once and stored in the shared index; the alert matcher then sends new jobs to everyone following
// that company (and to roles they fit). Followers only change how often a company is visited (its tier).
// ponytail: an in-process loop with a "running" flag, fine for one API instance; Mongo leases come with the worker
// process (FOLLOWING.md 2.4).
@Injectable()
export class CompanyCrawlerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CompanyCrawlerService.name);
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: DiscoveryService,
  ) {}

  onModuleInit() {
    if (
      process.env.INSIGHTS_JOBS === 'off' ||
      process.env.COMPANY_CRAWLER === 'off'
    )
      return;
    const first = setTimeout(() => void this.pass(), 2 * 60_000);
    const loop = setInterval(() => void this.pass(), EVERY_MS);
    first.unref();
    loop.unref();
    this.timers.push(first, loop);
  }

  onModuleDestroy() {
    this.timers.forEach(clearTimeout);
  }

  /** Companies whose tier says they are due, with at least one source we can read, oldest visit first. */
  async due(now = Date.now(), limit = PER_RUN) {
    const all = await this.prisma.companySource.findMany({
      select: {
        id: true,
        name: true,
        tier: true,
        sources: true,
        last_crawled_at: true,
      },
      orderBy: { last_crawled_at: 'asc' }, // Mongo sorts never-visited (null) first,
      take: 2000,
    });
    return all
      .filter((c) =>
        ((c.sources as unknown as CatalogSource[]) ?? []).some(
          (s) => CRAWLABLE.includes(s.type) && s.status !== 'broken',
        ),
      )
      .filter(
        (c) =>
          !c.last_crawled_at ||
          now - c.last_crawled_at.getTime() >=
            (TIER_EVERY_MS[c.tier] ?? TIER_EVERY_MS.cold),
      )
      .slice(0, limit);
  }

  async pass() {
    if (this.running) return;
    this.running = true;
    try {
      const companies = await this.due();
      let jobs = 0;
      for (const c of companies) jobs += await this.visit(c);
      if (companies.length)
        this.logger.log(
          `crawled ${companies.length} companies, ${jobs} open jobs indexed`,
        );
    } catch (e) {
      this.logger.warn(
        `crawler pass failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      this.running = false;
    }
  }

  /** One company: every readable source, jobs into the shared index, each source's health recorded. */
  async visit(c: { id: string; name: string; sources: unknown }) {
    const started = new Date();
    const sources = (c.sources as CatalogSource[]) ?? [];
    const next: CatalogSource[] = [];
    let indexed = 0;
    for (const s of sources) {
      if (!CRAWLABLE.includes(s.type) || s.status === 'broken') {
        next.push(s);
        continue;
      }
      try {
        const jobs = await fetchSource(s, c.name);
        indexed += await this.discovery.indexJobs(jobs);
        next.push(afterVisit(s, { ok: true }, started));
      } catch (e) {
        next.push(
          afterVisit(
            s,
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            started,
          ),
        );
      }
    }
    // New = rows this visit created (indexJobs also refreshes jobs it already had).
    const fresh = await this.prisma.job.count({
      where: { company: c.name, created_at: { gte: started } },
    });
    await this.prisma.companySource.update({
      where: { id: c.id },
      data: {
        sources: next as unknown as Prisma.InputJsonValue,
        last_crawled_at: started,
        ...(fresh > 0 && { last_new_job_at: started }),
      },
    });
    return indexed;
  }
}
