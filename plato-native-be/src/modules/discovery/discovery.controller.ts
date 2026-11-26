import { COUNTRY_CODES } from './countries';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JobRemoteType, JobSource } from '@prisma/client';
import { concat, map, of } from 'rxjs';
import { z } from 'zod';
import { RunProgress } from './discovery-run.helpers';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JobSeekerService } from '../user/job-seeker.service';
import { DiscoveryService } from './discovery.service';
import { buildMatchesWorkbook } from './match-export';
import { parseSearchSentence } from './search-sentence';
import { monthlyUsd } from './salary-sanity';
import { ApplyService } from '../apply/apply.service';
import { TokensGuard } from '../credits/tokens.guard';

// New search rules: every one is enforced on each job by the search gate (fitsSearch). Shared by start, preview, check.
const words = z.array(z.string().trim().min(1).max(60)).max(10);
const searchRulesShape = {
  level: z.enum(['entry', 'mid', 'senior']).nullable().optional(),
  salary: z
    .object({
      amount: z.number().positive(),
      currency: z.string().length(3),
      period: z.enum(['MONTHLY', 'YEARLY']),
    })
    .nullable()
    .optional(),
  residenceCountry: z.enum(COUNTRY_CODES).nullable().optional(),
  postedWithinDays: z.number().int().min(1).max(60).nullable().optional(),
  includeKeywords: words.optional(),
  excludeKeywords: words.optional(),
  excludeCompanies: words.optional(),
  salaryShownOnly: z.boolean().optional(),
  willingToRelocate: z.boolean().optional(),
  remoteAnywhere: z.boolean().optional(),
};
type SearchRulesInput = {
  level?: 'entry' | 'mid' | 'senior' | null;
  salary?: {
    amount: number;
    currency: string;
    period: 'MONTHLY' | 'YEARLY';
  } | null;
  residenceCountry?: string | null;
  postedWithinDays?: number | null;
};
/** The request's rules as the query stores them (pay as monthly USD, nulls dropped). */
const toRules = <T extends SearchRulesInput>({
  level,
  salary,
  residenceCountry,
  postedWithinDays,
  ...rest
}: T) => ({
  ...rest,
  ...(level && { level }),
  ...(salary && {
    minMonthlyUsd:
      monthlyUsd(salary.amount, salary.currency, salary.period) ?? undefined,
  }),
  ...(residenceCountry && { residenceCountry }),
  ...(postedWithinDays && { postedWithinDays }),
});

// The same overrides the chat's start_job_search passes, so a search can be replayed exactly.
const startRunSchema = z.object({
  threadId: z.string().optional(),
  titles: z.array(z.string().min(1)).max(8).optional(),
  strictTitles: z.boolean().optional(),
  exact: z.boolean().optional(),
  sentence: z.string().trim().max(600).optional(),
  countries: z.array(z.enum(COUNTRY_CODES)).optional(),
  visaSponsorshipRequired: z.boolean().optional(),
  locations: z.array(z.string().min(1)).optional(),
  remoteTypes: z
    .array(z.enum(['onsite', 'hybrid', 'remote', 'any']))
    .optional(),
  jobTypes: z.array(z.string().min(1)).optional(),
  industries: z.array(z.string().min(1)).optional(),
  ...searchRulesShape,
});

const bool = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

const matchesQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
  shortlistedOnly: bool,
  runId: z.string().optional(),
  threadId: z.string().optional(),
  tab: z
    .enum(['discover', 'saved', 'applied', 'recommended', 'hidden'])
    .optional(),
  sort: z.enum(['best', 'newest', 'salary', 'company']).optional(),
  q: z.string().optional(),
  remoteType: z.enum(JobRemoteType).optional(),
  jobType: z
    .enum(['full', 'part', 'contract', 'intern', 'temporary'])
    .optional(),
  source: z.enum(JobSource).optional(),
  location: z.string().optional(),
  level: z.enum(['junior', 'mid', 'senior']).optional(),
  salaryMin: z.coerce.number().int().min(0).optional(),
  hasSalary: bool,
  acceptsCountry: z.string().min(2).max(60).optional(),
  salaryCurrency: z
    .string()
    .regex(/^[A-Za-z]{3}(,[A-Za-z]{3}){0,4}$/)
    .optional(),
  postedWithinDays: z.coerce.number().int().min(1).max(365).optional(),
});

const exportQuerySchema = matchesQuerySchema.omit({ skip: true, take: true });
// ponytail: one sheet, in memory. Stream if a thread ever exceeds this.
const EXPORT_MAX_ROWS = 2000;

const APPLICATION_STATUSES = [
  'QUEUED',
  'IN_PROGRESS',
  'NEEDS_INPUT',
  'NEEDS_USER_VERIFICATION',
  'SUBMITTED',
  'FAILED',
  'EXPIRED',
  'SKIPPED',
  'EXTENSION_ACTIVE',
] as const;
const applicationsQuerySchema = z.object({
  threadId: z.string().optional(),
  // Comma-separated, e.g. status=FAILED,EXPIRED
  status: z
    .string()
    .optional()
    .transform((v) => v?.split(',').filter(Boolean))
    .pipe(z.array(z.enum(APPLICATION_STATUSES)).optional()),
});

const flagSchema = z.object({ value: z.boolean() });
const applySchema = z.object({
  jobIds: z.array(z.string()).max(50).optional(),
  top: z.number().int().min(1).max(50).optional(),
  threadId: z.string().optional(),
});

@Controller('job-seeker')
@UseGuards(JwtAuthGuard)
export class DiscoveryController {
  constructor(
    private readonly jobSeekerService: JobSeekerService,
    private readonly discoveryService: DiscoveryService,
    private readonly applyService: ApplyService,
  ) {}

  private async requireJobSeekerId(userId: string) {
    const jobSeeker = await this.jobSeekerService.getByUserId(userId);
    if (!jobSeeker) throw new NotFoundException('Job seeker profile not found');
    return jobSeeker.id;
  }

  private runIds(jobSeekerId: string, threadId?: string) {
    return threadId
      ? this.discoveryService.runIdsForThread(jobSeekerId, threadId)
      : Promise.resolve(undefined);
  }

  @Post('discover')
  @UseGuards(TokensGuard)
  async discover(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const parsed = startRunSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const { threadId, ...request } = parsed.data;
    const overrides = toRules(request);
    if (threadId) {
      const { run } = await this.discoveryService.startRunForThread(
        jobSeekerId,
        overrides,
        threadId,
      );
      return run;
    }
    return this.discoveryService.startRun(jobSeekerId, overrides);
  }

  // "New search": one sentence fills the search form; the seeker edits it, then starts with POST discover.
  @Post('discover/parse')
  @HttpCode(200)
  async parseSearch(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const parsed = z
      .object({
        text: z.string().trim().min(3).max(600),
        polish: z.boolean().optional(),
      })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    // Polish: the CV fills what a short sentence leaves out (level, skills, nearby roles).
    if (parsed.data.polish)
      return this.discoveryService.polishSentence(
        jobSeekerId,
        parsed.data.text,
      );
    // ponytail: same env-chosen model as the title planner; one small structured call, metered.
    return parseSearchSentence(
      process.env.TITLE_PLANNER_MODEL ?? 'gpt-4.1-mini',
      parsed.data.text,
    );
  }

  // "New search": the titles the search will cover (planned from the profile), before Start.
  @Post('discover/plan-titles')
  @HttpCode(200)
  async planTitles(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const parsed = z
      .object({
        roles: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
      })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.discoveryService.planSearchTitles(
      jobSeekerId,
      parsed.data.roles,
    );
  }

  // "New search", on Start: whether the search fits the profile, and if not the closest search that does.
  @Post('discover/check')
  @HttpCode(200)
  async checkSearch(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const parsed = z
      .object({
        sentence: z.string().max(600).default(''),
        roles: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
        level: z.enum(['entry', 'mid', 'senior']).nullable().default(null),
        employment: z.array(z.string().max(30)).max(8).default([]),
        countries: z.array(z.enum(COUNTRY_CODES)).max(30).default([]),
        remoteTypes: z
          .array(z.enum(['onsite', 'hybrid', 'remote']))
          .default([]),
        visaSponsorshipRequired: z.boolean().default(false),
        advanced: z
          .object({
            residenceCountry: z.enum(COUNTRY_CODES).nullable().optional(),
            postedWithinDays: z
              .number()
              .int()
              .min(1)
              .max(60)
              .nullable()
              .optional(),
            includeKeywords: words.optional(),
            excludeKeywords: words.optional(),
            excludeCompanies: words.optional(),
            salaryShownOnly: z.boolean().optional(),
            willingToRelocate: z.boolean().optional(),
          })
          .default({}),
        salary: z
          .object({
            amount: z.number().positive(),
            currency: z.string().length(3),
            period: z.enum(['MONTHLY', 'YEARLY']),
          })
          .nullable()
          .default(null),
      })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.discoveryService.checkSearch(jobSeekerId, parsed.data);
  }

  // "New search" live preview: what Plato's own index holds for the form as it stands, and what each rule removes.
  @Post('discover/preview')
  @HttpCode(200)
  async previewSearch(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    await this.requireJobSeekerId(req.userId);
    const parsed = z
      .object({
        titles: z.array(z.string().trim().min(1).max(120)).max(8),
        countries: z.array(z.enum(COUNTRY_CODES)).max(30).default([]),
        remoteTypes: z
          .array(z.enum(['onsite', 'hybrid', 'remote', 'any']))
          .default([]),
        visaSponsorshipRequired: z.boolean().default(false),
        jobTypes: z.array(z.string().max(30)).max(8).default([]),
        ...searchRulesShape,
      })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.discoveryService.previewSearch(toRules(parsed.data));
  }

  // Paste a job link: it becomes a job on the latest search so the extension can apply to it.
  @Post('jobs/by-url')
  async addJobByUrl(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = z
      .object({ url: z.string().url().max(2000) })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    return this.discoveryService.addJobByUrl(jobSeekerId, parsed.data.url);
  }

  @Get('discovery-stats')
  async stats(@Req() req: AuthenticatedRequest) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    return this.discoveryService.statsForSeeker(jobSeekerId);
  }

  @Get('discovery-runs')
  async listRuns(@Req() req: AuthenticatedRequest) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    return this.discoveryService.listRuns(jobSeekerId);
  }

  @Get('discovery-runs/:id')
  async getRun(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const run = await this.discoveryService.getRun(jobSeekerId, id);
    if (!run) throw new NotFoundException('Discovery run not found');
    return run;
  }

  // Server-sent events: current snapshot first, then live updates until the
  // run reaches done/failed.
  @Sse('discovery-runs/:id/events')
  async runEvents(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const run = await this.discoveryService.getRun(jobSeekerId, id);
    if (!run) throw new NotFoundException('Discovery run not found');
    const current = run.progress as unknown as RunProgress | null;
    const live =
      run.status === 'RUNNING'
        ? this.discoveryService.progressStream(id)
        : of();
    return concat(current ? of(current) : of(), live).pipe(
      map((p) => ({ data: p })),
    );
  }

  @Get('discovered-jobs')
  async getDiscoveredJobs(
    @Req() req: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const parsed = matchesQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const { skip, take, shortlistedOnly, threadId, ...filters } = parsed.data;
    const runIds = await this.runIds(jobSeekerId, threadId);
    return this.discoveryService.getMatches(jobSeekerId, {
      skip,
      take,
      shortlistedOnly,
      filters: { ...filters, runIds },
    });
  }

  // Same filters as the list, whole result set, as a styled .xlsx.
  @Get('discovered-jobs/export')
  async exportDiscoveredJobs(
    @Req() req: AuthenticatedRequest,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const parsed = exportQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const { shortlistedOnly, threadId, ...filters } = parsed.data;
    const runIds = await this.runIds(jobSeekerId, threadId);
    const { items } = await this.discoveryService.getMatches(jobSeekerId, {
      skip: 0,
      take: EXPORT_MAX_ROWS,
      shortlistedOnly,
      filters: { ...filters, runIds },
    });
    const tab = filters.tab ?? 'discover';
    const stamp = new Date().toISOString().slice(0, 10);
    const buffer = await buildMatchesWorkbook(items, {
      sheetName: `${tab[0].toUpperCase()}${tab.slice(1)}`,
      generatedAt: new Date(),
    });
    res
      .status(200)
      .setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .setHeader(
        'Content-Disposition',
        `attachment; filename="plato-jobs-${tab}-${stamp}.xlsx"`,
      )
      .send(buffer);
  }

  // Same filters as the list, so each count is what picking that option returns.
  @Get('discovered-jobs/facets')
  async facets(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const parsed = exportQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    // shortlistedOnly/runId don't apply: facets always describe the shortlist of the thread.
    const { threadId, tab, ...rest } = parsed.data;
    const filters = { ...rest, shortlistedOnly: undefined, runId: undefined };
    const runIds = await this.runIds(jobSeekerId, threadId);
    return this.discoveryService.facetsForSeeker(
      jobSeekerId,
      runIds,
      tab,
      filters,
    );
  }

  @Post('matches/:jobId/saved')
  async setSaved(
    @Req() req: AuthenticatedRequest,
    @Param('jobId') jobId: string,
    @Body() body: unknown,
  ) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const parsed = flagSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.discoveryService.setSaved(
      jobSeekerId,
      jobId,
      parsed.data.value,
    );
  }

  @Post('matches/:jobId/hidden')
  async setHidden(
    @Req() req: AuthenticatedRequest,
    @Param('jobId') jobId: string,
    @Body() body: unknown,
  ) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const parsed = flagSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.discoveryService.setHidden(
      jobSeekerId,
      jobId,
      parsed.data.value,
    );
  }

  // Server-side filters: by search (thread) and by status.
  @Get('applications')
  async applications(
    @Req() req: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const parsed = applicationsQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.discoveryService.listApplications(jobSeekerId, parsed.data);
  }

  // "Apply" on the web only TAGS jobs for the browser extension (no server-side applying):
  // the extension pre-ticks them in its wizard. Explicit ids, or "top N" of the conversation's pool.
  @Post('extension-queue')
  async extensionQueue(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const parsed = applySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const { jobIds, top, threadId } = parsed.data;
    const ids = jobIds?.length
      ? jobIds
      : await this.discoveryService.topJobIds(
          jobSeekerId,
          top ?? 15,
          await this.runIds(jobSeekerId, threadId),
        );
    if (!ids.length) throw new BadRequestException('No jobs to queue');
    return this.discoveryService.tagForExtension(jobSeekerId, ids);
  }

  // Queue by explicit ids, or "top N" of the conversation's pool.
  @Post('applications')
  async apply(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const parsed = applySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const { jobIds, top, threadId } = parsed.data;
    const ids = jobIds?.length
      ? jobIds
      : await this.discoveryService.topJobIds(
          jobSeekerId,
          top ?? 15,
          await this.runIds(jobSeekerId, threadId),
        );
    if (!ids.length) throw new BadRequestException('No jobs to apply to');
    const queued = await this.discoveryService.queueApplications(
      jobSeekerId,
      ids,
      threadId,
    );
    // Start now, not on the next poll; big batches get an ETA notification.
    await this.applyService.onQueued(jobSeekerId);
    return queued;
  }
}
