import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizeCompany } from '../discovery/company';
import { PrismaService } from '../prisma/prisma.service';
import {
  type CatalogEntry,
  type CatalogSource,
  entriesFromJobs,
  entriesFromSheet,
  mergeSources,
  parseCsv,
  tierOf,
} from './company-catalog';

const EVERY_MS = 6 * 3_600_000;
// The curated sheet ships with the code; replace the file and restart to update it (idempotent).
const SHEET = () =>
  process.env.COMPANY_SOURCES_CSV ??
  join(process.cwd(), 'data', 'company_sources.csv');
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Keeps the "to follow" catalogue (FOLLOWING.md 2.1) filled: the curated sheet on boot, then every 6 h the job boards
// our searches found and the companies seekers follow, with follower counts and crawl tiers. Writes only
// company_sources. The crawler (FOLLOWING.md 2.2) reads it.
@Injectable()
export class CompanyCatalogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CompanyCatalogService.name);
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.INSIGHTS_JOBS === 'off') return;
    const first = setTimeout(() => void this.refresh(true), 30_000);
    // the sheet is re-read every pass (idempotent), so an updated file lands without a restart
    const loop = setInterval(() => void this.refresh(true), EVERY_MS);
    first.unref();
    loop.unref();
    this.timers.push(first, loop);
  }

  onModuleDestroy() {
    this.timers.forEach(clearTimeout);
  }

  async refresh(withSheet: boolean) {
    if (this.running) return;
    this.running = true;
    try {
      const sheet = withSheet ? await this.importSheet() : 0;
      const auto = await this.attachFromIndex();
      const followed = await this.syncFollowers();
      this.logger.log(
        `catalogue: ${sheet} from the sheet, ${auto} boards from the index, ${followed} followed companies`,
      );
    } catch (e) {
      this.logger.warn(
        `catalogue refresh failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      this.running = false;
    }
  }

  /** The curated sheet: name and website win; aliases, countries and sources are merged in. */
  async importSheet(path = SHEET()) {
    if (!existsSync(path)) return 0;
    const entries = entriesFromSheet(parseCsv(readFileSync(path, 'utf8')));
    for (const e of entries) await this.upsert(e, 'sheet');
    return entries.length;
  }

  /** Job boards (Greenhouse, Lever, Ashby, Workable) behind jobs already in the index, attached as unverified sources. */
  async attachFromIndex() {
    const jobs = await this.prisma.job.findMany({
      where: { source: { in: ['GREENHOUSE', 'LEVER', 'ASHBY', 'WORKABLE'] } },
      select: {
        source: true,
        url: true,
        apply_url: true,
        company: true,
        company_url: true,
      },
      orderBy: { updated_at: 'desc' },
      take: 8000,
    });
    const entries = entriesFromJobs(jobs);
    for (const e of entries) await this.upsert(e, 'auto');
    return entries.length;
  }

  /** Followed companies: in the catalogue (added if missing), with their follower count and crawl tier. */
  async syncFollowers() {
    const alerts = await this.prisma.jobAlert.findMany({
      where: { kind: 'COMPANY', paused: false },
      select: { company: true, company_key: true },
    });
    const count = new Map<string, { n: number; name: string }>();
    for (const a of alerts) {
      const key = a.company_key ?? normalizeCompany(a.company).key;
      if (!key) continue;
      const hit = count.get(key);
      count.set(key, {
        n: (hit?.n ?? 0) + 1,
        name: hit?.name ?? a.company ?? key,
      });
    }
    for (const [key, { name }] of count)
      await this.upsert(
        {
          company_key: key,
          name,
          aliases: [],
          countries: [],
          website: null,
          sources: [],
        },
        'seeker',
      );
    const all = await this.prisma.companySource.findMany({
      select: {
        id: true,
        company_key: true,
        followers: true,
        tier: true,
        last_new_job_at: true,
      },
    });
    for (const c of all) {
      const followers = count.get(c.company_key)?.n ?? 0;
      const tier = tierOf(followers, c.last_new_job_at);
      if (followers !== c.followers || tier !== c.tier)
        await this.prisma.companySource.update({
          where: { id: c.id },
          data: { followers, tier },
        });
    }
    return count.size;
  }

  private async upsert(e: CatalogEntry, by: 'sheet' | 'auto' | 'seeker') {
    const old = await this.prisma.companySource.findUnique({
      where: { company_key: e.company_key },
    });
    if (!old) {
      await this.prisma.companySource.create({
        data: {
          company_key: e.company_key,
          name: e.name,
          aliases: e.aliases,
          countries: e.countries,
          website: e.website,
          sources: e.sources as unknown as Prisma.InputJsonValue,
          added_by: by,
        },
      });
      return;
    }
    const sources = mergeSources(
      (old.sources as unknown as CatalogSource[]) ?? [],
      e.sources,
    );
    await this.prisma.companySource.update({
      where: { id: old.id },
      data: {
        // the sheet is curated: its name and website win; others only fill gaps
        name: by === 'sheet' ? e.name : old.name,
        website:
          by === 'sheet'
            ? (e.website ?? old.website)
            : (old.website ?? e.website),
        aliases: [...new Set([...old.aliases, ...e.aliases])],
        countries: [...new Set([...old.countries, ...e.countries])],
        sources: sources as unknown as Prisma.InputJsonValue,
        ...(by === 'sheet' &&
          old.added_by !== 'sheet' && { added_by: 'sheet' }),
      },
    });
  }

  /** Catalogue companies whose name or alias contains the text (nothing typed: the most followed), for the follow box. */
  async search(term: string, limit = 8) {
    const t = term.trim();
    const rows = (await this.prisma.companySource
      .findRaw({
        filter: t
          ? {
              $or: [
                { name: { $regex: escape(t), $options: 'i' } },
                { aliases: { $regex: escape(t), $options: 'i' } },
              ],
            }
          : { added_by: 'sheet' },
        options: {
          projection: { company_key: 1, name: 1, website: 1, followers: 1 },
          sort: { followers: -1, name: 1 },
          limit,
        },
      })
      .catch(() => [])) as unknown as {
      company_key: string;
      name: string;
      website?: string | null;
      followers?: number;
    }[];
    return rows.map((r) => ({
      key: r.company_key,
      name: r.name,
      website: r.website ?? null,
      followers: r.followers ?? 0,
    }));
  }

  /** Websites of catalogue companies, by company key (for logos where the index has none). */
  async websites(keys: string[]) {
    if (!keys.length) return new Map<string, string>();
    const rows = await this.prisma.companySource.findMany({
      where: { company_key: { in: keys }, website: { not: null } },
      select: { company_key: true, website: true },
    });
    return new Map(rows.map((r) => [r.company_key, r.website!]));
  }
}
