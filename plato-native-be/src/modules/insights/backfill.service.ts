import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OpenFeedsAdapter } from '../discovery/adapters/open-feeds.adapter';
import { PublicBoardsAdapter } from '../discovery/adapters/public-boards.adapter';
import { NormalizedJob } from '../discovery/adapters/types';
import { normalizeCompany } from '../discovery/company';
import { DiscoveryService } from '../discovery/discovery.service';
import { PrismaService } from '../prisma/prisma.service';
import { AlertMatcherService } from './alert-matcher.service';

const EVERY_MS = 6 * 3_600_000;
const MAX_TITLES = 30;
const MAX_COMPANY_BOARDS = 40;

// Keeps the index fresh for alerts between seekers' own searches, using only
// sources that cost nothing: the open feeds, Workable's public search, and
// the Greenhouse/Lever/Ashby boards of followed companies. No paid scraping.
// New jobs land in the shared index; the matcher picks them up like any other.
@Injectable()
export class InsightsBackfillService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InsightsBackfillService.name);
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: DiscoveryService,
    private readonly feeds: OpenFeedsAdapter,
    private readonly boards: PublicBoardsAdapter,
    private readonly matcher: AlertMatcherService,
  ) {}

  onModuleInit() {
    if (process.env.INSIGHTS_JOBS === 'off') return;
    const first = setTimeout(() => void this.run(), 20 * 60_000);
    const loop = setInterval(() => void this.run(), EVERY_MS);
    first.unref();
    loop.unref();
    this.timers.push(first, loop);
  }

  onModuleDestroy() {
    this.timers.forEach(clearTimeout);
  }

  async run() {
    if (this.running) return { stored: 0 };
    this.running = true;
    try {
      const alerts = await this.prisma.jobAlert.findMany({
        where: { paused: false },
        select: { kind: true, title: true, location: true, company_key: true },
      });
      if (!alerts.length) return { stored: 0 };
      const jobs = [
        ...(await this.byField(alerts)),
        ...(await this.byCompany(alerts)),
      ];
      const stored = await this.discovery.indexJobs(jobs);
      this.logger.log(
        `Alert backfill: ${jobs.length} found, ${stored} indexed`,
      );
      // Match right away rather than at the next tick.
      await this.matcher.scan();
      return { stored };
    } catch (err) {
      this.logger.warn(`Alert backfill failed: ${String(err)}`);
      return { stored: 0 };
    } finally {
      this.running = false;
    }
  }

  private async byField(
    alerts: { kind: string; title: string | null; location: string | null }[],
  ): Promise<NormalizedJob[]> {
    const field = alerts.filter((a) => a.kind === 'FIELD' && a.title);
    if (!field.length) return [];
    const titles = [...new Set(field.map((a) => a.title!.trim()))].slice(
      0,
      MAX_TITLES,
    );
    const locations = [
      ...new Set(field.map((a) => a.location?.trim()).filter(Boolean)),
    ].slice(0, 5) as string[];
    const query = {
      titles,
      locations,
      countries: [],
      remoteTypes: ['any' as const],
      jobTypes: [],
      industries: [],
      yearsExperience: null,
      willingToRelocate: true,
      visaSponsorshipRequired: false,
    };
    const [feeds, boards] = await Promise.all([
      this.feeds.discoverDetailed(query).then((r) => r.jobs),
      this.boards.discover(query),
    ]);
    return [...feeds, ...boards];
  }

  // Followed companies whose ATS board we already know from earlier searches.
  // ponytail: a company never seen on Greenhouse/Lever/Ashby only gets jobs from searches and feeds.
  private async byCompany(
    alerts: { kind: string; company_key: string | null }[],
  ): Promise<NormalizedJob[]> {
    const keys = new Set(
      alerts
        .filter((a) => a.kind === 'COMPANY' && a.company_key)
        .map((a) => a.company_key!),
    );
    if (!keys.size) return [];
    const boards = (await this.boards.knownBoards(2000))
      .filter((b) => keys.has(normalizeCompany(b.company).key))
      .slice(0, MAX_COMPANY_BOARDS);
    const found: NormalizedJob[] = [];
    for (const b of boards) {
      try {
        found.push(...(await this.boards.fetchBoard(b)));
      } catch (err) {
        this.logger.warn(`Board ${b.source}/${b.slug}: ${String(err)}`);
      }
    }
    return found;
  }
}
