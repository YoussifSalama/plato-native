import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { JobSource } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ExtensionPrincipal } from './extension.service';
import { extensionProvider, policyFor } from './provider-policy';
import { toMatchPercent } from '../discovery/discovery-run.helpers';

export const DISCOVERY_MATCHES = 'DISCOVERY_MATCHES';
export interface MatchEngine {
  getMatches(
    jobSeekerId: string,
    o: { skip?: number; take?: number; shortlistedOnly?: boolean; filters?: Record<string, unknown> },
  ): Promise<{ total: number; items: any[] }>;
  referenceScore(jobSeekerId: string): Promise<number | null>;
  // the web sidebar's live count per search (thread): the panel shows the same number
  openMatchCounts?(jobSeekerId: string, threadIds: string[]): Promise<Map<string, number>>;
}

const OBJECT_ID = /^[0-9a-f]{24}$/;
const MAX_SEARCHES = 100;
// Same vocabulary as the web's discovered-jobs query.
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
export const jobsQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).optional(),
  take: z.coerce.number().int().min(1).max(50).optional(),
  sort: z.enum(['best', 'newest', 'salary', 'company']).optional(),
  q: z.string().max(100).optional(),
  source: z.enum(JobSource).optional(),
  remoteType: z.enum(['REMOTE', 'HYBRID', 'ONSITE']).optional(),
  jobType: z.enum(['full', 'part', 'contract', 'intern', 'temporary']).optional(),
  level: z.enum(['junior', 'mid', 'senior']).optional(),
  location: z.string().max(100).optional(),
  salaryMin: z.coerce.number().int().min(0).optional(),
  hasSalary: bool.optional(),
  acceptsCountry: z.string().min(2).max(60).optional(),
  postedWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  // ids to list first (the ones already ticked), comma-separated
  first: z.string().max(50 * 25).optional(),
  // only the jobs the seeker added from the Plato web app
  fromPlato: bool.optional(),
});
export type JobsQuery = z.infer<typeof jobsQuerySchema>;

@Injectable()
export class SearchesService {
  constructor(
    private readonly prisma: PrismaService,
    // the web's match engine, provided by ExtensionModule (a token, so specs need not load the discovery stack)
    @Inject(DISCOVERY_MATCHES) private readonly discovery: MatchEngine,
  ) {}

  /**
   * The web's searches, one per chat thread like its sidebar (its newest run stands for it; the thread's jobs are
   * every run's), with the same title and live count. Searches holding jobs the seeker added from the web come
   * first (that is what they want to apply to), then newest. Featured only earns a tag. The sort is stable.
   */
  async list(jobSeekerId: string) {
    const [allRuns, queued] = await Promise.all([
      this.prisma.discoveryRun.findMany({
        where: { job_seeker_id: jobSeekerId },
        orderBy: { started_at: 'desc' },
        take: MAX_SEARCHES,
        include: { thread: { select: { title: true } } },
      }),
      this.prisma.jobSeekerJobMatch.findMany({
        where: { job_seeker_id: jobSeekerId, extension_queued: true },
        select: { discovery_run_id: true, discovery_run_ids: true },
        take: 200,
      }),
    ]);
    const runs = allRuns.filter((r, i) => !r.thread_id || allRuns.findIndex((x) => x.thread_id === r.thread_id) === i);
    const threadRuns = (r: (typeof allRuns)[number]) => (r.thread_id ? allRuns.filter((x) => x.thread_id === r.thread_id).map((x) => x.id) : [r.id]);
    const queuedIn = (ids: string[]) =>
      queued.filter((m) => ids.includes(m.discovery_run_id ?? '') || m.discovery_run_ids.some((id) => ids.includes(id))).length;
    const threadIds = runs.flatMap((r) => (r.thread_id ? [r.thread_id] : []));
    const live = (await this.discovery.openMatchCounts?.(jobSeekerId, threadIds).catch(() => null)) ?? new Map<string, number>();
    return runs
      .map((r) => {
        const q = (r.query ?? {}) as {
          requestedTitles?: string[];
          titles?: string[];
          locations?: string[];
          remoteTypes?: string[];
        };
        return {
          id: r.id,
          thread_id: r.thread_id ?? null, // "Open in extension" on the web names the thread
          // the web's name for it: the thread's title, else every title asked for
          title: (r.thread?.title?.replace(/ search$/i, '') || (q.requestedTitles?.length ? q.requestedTitles : q.titles ?? []).join(', ')) || 'Search',
          locations: (q.locations ?? []).slice(0, 3),
          remote: q.remoteTypes?.[0] ?? null,
          job_count: (r.thread_id && live.get(r.thread_id)) ?? r.matched,
          featured: r.featured === true,
          queued: queuedIn(threadRuns(r)),
          created_at: r.started_at,
        };
      })
      .sort((a, b) => Number(b.queued > 0) - Number(a.queued > 0));
  }

  /**
   * The jobs of one search, filtered / sorted / paged on the SERVER with the same rules as the
   * web's Jobs page (DiscoveryService.getMatches), so a seeker picks exactly what they want.
   */
  async jobs(jobSeekerId: string, runId: string, query: JobsQuery = {}) {
    if (!OBJECT_ID.test(runId)) throw new BadRequestException('Invalid id');
    const run = await this.prisma.discoveryRun.findFirst({
      where: { id: runId, job_seeker_id: jobSeekerId },
      select: { id: true, thread_id: true },
    });
    if (!run) throw new NotFoundException('Search not found');
    // A search is the web's thread: its jobs come from every run in it, like the web's list.
    const runIds = run.thread_id
      ? (await this.prisma.discoveryRun.findMany({ where: { job_seeker_id: jobSeekerId, thread_id: run.thread_id }, select: { id: true } })).map((r) => r.id)
      : [runId];
    const { skip = 0, take = 8, first, fromPlato, ...filters } = query;
    // Jobs the seeker already ticked come first, on every page count, then the rest in the chosen order.
    // "From Plato": just the jobs added on the web, nothing else.
    const firstIds = fromPlato
      ? await this.queuedOf(jobSeekerId, runIds)
      : (first ?? '').split(',').filter((x) => OBJECT_ID.test(x)).slice(0, 50);
    const pinnedAll = firstIds.length
      ? (
          await this.prisma.jobSeekerJobMatch.findMany({
            where: { job_seeker_id: jobSeekerId, job_id: { in: firstIds } },
            include: { job: { include: { applications: { where: { job_seeker_id: jobSeekerId }, select: { status: true } } } } },
          })
        ).sort((a, b) => firstIds.indexOf(a.job_id) - firstIds.indexOf(b.job_id))
      : [];
    const pinned = pinnedAll.slice(skip, skip + take);
    const [reference, rest] = await Promise.all([
      this.discovery.referenceScore(jobSeekerId), // same 0-100 scale as the web's cards
      fromPlato
        ? { total: 0, items: [] }
        : this.discovery.getMatches(jobSeekerId, {
      skip: Math.max(0, skip - pinnedAll.length),
      take: Math.max(0, take - pinned.length),
      shortlistedOnly: true, // same slice the web shows for a search
            filters: { ...filters, tab: 'discover', runIds, ...(firstIds.length && { excludeJobIds: firstIds }) },
          }),
    ]);
    const total = rest.total + pinnedAll.length;
    const items = [...pinned, ...(take - pinned.length > 0 ? rest.items : [])];
    const rows = items.map((m: any) => {
      const job = m.job;
      const source = extensionProvider(job);
      // Plato is on it now = not pickable. Sent = pickable again, flagged (the seeker decides; owner, 2026-11-18).
      const taken = (job.applications ?? []).some((a: any) => !['FAILED', 'SKIPPED', 'EXPIRED', 'SUBMITTED'].includes(a.status));
      const applied = (job.applications ?? []).some((a: any) => a.status === 'SUBMITTED');
      return {
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        source: job.source,
        site: source ?? null, // the site Plato fills (Greenhouse, Lever…), when it differs from the board
        match: m.match_percent ?? toMatchPercent(m.match_score, reference),
        queued: m.extension_queued === true, // added from the web: the wizard pre-ticks these
        // Only jobs whose site Plato may fill, and not in Plato's hands right now.
        applyable: !taken && !!source && policyFor(source) === 'FILL_ONLY',
        applied, // marked as sent before: picking it sends reapply
      };
    });
    return {
      total,
      items: rows,
      // first page only: the source filter's options, and every job queued from the web (any page) to pre-tick
      sources: skip === 0 ? await this.sourcesOf(jobSeekerId, runIds) : undefined,
      queued: skip === 0 ? await this.queuedOf(jobSeekerId, runIds) : undefined,
    };
  }

  /** Ids queued from the web for this search whose site Plato may fill: the wizard pre-ticks them. */
  private async queuedOf(jobSeekerId: string, runIds: string[]) {
    const rows = await this.prisma.jobSeekerJobMatch.findMany({
      where: {
        job_seeker_id: jobSeekerId,
        extension_queued: true,
        OR: [{ discovery_run_ids: { hasSome: runIds } }, { discovery_run_id: { in: runIds } }],
      },
      select: { job: { select: { id: true, source: true, url: true, apply_url: true } } },
      take: 50,
    });
    return rows
      .filter(({ job }) => {
        const src = extensionProvider(job);
        return !!src && policyFor(src) === 'FILL_ONLY';
      })
      .map(({ job }) => job.id);
  }

  /** Which boards this search's jobs came from (for the Source filter). */
  private async sourcesOf(jobSeekerId: string, runIds: string[]) {
    const rows = await this.prisma.jobSeekerJobMatch.findMany({
      where: {
        job_seeker_id: jobSeekerId,
        shortlisted: true,
        OR: [{ discovery_run_ids: { hasSome: runIds } }, { discovery_run_id: { in: runIds } }],
      },
      select: { job: { select: { source: true } } },
      take: 2000,
    });
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.job.source, (counts.get(r.job.source) ?? 0) + 1);
    return [...counts].map(([value, count]) => ({ value, count })).sort((x, y) => y.count - x.count);
  }

  async setFeatured(jobSeekerId: string, runId: string, featured: boolean) {
    if (!OBJECT_ID.test(runId)) throw new BadRequestException('Invalid id');
    const r = await this.prisma.discoveryRun.updateMany({
      where: { id: runId, job_seeker_id: jobSeekerId },
      data: { featured },
    });
    if (!r.count) throw new NotFoundException('Search not found');
    return { id: runId, featured };
  }

  async recordConsent(
    p: ExtensionPrincipal,
    c: { decision: 'allow' | 'decline'; reason?: string; jobs: number; tabs: number },
  ) {
    const seeker = await this.prisma.jobSeeker.findUnique({
      where: { id: p.jobSeekerId },
      select: { user_id: true },
    });
    await this.prisma.usageEvent.create({
      data: {
        user_id: seeker?.user_id ?? null,
        feature: 'extension.consent',
        meta: { ...c, device_id: p.deviceId },
      },
    });
    return { ok: true };
  }
}
