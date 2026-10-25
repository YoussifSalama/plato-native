import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  ChatRole,
  DiscoveryRun,
  JobRemoteType,
  Prisma,
  JobApplicationStatus,
  JobSource,
} from '@prisma/client';
import { effectiveApplySource } from '../apply/ats-detect';
import { PrismaService } from '../prisma/prisma.service';
import { JobSeekerPreferenceService } from '../user/job-seeker-preference.service';
import { AtsAggregatorAdapter } from './adapters/ats-aggregator.adapter';
import { LinkedInAdapter } from './adapters/linkedin.adapter';
import { BoardsAdapter } from './adapters/boards.adapter';
import { OpenFeedsAdapter } from './adapters/open-feeds.adapter';
import { DiscoveryQuery, NormalizedJob } from './adapters/types';
import {
  allSourcesFailed,
  applyAtsResult,
  applyBoardsResult,
  applyFeedsResult,
  applyIndexResult,
  applyLinkedInResult,
  initialProgress,
  isFresh,
  matchLabel,
  MAX_POSTING_AGE_DAYS,
  postedCutoff,
  remainingBudget,
  RunProgress,
  toMatchPercent,
} from './discovery-run.helpers';
import { LocalIndexAdapter } from './adapters/local-index.adapter';
import { PublicBoardsAdapter } from './adapters/public-boards.adapter';
import { buildJobSeekerSnapshot, residenceOf } from './job-seeker-snapshot';
import { MatchingService } from './matching.service';
import { buildDiscoveryQuery } from './query-builder';
import { DiscoveryQueryOverrides, mergeDiscoveryQuery } from './query-merge';
import { RunProgressBus } from './run-progress.bus';
import { NotificationsBus } from '../notifications/notifications.bus';
import { resolvePlaces } from './country-resolver';
import { countryName, resolveCountry } from './countries';
import { excludesCountry } from '../apply/eligibility';
import { companyDomain, normalizeCompany } from './company';
import { jobEligibility } from './job-eligibility';
import { recordUsage } from '../usage/usage';
import { creditAccount } from '../credits/credits';
import { affordableResults } from '../credits/credit-prices';
import { employmentOf, isBlueCollar, professionOf } from './classify';
import { dedupeJobs, dedupeKey } from './dedupe';
import { mergeTitles, planTitles } from './title-planner';
import { roleKey } from '../apply/eligibility';
import { runNotification } from '../notifications/notification-factory';
import {
  buildFacets,
  jobTypeWhere,
  levelOf,
  levelWhere,
  locationFacetValues,
  locationLabel,
  locationWhere,
  type JobTypeKey,
  type LevelKey,
} from './match-facets';

export type MatchTab = 'discover' | 'saved' | 'applied' | 'recommended';
export type MatchSort = 'best' | 'newest' | 'salary' | 'company';
export type MatchLevel = LevelKey;

export interface MatchFilters {
  runId?: string;
  runIds?: string[];
  tab?: MatchTab;
  sort?: MatchSort;
  q?: string;
  remoteType?: JobRemoteType;
  jobType?: JobTypeKey;
  source?: JobSource;
  location?: string;
  level?: MatchLevel;
  salaryMin?: number;
  hasSalary?: boolean;
  // Country (code or name) the seeker lives in: hide postings that only take applicants from elsewhere.
  acceptsCountry?: string;
  // Pay currency, e.g. "USD,EUR": jobs that pay in foreign currency for a seeker in Egypt.
  salaryCurrency?: string;
  // Filled in by getMatches from acceptsCountry; never set by callers.
  excludeJobIds?: string[];
  // Only postings newer than N days; discover/recommended always cap at
  // MAX_POSTING_AGE_DAYS even when unset.
  postedWithinDays?: number;
}

export function sortOrder(
  sort: MatchSort = 'best',
): Prisma.JobSeekerJobMatchOrderByWithRelationInput[] {
  switch (sort) {
    case 'newest':
      return [{ job: { posted_at: 'desc' } }, { match_score: 'desc' }];
    case 'salary':
      return [{ job: { salary_max: 'desc' } }, { match_score: 'desc' }];
    case 'company':
      return [{ job: { company: 'asc' } }, { match_score: 'desc' }];
    default:
      return [{ match_score: 'desc' }, { discovered_at: 'desc' }];
  }
}

@Injectable()
export class DiscoveryService implements OnModuleInit {
  private readonly logger = new Logger(DiscoveryService.name);

  // Runs execute in-process, so a restart orphans anything RUNNING. Fail
  // them on boot rather than leaving threads stuck in "searching".
  async onModuleInit() {
    await this.backfillMatchFields();
    const { count } = await this.prisma.discoveryRun.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'FAILED',
        error: 'Interrupted by a server restart — start a new search.',
        finished_at: new Date(),
      },
    });
    if (count) this.logger.warn(`Marked ${count} orphaned run(s) as FAILED`);
  }

  // Mongo documents written before a field was added simply lack the key, and
  // Prisma filters like `hidden: false` don't match a missing key. Fill the
  // defaults in once so every filter sees the same shape. Idempotent.
  private async backfillMatchFields() {
    const set = (field: string, value: boolean | null) =>
      this.prisma.$runCommandRaw({
        update: 'job_seeker_job_matches',
        updates: [
          {
            q: { [field]: { $exists: false } },
            u: { $set: { [field]: value } },
            multi: true,
          },
        ],
      }) as Promise<{ nModified?: number }>;
    const results = await Promise.all([
      set('hidden', false),
      set('saved', false),
      set('saved_at', null),
      this.prisma.$runCommandRaw({
        update: 'job_seeker_job_matches',
        updates: [
          {
            q: { discovery_run_ids: { $exists: false } },
            u: [
              {
                $set: {
                  discovery_run_ids: {
                    $cond: [
                      { $ifNull: ['$discovery_run_id', false] },
                      ['$discovery_run_id'],
                      [],
                    ],
                  },
                },
              },
            ],
            multi: true,
          },
        ],
      }) as Promise<{ nModified?: number }>,
    ]);
    const modified = results.reduce((n, r) => n + (r.nModified ?? 0), 0);
    if (modified) this.logger.log(`Backfilled ${modified} match field(s)`);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly preferenceService: JobSeekerPreferenceService,
    private readonly atsAdapter: AtsAggregatorAdapter,
    private readonly linkedinAdapter: LinkedInAdapter,
    private readonly boardsAdapter: BoardsAdapter,
    private readonly feedsAdapter: OpenFeedsAdapter,
    private readonly matchingService: MatchingService,
    private readonly bus: RunProgressBus,
    private readonly localIndex: LocalIndexAdapter,
    private readonly publicBoards: PublicBoardsAdapter,
    private readonly notifications: NotificationsBus,
  ) {}

  // ponytail: read straight from env — DiscoveryService has no ConfigService today.
  private readonly titlePlannerModel =
    process.env.TITLE_PLANNER_MODEL ?? 'gpt-4.1-mini';

  async buildQuery(
    jobSeekerId: string,
    overrides?: DiscoveryQueryOverrides,
  ): Promise<DiscoveryQuery> {
    const snapshot = await buildJobSeekerSnapshot(
      this.prisma,
      this.preferenceService,
      jobSeekerId,
    );
    let query = mergeDiscoveryQuery(buildDiscoveryQuery(snapshot), overrides);
    // Places the rules can't place ("Kitchener", "Lyon") go to the model, so
    // country detection covers the world, not just the names we listed.
    // An explicit country list from chat is never second-guessed.
    const unplaced = query.locations.filter((l) => !resolveCountry(l));
    if (unplaced.length && !overrides?.countries?.length) {
      const found = await resolvePlaces(unplaced, this.titlePlannerModel);
      const extra = [...new Set(found.values())].filter(
        (c) => !query.countries.includes(c),
      );
      if (extra.length)
        query = { ...query, countries: [...query.countries, ...extra] };
    }
    // What was asked names the search; what gets searched is planned from
    // the seeker's whole background, even when they named a single title.
    const requestedTitles = query.titles;
    if (overrides?.strictTitles)
      return {
        ...query,
        titles: mergeTitles(requestedTitles),
        requestedTitles,
      };
    const titlePlan = await planTitles(this.titlePlannerModel, {
      requested: requestedTitles,
      preferenceRoles: snapshot.roles,
      skills: snapshot.skills,
      seniority: snapshot.seniority,
      yearsExperience: snapshot.yearsExperience,
      experiences: snapshot.experiences,
    });
    this.logger.log(
      `Search titles for [${requestedTitles.join(', ')}]: ${titlePlan.map((t) => t.title).join(' | ')}`,
    );
    return {
      ...query,
      titles: titlePlan.map((t) => t.title),
      requestedTitles,
      titlePlan,
    };
  }

  // One search at a time per thread. The lock covers the window between the
  // RUNNING check and the row insert, which parallel tool calls otherwise race.
  // ponytail: in-memory lock — fine for one API instance.
  private readonly starting = new Set<string>();

  async startRunForThread(
    jobSeekerId: string,
    overrides: DiscoveryQueryOverrides | undefined,
    threadId: string,
  ): Promise<{ run: DiscoveryRun; reused: boolean }> {
    if (this.starting.has(threadId)) {
      await new Promise((r) => setTimeout(r, 300));
    }
    const inFlight = await this.latestRunForThread(threadId);
    if (inFlight?.status === 'RUNNING') return { run: inFlight, reused: true };
    this.starting.add(threadId);
    try {
      const run = await this.startRun(jobSeekerId, overrides, threadId);
      return { run, reused: false };
    } finally {
      this.starting.delete(threadId);
    }
  }

  // Creates the run row and returns immediately; adapters execute in the
  // background and the client polls getRun().
  // ponytail: in-process fire-and-forget — move to BullMQ if we ever run >1 instance.
  async startRun(
    jobSeekerId: string,
    overrides?: DiscoveryQueryOverrides,
    threadId?: string,
  ) {
    const query = await this.buildQuery(jobSeekerId, overrides);
    const run = await this.prisma.discoveryRun.create({
      data: {
        job_seeker_id: jobSeekerId,
        thread_id: threadId ?? null,
        query: query as unknown as Prisma.InputJsonValue,
        progress: initialProgress(
          this.boardsAdapter.sourcesFor(query),
          this.feedsAdapter.sourcesFor(query),
        ) as unknown as Prisma.InputJsonValue,
      },
    });
    void this.executeRun(run.id, jobSeekerId, query, threadId).catch((err) =>
      this.logger.error(`Run ${run.id} crashed`, err),
    );
    return run;
  }

  // The chat and the visual journey are one system: the run's conclusion
  // lands in the thread as Plato speaking, not just as a status flag.
  private async narrate(threadId: string | undefined, content: string) {
    if (!threadId) return;
    await this.prisma.chatMessage.create({
      data: { thread_id: threadId, role: ChatRole.ASSISTANT, content },
    });
  }

  // Paid boards only as far as the seeker's Plato tokens go (free sources always run).
  private async affordableBudget(
    jobSeekerId: string,
    wanted: number,
    threadId?: string,
  ) {
    if (wanted === 0) return 0;
    const acc = await this.prisma.jobSeeker
      .findUnique({ where: { id: jobSeekerId }, select: { user_id: true } })
      .then((seeker) => (seeker ? creditAccount(seeker.user_id) : null))
      .catch((e: unknown) => {
        // metering must not break the search: on a credits error the run keeps its budget
        this.logger.warn(`credits unavailable: ${String(e)}`);
        return null;
      });
    if (!acc) return wanted;
    const budget = affordableResults(acc.balance, wanted);
    if (budget < wanted) {
      this.logger.log(
        `run budget ${wanted} -> ${budget} (balance ${acc.balance} tokens)`,
      );
      await this.narrate(
        threadId,
        budget === 0
          ? 'You are out of Plato tokens for this month, so I searched the free sources only. The paid job boards come back when your tokens refill.'
          : 'Your remaining Plato tokens cover part of a full job-board search, so I searched fewer paid boards this time.',
      );
    }
    return budget;
  }

  private async executeRun(
    runId: string,
    jobSeekerId: string,
    query: DiscoveryQuery,
    threadId?: string,
  ) {
    let progress = initialProgress(
      this.boardsAdapter.sourcesFor(query),
      this.feedsAdapter.sourcesFor(query),
    );
    const publish = async (next: Partial<RunProgress>) => {
      progress = { ...progress, ...next };
      await this.prisma.discoveryRun.update({
        where: { id: runId },
        data: { progress: progress as unknown as Prisma.InputJsonValue },
      });
      this.bus.publish(runId, progress);
    };

    try {
      // Phase 0: our own index (jobs crawled in the last 7 days). Instant, and
      // whatever it covers is subtracted from the Apify budget.
      const indexResult = await this.localIndex.discover(query).then(
        (v) => ({ status: 'fulfilled', value: v }) as const,
        (reason: unknown) => ({ status: 'rejected', reason }) as const,
      );
      await publish(applyIndexResult(progress, indexResult));
      const indexJobs =
        indexResult.status === 'fulfilled' ? indexResult.value : [];
      const budget = await this.affordableBudget(
        jobSeekerId,
        remainingBudget(indexJobs.length),
        threadId,
      );
      const remoteQuery: DiscoveryQuery = { ...query, budget };

      const [ats, linkedin, boards, feeds] = await Promise.allSettled([
        // ATS jobs: free public endpoints + the Apify actor, as one phase.
        Promise.allSettled([
          this.publicBoards.discover(remoteQuery),
          this.atsAdapter.discover(remoteQuery),
        ])
          .then((parts) => {
            if (parts.every((r) => r.status === 'rejected'))
              throw (parts[0] as PromiseRejectedResult).reason;
            for (const r of parts)
              if (r.status === 'rejected')
                this.logger.warn(`ATS source failed: ${String(r.reason)}`);
            return parts.flatMap((r) =>
              r.status === 'fulfilled' ? r.value : [],
            );
          })
          .then(
            async (v) => {
              await publish(
                applyAtsResult(progress, { status: 'fulfilled', value: v }),
              );
              return v;
            },
            async (reason: unknown) => {
              await publish(
                applyAtsResult(progress, { status: 'rejected', reason }),
              );
              throw reason;
            },
          ),
        this.linkedinAdapter.discover(remoteQuery).then(
          async (v) => {
            await publish(
              applyLinkedInResult(progress, { status: 'fulfilled', value: v }),
            );
            return v;
          },
          async (reason: unknown) => {
            await publish(
              applyLinkedInResult(progress, { status: 'rejected', reason }),
            );
            throw reason;
          },
        ),
        this.boardsAdapter.discoverDetailed(remoteQuery).then(
          async (v) => {
            await publish(
              applyBoardsResult(progress, { status: 'fulfilled', value: v }),
            );
            return v.jobs;
          },
          async (reason: unknown) => {
            await publish(
              applyBoardsResult(progress, { status: 'rejected', reason }),
            );
            throw reason;
          },
        ),
        // Free official feeds (Remotive, Jobicy, Remote OK, Himalayas, Jooble, Adzuna).
        this.feedsAdapter.discoverDetailed(remoteQuery).then(
          async (v) => {
            await publish(
              applyFeedsResult(progress, { status: 'fulfilled', value: v }),
            );
            return v.jobs;
          },
          async (reason: unknown) => {
            await publish(
              applyFeedsResult(progress, { status: 'rejected', reason }),
            );
            throw reason;
          },
        ),
      ]);
      const jobs = [
        ...indexJobs,
        ...[ats, linkedin, boards, feeds].flatMap((r) =>
          r.status === 'fulfilled' ? r.value : [],
        ),
      ];

      // Per-source health for every run: how many each source gave and whether it
      // failed. (What Apify charged is recorded separately, per actor run.)
      for (const [key, s] of Object.entries(progress.sources))
        recordUsage({
          feature: 'discovery.source',
          model: key,
          cost_usd: 0,
          meta: {
            runId,
            status: s.status,
            fetched: s.fetched,
            error: s.error ?? null,
          },
        });

      if (allSourcesFailed(progress)) {
        throw new Error('All job sources failed');
      }

      await publish({ stage: 'merging' });
      // Freshness cap: adapters are asked for recent postings, but reposts
      // and undated items slip through — drop them here, before persisting.
      const fresh = jobs.filter((j) => isFresh(j));
      if (fresh.length !== jobs.length)
        this.logger.log(
          `Run ${runId}: dropped ${jobs.length - fresh.length} posting(s) older than ${MAX_POSTING_AGE_DAYS}d`,
        );
      const matched = await this.persistJobs(jobSeekerId, runId, fresh);
      await publish({ stage: 'filtering', merged: matched });

      const snapshot = await buildJobSeekerSnapshot(
        this.prisma,
        this.preferenceService,
        jobSeekerId,
      );
      await this.matchingService.rankMatches(jobSeekerId, snapshot);
      const filtered = await this.prisma.jobSeekerJobMatch.count({
        where: { discovery_run_ids: { has: runId }, shortlisted: true },
      });
      await publish({ stage: 'ranking', filtered });
      // ponytail: ranking == BM25 order for now; AI re-rank of the shortlist plugs in here.
      await this.prisma.discoveryRun.update({
        where: { id: runId },
        data: {
          status: 'DONE',
          fetched: jobs.length,
          matched,
          finished_at: new Date(),
        },
      });
      await this.narrate(
        threadId,
        filtered
          ? `Done — I found ${filtered} jobs that match your profile across ${jobs.length} postings. Pick the ones you like and I'll handle the applications.`
          : `The search finished but nothing matched closely enough. Want me to broaden the titles or locations and try again?`,
      );
      await publish({ stage: 'done', ranked: filtered });
      await this.notifyRun(jobSeekerId, runId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.prisma.discoveryRun.update({
        where: { id: runId },
        data: { status: 'FAILED', error: message, finished_at: new Date() },
      });
      await this.narrate(
        threadId,
        `The search hit a problem (${message}). Say "try again" and I'll rerun it.`,
      );
      await publish({ stage: 'failed', error: message });
      await this.notifyRun(jobSeekerId, runId);
      throw err;
    }
  }

  // Seeker-wide signal (bell, toasts) that a search settled.
  private async notifyRun(jobSeekerId: string, runId: string) {
    const run = await this.prisma.discoveryRun.findUnique({
      where: { id: runId },
    });
    if (run) this.notifications.publish(jobSeekerId, runNotification(run));
  }

  progressStream(runId: string) {
    return this.bus.stream(runId);
  }

  private async persistJobs(
    jobSeekerId: string,
    runId: string,
    jobs: NormalizedJob[],
  ) {
    let matched = 0;
    const seen = new Set<string>();
    // Professional work only, and one posting once even when several boards carry it.
    const professional = jobs.filter((j) => !isBlueCollar(j.title));
    if (professional.length !== jobs.length)
      this.logger.log(
        `Run ${runId}: dropped ${jobs.length - professional.length} manual-labour posting(s)`,
      );
    const unique = dedupeJobs(professional);
    if (unique.length !== professional.length)
      this.logger.log(
        `Run ${runId}: merged ${professional.length - unique.length} duplicate posting(s) across boards`,
      );
    for (const raw of unique) {
      // One company, one spelling, from the first time we see it.
      const job = {
        ...raw,
        company: normalizeCompany(raw.company).name || raw.company,
        profession: professionOf(raw.title),
        employment: employmentOf(raw.title, raw.job_type),
        dedupe_key: dedupeKey(raw),
      };
      // One posting, one row: the same job can arrive from two adapters with
      // different ids (Apify's id vs the ATS's own), but the URL is the same.
      const key = `${job.source}|${job.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // One malformed posting must not sink the whole run: skip it, keep going.
      try {
        const sameUrl = await this.prisma.job.findFirst({
          where: { source: job.source, url: job.url },
          select: { id: true },
        });
        // Already stored from another board (same company, title and place,
        // posted within two weeks)? Use that row instead of a second copy.
        const twin = sameUrl
          ? null
          : await this.prisma.job.findFirst({
              where: {
                dedupe_key: job.dedupe_key,
                expired_at: null,
                OR: [
                  { posted_at: null },
                  {
                    posted_at: {
                      gte: new Date(
                        (job.posted_at?.getTime() ?? Date.now()) -
                          14 * 86_400_000,
                      ),
                      lte: new Date(
                        (job.posted_at?.getTime() ?? Date.now()) +
                          14 * 86_400_000,
                      ),
                    },
                  },
                ],
              },
              select: { id: true },
            });
        const row = twin
          ? twin
          : sameUrl
            ? await this.prisma.job.update({
                where: { id: sameUrl.id },
                data: { ...job, external_id: undefined },
              })
            : await this.prisma.job.upsert({
                where: {
                  source_external_id: {
                    source: job.source,
                    external_id: job.external_id,
                  },
                },
                create: job,
                update: job,
              });
        await this.prisma.jobSeekerJobMatch.upsert({
          where: {
            job_seeker_id_job_id: {
              job_seeker_id: jobSeekerId,
              job_id: row.id,
            },
          },
          create: {
            job_seeker_id: jobSeekerId,
            job_id: row.id,
            discovery_run_id: runId,
            discovery_run_ids: [runId],
          },
          update: {
            discovery_run_id: runId,
            discovery_run_ids: { push: runId },
          },
        });
        matched++;
      } catch (err) {
        this.logger.warn(
          `Skipped ${job.source} job ${job.url}: ${err instanceof Error ? err.message.split('\n').slice(-2).join(' ') : String(err)}`,
        );
      }
    }
    return matched;
  }

  /**
   * A job link the seeker pasted: one Job row (source MANUAL, keyed by the URL) plus a shortlisted
   * match on the latest search, so the web list and the extension's search picker both show it.
   * ponytail: title/company come from the page <title> only; no scraping, no AI.
   */
  async addJobByUrl(jobSeekerId: string, rawUrl: string) {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') throw new BadRequestException('Only https links');
    let title = url.pathname.split('/').filter(Boolean).pop() ?? url.hostname;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'text/html' } });
      const t = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(await res.text())?.[1];
      if (t) title = t.replace(/\s+/g, ' ').trim();
    } catch {
      /* page unreachable: keep the slug */
    }
    const company = url.hostname.split('.')[0];
    const job = await this.prisma.job.upsert({
      where: { source_external_id: { source: 'MANUAL', external_id: url.href } },
      create: { source: 'MANUAL', external_id: url.href, title, company, url: url.href, apply_url: url.href },
      update: {},
    });
    const run = await this.prisma.discoveryRun.findFirst({ where: { job_seeker_id: jobSeekerId }, orderBy: { started_at: 'desc' }, select: { id: true } });
    const existing = await this.prisma.jobSeekerJobMatch.findFirst({ where: { job_seeker_id: jobSeekerId, job_id: job.id }, select: { id: true } });
    const match = existing
      ? await this.prisma.jobSeekerJobMatch.update({ where: { id: existing.id }, data: { shortlisted: true } })
      : await this.prisma.jobSeekerJobMatch.create({ data: { job_seeker_id: jobSeekerId, job_id: job.id, shortlisted: true, match_score: 0, ...(run && { discovery_run_id: run.id, discovery_run_ids: [run.id] }) } });
    return { job, match };
  }

  getRun(jobSeekerId: string, runId: string) {
    return this.prisma.discoveryRun.findFirst({
      where: { id: runId, job_seeker_id: jobSeekerId },
    });
  }

  listRuns(jobSeekerId: string, take = 20) {
    return this.prisma.discoveryRun.findMany({
      where: { job_seeker_id: jobSeekerId },
      orderBy: { started_at: 'desc' },
      take,
    });
  }

  /** Mark matches as queued for the extension. Only this seeker's own matches are touched. */
  async tagForExtension(jobSeekerId: string, jobIds: string[]) {
    const r = await this.prisma.jobSeekerJobMatch.updateMany({
      where: { job_seeker_id: jobSeekerId, job_id: { in: jobIds } },
      data: { extension_queued: true },
    });
    return { queued: r.count, jobIds }; // the web then puts them in the extension's queue (POST /extension/apply-batches)
  }

  latestRunForThread(threadId: string) {
    return this.prisma.discoveryRun.findFirst({
      where: { thread_id: threadId },
      orderBy: { started_at: 'desc' },
    });
  }

  // Dashboard: everything the seeker's home page shows, in one round trip.
  async statsForSeeker(jobSeekerId: string) {
    const since = new Date(Date.now() - 14 * 86_400_000);
    const [threads, runsByStatus, appsByStatus, reference, matches, runs] =
      await Promise.all([
        this.prisma.chatThread.count({ where: { job_seeker_id: jobSeekerId } }),
        this.prisma.discoveryRun.groupBy({
          by: ['status'],
          where: { job_seeker_id: jobSeekerId },
          _count: { _all: true },
        }),
        this.prisma.jobApplication.groupBy({
          by: ['status'],
          where: { job_seeker_id: jobSeekerId },
          _count: { _all: true },
        }),
        this.referenceScore(jobSeekerId),
        this.prisma.jobSeekerJobMatch.findMany({
          where: { job_seeker_id: jobSeekerId, shortlisted: true },
          select: {
            match_score: true,
            saved: true,
            hidden: true,
            job: {
              select: {
                title: true,
                company: true,
                location: true,
                source: true,
                remote_type: true,
                salary_max: true,
                salary_currency: true,
              },
            },
          },
          take: 5000,
        }),
        this.prisma.discoveryRun.findMany({
          where: { job_seeker_id: jobSeekerId },
          select: {
            id: true,
            thread_id: true,
            status: true,
            query: true,
            fetched: true,
            matched: true,
            progress: true,
            started_at: true,
            finished_at: true,
          },
          orderBy: { started_at: 'desc' },
          take: 100,
        }),
      ]);

    const count = <K>(keys: K[]) => {
      const m = new Map<K, number>();
      for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
      return m;
    };
    const top = <K>(m: Map<K, number>, n: number) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([key, value]) => ({ key, count: value }));
    const byStatus = <T extends { status: string; _count: { _all: number } }>(
      rows: T[],
      status: string,
    ) => rows.find((r) => r.status === status)?._count._all ?? 0;

    const pct = (score: number | null) => toMatchPercent(score, reference);
    const quality = { excellent: 0, strong: 0, other: 0 };
    for (const m of matches) {
      const p = pct(m.match_score);
      if (p >= 90) quality.excellent++;
      else if (p >= 75) quality.strong++;
      else quality.other++;
    }

    const usd = matches
      .map((m) => m.job)
      .filter((j) => j.salary_currency === 'USD' && j.salary_max)
      .map((j) => j.salary_max as number)
      .sort((a, b) => a - b);
    const median = usd.length ? usd[Math.floor(usd.length / 2)] : null;

    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(since.getTime() + (i + 1) * 86_400_000);
      return d.toISOString().slice(0, 10);
    });
    const activity = days.map((date) => ({ date, runs: 0, jobs: 0 }));
    for (const r of runs) {
      const date = r.started_at.toISOString().slice(0, 10);
      const day = activity.find((a) => a.date === date);
      if (day) {
        day.runs++;
        day.jobs += r.fetched;
      }
    }

    const titles = count(
      runs.flatMap(
        (r) => (r.query as { titles?: string[] } | null)?.titles ?? [],
      ),
    );

    return {
      threads,
      runs: {
        running: byStatus(runsByStatus, 'RUNNING'),
        done: byStatus(runsByStatus, 'DONE'),
        failed: byStatus(runsByStatus, 'FAILED'),
      },
      applications: {
        queued: byStatus(appsByStatus, 'QUEUED'),
        inProgress: byStatus(appsByStatus, 'IN_PROGRESS'),
        submitted: byStatus(appsByStatus, 'SUBMITTED'),
        failed: byStatus(appsByStatus, 'FAILED'),
        needsInput: byStatus(appsByStatus, 'NEEDS_INPUT'),
        expired: byStatus(appsByStatus, 'EXPIRED'),
        skipped: byStatus(appsByStatus, 'SKIPPED'),
      },
      shortlisted: matches.length,
      saved: matches.filter((m) => m.saved).length,
      hidden: matches.filter((m) => m.hidden).length,
      analyzed: runs.reduce((n, r) => n + r.fetched, 0),
      quality,
      bySource: Object.fromEntries(count(matches.map((m) => m.job.source))),
      byRemoteType: Object.fromEntries(
        count(matches.map((m) => m.job.remote_type)),
      ),
      levels: Object.fromEntries(
        count(matches.map((m) => levelOf(m.job.title))),
      ),
      topLocations: top(
        count(matches.flatMap((m) => locationFacetValues(m.job.location))),
        6,
      ).map((t) => ({ label: locationLabel(t.key), count: t.count })),
      topCompanies: top(count(matches.map((m) => m.job.company)), 6).map(
        (t) => ({ company: t.key, count: t.count }),
      ),
      topTitles: top(titles, 8).map((t) => ({ title: t.key, runs: t.count })),
      salary: { withSalary: usd.length, medianUsdMax: median },
      activity,
      recentRuns: runs.slice(0, 5).map((r) => ({
        id: r.id,
        thread_id: r.thread_id,
        status: r.status,
        titles: (r.query as { titles?: string[] } | null)?.titles ?? [],
        fetched: r.fetched,
        shortlisted:
          (r.progress as { filtered?: number | null } | null)?.filtered ??
          r.matched,
        started_at: r.started_at,
        seconds: r.finished_at
          ? Math.round(
              (r.finished_at.getTime() - r.started_at.getTime()) / 1000,
            )
          : null,
      })),
    };
  }

  async runIdsForThread(jobSeekerId: string, threadId: string) {
    const runs = await this.prisma.discoveryRun.findMany({
      where: { thread_id: threadId, job_seeker_id: jobSeekerId },
      select: { id: true },
    });
    return runs.map((r) => r.id);
  }

  runningForSeeker(jobSeekerId: string) {
    return this.prisma.discoveryRun.findMany({
      where: { job_seeker_id: jobSeekerId, status: 'RUNNING' },
      orderBy: { started_at: 'desc' },
      include: { thread: { select: { id: true, title: true } } },
    });
  }

  async getMatches(
    jobSeekerId: string,
    {
      skip = 0,
      take = 20,
      shortlistedOnly = true,
      filters = {},
    }: {
      skip?: number;
      take?: number;
      shortlistedOnly?: boolean;
      filters?: MatchFilters;
    } = {},
  ) {
    // Recommended = strong/excellent fits, relative to the reference score.
    const maxScore = await this.referenceScore(jobSeekerId);
    const where = this.matchWhere(
      jobSeekerId,
      await this.withCountryFilter(
        jobSeekerId,
        filters,
        shortlistedOnly,
        maxScore,
      ),
      shortlistedOnly,
      maxScore,
    );
    const [items, total] = await Promise.all([
      this.prisma.jobSeekerJobMatch.findMany({
        where,
        include: {
          job: {
            include: {
              applications: {
                where: { job_seeker_id: jobSeekerId },
                select: { id: true, status: true, error: true },
              },
            },
          },
        },
        orderBy: sortOrder(filters.sort),
        skip,
        take,
      }),
      this.prisma.jobSeekerJobMatch.count({ where }),
    ]);

    // TEMP DEBUG: why is the list empty? Remove after diagnosing.
    if (total === 0) {
      const c = (label: string, w: Prisma.JobSeekerJobMatchWhereInput) =>
        this.prisma.jobSeekerJobMatch
          .count({ where: w })
          .then((n) => this.logger.warn(`[empty-debug] ${label}: ${n}`));
      const { OR, job, ...rest } = where;
      const pool = { job_seeker_id: jobSeekerId, ...(OR ? { OR } : {}) };
      await Promise.all([
        c('pool (seeker + run ids)', pool),
        c('all', where),
        c('without shortlisted', { ...where, shortlisted: undefined }),
        c('without hidden', { ...where, hidden: undefined }),
        c('without job filters', { ...rest, ...(OR ? { OR } : {}) }),
        c('pool + job.expired_at null', { ...pool, job: { expired_at: null } }),
        c('pool + job.posted_at fresh', {
          ...pool,
          job: { posted_at: (job as Prisma.JobWhereInput).posted_at },
        }),
        c('pool + job.no active application', {
          ...pool,
          job: { applications: (job as Prisma.JobWhereInput).applications },
        }),
      ]);
    }

    // Where the seeker lives or can work, for the eligibility line on each card.
    const countries = await this.seekerCountryNames(jobSeekerId);
    return {
      total,
      items: items.map((m) => {
        const match_percent = toMatchPercent(m.match_score, maxScore);
        const { applications, ...rawJob } = m.job;
        const co = normalizeCompany(rawJob.company);
        // The source (board) stays on the row for apply routing and debugging;
        // the card shows the employer, its logo domain and eligibility.
        const job = {
          ...rawJob,
          company: co.name || rawJob.company,
          company_key: co.key,
          company_domain: companyDomain(rawJob.company_url),
          eligibility: jobEligibility(rawJob, countries),
        };
        return {
          ...m,
          job,
          match_percent,
          match_label: matchLabel(match_percent),
          application_status: applications[0]?.status ?? null,
          // Enough for the row to say what happened and link to the details.
          application_id: applications[0]?.id ?? null,
          application_error: applications[0]?.error ?? null,
        };
      }),
    };
  }

  private async seekerCountryNames(jobSeekerId: string): Promise<string[]> {
    const [seeker, prefs] = await Promise.all([
      this.prisma.jobSeeker.findUnique({
        where: { id: jobSeekerId },
        select: { location: true },
      }),
      this.preferenceService.get(jobSeekerId),
    ]);
    const home = residenceOf(seeker?.location);
    return [
      ...(home ? [countryName(home)] : []),
      ...(('work_authorization' in prefs && prefs.work_authorization) || []),
    ]
      .map((c) => c.toLowerCase().trim())
      .filter(Boolean);
  }

  // "Only ones that accept Egypt": posting restrictions live in the text, so
  // read the candidate postings and exclude the ones that rule the country out.
  // ponytail: scans up to 3000 postings per request; precompute at ingest if this gets slow.
  private async withCountryFilter(
    jobSeekerId: string,
    filters: MatchFilters,
    shortlistedOnly: boolean,
    maxScore: number | null,
  ): Promise<MatchFilters> {
    const code =
      filters.acceptsCountry && resolveCountry(filters.acceptsCountry);
    if (!code) return filters;
    const pool = await this.prisma.jobSeekerJobMatch.findMany({
      where: this.matchWhere(
        jobSeekerId,
        { ...filters, acceptsCountry: undefined },
        shortlistedOnly,
        maxScore,
      ),
      select: { job: { select: { id: true, title: true, description: true } } },
      take: 3000,
    });
    const names = [countryName(code).toLowerCase()];
    return {
      ...filters,
      excludeJobIds: pool
        .filter((m) => excludesCountry(m.job, names))
        .map((m) => m.job.id),
    };
  }

  // Match % is relative to a reference score. The single best score is a
  // poor reference (one outlier makes everything else look weak), so use the
  // 90th percentile of the seeker's shortlist instead.
  async referenceScore(jobSeekerId: string): Promise<number | null> {
    const rows = await this.prisma.jobSeekerJobMatch.findMany({
      where: {
        job_seeker_id: jobSeekerId,
        shortlisted: true,
        match_score: { gt: 0 },
      },
      select: { match_score: true },
      orderBy: { match_score: 'desc' },
      take: 5000,
    });
    if (!rows.length) return null;
    const idx = Math.floor(rows.length * 0.1);
    return rows[Math.min(idx, rows.length - 1)].match_score;
  }

  private matchWhere(
    jobSeekerId: string,
    filters: MatchFilters,
    shortlistedOnly: boolean,
    maxScore: number | null = null,
  ): Prisma.JobSeekerJobMatchWhereInput {
    const tab = filters.tab ?? 'discover';
    const job: Prisma.JobWhereInput = {
      ...(filters.remoteType ? { remote_type: filters.remoteType } : {}),
      ...(filters.salaryCurrency
        ? {
            salary_currency: {
              in: filters.salaryCurrency.toUpperCase().split(','),
            },
          }
        : {}),
      ...(filters.source ? { source: filters.source } : {}),
      ...(filters.excludeJobIds?.length
        ? { id: { notIn: filters.excludeJobIds } }
        : {}),

      ...(filters.salaryMin ? { salary_max: { gte: filters.salaryMin } } : {}),
      ...(filters.hasSalary || filters.sort === 'salary'
        ? { salary_max: { not: null } }
        : {}),
      ...(filters.postedWithinDays ||
      tab === 'discover' ||
      tab === 'recommended'
        ? {
            posted_at: {
              gte: postedCutoff(
                Math.min(
                  filters.postedWithinDays ?? MAX_POSTING_AGE_DAYS,
                  MAX_POSTING_AGE_DAYS,
                ),
              ),
            },
          }
        : {}),
      ...(tab === 'applied'
        ? { applications: { some: { job_seeker_id: jobSeekerId } } }
        : {}),
      // A job already with Plato (queued, applying, applied, waiting on the
      // seeker, closed) never comes back as a "new" result. Only a FAILED
      // attempt may resurface, so it can be tried again.
      ...(tab === 'discover' || tab === 'recommended'
        ? {
            applications: {
              none: { job_seeker_id: jobSeekerId, status: { not: 'FAILED' } },
            },
          }
        : {}),
    };
    // Mongo: `expired_at: null` misses rows where the key was never written.
    const and: Prisma.JobWhereInput[] = [
      { OR: [{ expired_at: null }, { expired_at: { isSet: false } }] },
    ];
    if (filters.level) and.push(levelWhere(filters.level));
    if (filters.jobType) and.push(jobTypeWhere(filters.jobType));
    if (filters.location) and.push(locationWhere(filters.location));
    if (filters.q)
      and.push({
        OR: [
          { title: { contains: filters.q, mode: 'insensitive' } },
          { company: { contains: filters.q, mode: 'insensitive' } },
        ],
      });
    if (and.length) job.AND = and;

    // Results belong to the conversation: any of its runs, old or new
    // field. Duplicate or repeated searches all land in the same pool.
    // Saved / applied / recommended tabs span every conversation.
    const pool: Prisma.JobSeekerJobMatchWhereInput =
      tab === 'discover' && filters.runIds?.length
        ? {
            OR: [
              { discovery_run_ids: { hasSome: filters.runIds } },
              { discovery_run_id: { in: filters.runIds } },
            ],
          }
        : tab === 'discover' && filters.runId
          ? {
              OR: [
                { discovery_run_ids: { has: filters.runId } },
                { discovery_run_id: filters.runId },
              ],
            }
          : {};

    return {
      job_seeker_id: jobSeekerId,
      ...(shortlistedOnly && tab !== 'saved' && tab !== 'applied'
        ? { shortlisted: true }
        : {}),
      ...(tab === 'saved' ? { saved: true } : {}),
      ...(tab === 'discover' || tab === 'recommended' ? { hidden: false } : {}),
      // "Strong match" threshold (75% of the best score) across all searches.
      ...(tab === 'recommended' && maxScore
        ? { match_score: { gte: maxScore * 0.75 } }
        : {}),
      ...pool,
      job,
    };
  }

  // Filter options with counts, derived from the pool the tab is showing.
  async facetsForSeeker(
    jobSeekerId: string,
    runIds?: string[],
    tab?: MatchTab,
  ) {
    const reference = await this.referenceScore(jobSeekerId);
    const rows = await this.prisma.jobSeekerJobMatch.findMany({
      where: this.matchWhere(jobSeekerId, { runIds, tab }, true, reference),
      select: {
        job: {
          select: {
            title: true,
            job_type: true,
            location: true,
            remote_type: true,
            salary_max: true,
            posted_at: true,
            source: true,
          },
        },
      },
      take: 3000,
    });
    // Which boards the jobs came from, for the Source filter.
    const bySource = new Map<string, number>();
    for (const r of rows) bySource.set(r.job.source, (bySource.get(r.job.source) ?? 0) + 1);
    return {
      ...buildFacets(rows.map((r) => r.job)),
      sources: [...bySource].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    };
  }

  private async requireMatch(jobSeekerId: string, jobId: string) {
    const match = await this.prisma.jobSeekerJobMatch.findUnique({
      where: {
        job_seeker_id_job_id: { job_seeker_id: jobSeekerId, job_id: jobId },
      },
    });
    if (!match) throw new NotFoundException('Job is not in your matches');
    return match;
  }

  async setSaved(jobSeekerId: string, jobId: string, saved: boolean) {
    const match = await this.requireMatch(jobSeekerId, jobId);
    return this.prisma.jobSeekerJobMatch.update({
      where: { id: match.id },
      data: { saved, saved_at: saved ? new Date() : null },
      select: { job_id: true, saved: true },
    });
  }

  async setHidden(jobSeekerId: string, jobId: string, hidden: boolean) {
    const match = await this.requireMatch(jobSeekerId, jobId);
    return this.prisma.jobSeekerJobMatch.update({
      where: { id: match.id },
      data: { hidden },
      select: { job_id: true, hidden: true },
    });
  }

  // Queue applications for matched jobs. Already-queued ones are left as is.
  // ponytail: the apply agent that drains the queue is the next feature.
  async queueApplications(
    jobSeekerId: string,
    jobIds: string[],
    threadId?: string,
  ) {
    const matches = await this.prisma.jobSeekerJobMatch.findMany({
      where: { job_seeker_id: jobSeekerId, job_id: { in: jobIds } },
      select: { job_id: true },
    });
    // The same role is often posted once per location: queue it once.
    const jobs = await this.prisma.job.findMany({
      where: { id: { in: matches.map((m) => m.job_id) } },
      select: { id: true, company: true, title: true },
    });
    const taken = new Set(
      (
        await this.prisma.jobApplication.findMany({
          where: {
            job_seeker_id: jobSeekerId,
            status: { notIn: ['FAILED', 'SKIPPED'] },
          },
          select: { job: { select: { company: true, title: true } } },
        })
      ).map((a) => roleKey(a.job.company, a.job.title)),
    );
    const allowed: string[] = [];
    // Keep the caller's order (best match first) when picking the survivor.
    for (const id of jobIds) {
      const job = jobs.find((j) => j.id === id);
      if (!job) continue;
      const key = roleKey(job.company, job.title);
      if (taken.has(key)) continue;
      taken.add(key);
      allowed.push(id);
    }
    for (const job_id of allowed) {
      const existing = await this.prisma.jobApplication.findUnique({
        where: { job_seeker_id_job_id: { job_seeker_id: jobSeekerId, job_id } },
        select: { status: true, engine: true },
      });
      // Queued / in progress / submitted stay as they are; a failed attempt
      // is re-queued for another try. Extension-owned rows never go to the
      // legacy worker.
      if (existing && !['FAILED', 'SKIPPED'].includes(existing.status))
        continue;
      if (existing?.engine === 'EXTENSION') continue;
      await this.prisma.jobApplication.upsert({
        where: { job_seeker_id_job_id: { job_seeker_id: jobSeekerId, job_id } },
        create: { job_seeker_id: jobSeekerId, job_id, thread_id: threadId },
        update: { status: 'QUEUED', error: null, thread_id: threadId },
      });
    }
    return this.listApplications(jobSeekerId);
  }

  async listApplications(
    jobSeekerId: string,
    filters: { threadId?: string; status?: JobApplicationStatus[] } = {},
  ) {
    const rows = await this.prisma.jobApplication.findMany({
      where: {
        job_seeker_id: jobSeekerId,
        ...(filters.threadId ? { thread_id: filters.threadId } : {}),
        ...(filters.status?.length ? { status: { in: filters.status } } : {}),
      },
      include: { job: true },
      orderBy: { created_at: 'desc' },
    });
    // Which ATS is actually handling this job: may differ from job.source
    // (a Dice-discovered Greenhouse job, say).
    return rows.map((row) => ({
      ...row,
      job: { ...row.job, effective_ats_source: effectiveApplySource(row.job) },
    }));
  }

  // Top jobs for "Apply to top N": best matches not already with Plato
  // (failed attempts are eligible again).
  async topJobIds(jobSeekerId: string, n: number, runIds?: string[]) {
    const base = this.matchWhere(jobSeekerId, { runIds }, true);
    const rows = await this.prisma.jobSeekerJobMatch.findMany({
      where: {
        ...base,
        job: {
          ...(base.job as Prisma.JobWhereInput),
          applications: {
            none: { job_seeker_id: jobSeekerId, status: { not: 'FAILED' } },
          },
        },
      },
      orderBy: sortOrder('best'),
      select: { job_id: true },
      take: n,
    });
    return rows.map((r) => r.job_id);
  }

  // Scoped lookup — only returns the job if it's actually matched to this
  // seeker, so the ranking agent can't be steered into reading arbitrary jobs.
  async getJobForSeeker(jobSeekerId: string, jobId: string) {
    const match = await this.prisma.jobSeekerJobMatch.findUnique({
      where: {
        job_seeker_id_job_id: { job_seeker_id: jobSeekerId, job_id: jobId },
      },
      include: { job: true },
    });
    return match?.job ?? null;
  }
}
