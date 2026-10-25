import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
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
import { ApplyService } from '../apply/apply.service';
import { TokensGuard } from '../credits/tokens.guard';

const startRunSchema = z.object({
  threadId: z.string().optional(),
  titles: z.array(z.string().min(1)).max(3).optional(),
  locations: z.array(z.string().min(1)).optional(),
  remoteTypes: z
    .array(z.enum(['onsite', 'hybrid', 'remote', 'any']))
    .optional(),
  jobTypes: z.array(z.string().min(1)).optional(),
  industries: z.array(z.string().min(1)).optional(),
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
  tab: z.enum(['discover', 'saved', 'applied', 'recommended']).optional(),
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
    const { threadId, ...overrides } = parsed.data;
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

  // Paste a job link: it becomes a job on the latest search so the extension can apply to it.
  @Post('jobs/by-url')
  async addJobByUrl(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = z.object({ url: z.string().url().max(2000) }).safeParse(body);
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

  @Get('discovered-jobs/facets')
  async facets(
    @Req() req: AuthenticatedRequest,
    @Query('threadId') threadId?: string,
    @Query('tab') tab?: string,
  ) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const runIds = await this.runIds(jobSeekerId, threadId);
    const parsedTab = z
      .enum(['discover', 'saved', 'applied', 'recommended'])
      .safeParse(tab);
    return this.discoveryService.facetsForSeeker(
      jobSeekerId,
      runIds,
      parsedTab.success ? parsedTab.data : undefined,
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
  async extensionQueue(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
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
