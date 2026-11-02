import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JobSeekerService } from '../user/job-seeker.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ExtensionAuthGuard,
  ExtensionPublic,
  ExtensionRequest,
  isExtensionOrigin,
  ExtensionScopes,
  limiter,
} from './extension-auth.guard';
import { ExtensionBatchService } from './batch.service';
import { TRANSITION_TARGETS } from './batch-state';
import { CandidateService } from './candidate.service';
import { ExtensionService } from './extension.service';
import { autoSubmitProviders, enabledMatches, PROVIDER_POLICY } from './provider-policy';
import { AnswersService, answersSchema, decideBodySchema, rememberSchema } from './answers.service';
import { ResumeFileService, resumeChoiceSchema } from './resume-file.service';
import { extensionProgress } from './progress';
import { dropSchema, QueueService } from './queue.service';
import { ExtensionSettingsService, settingsPatchSchema } from './settings';
import { OrchestratorService, orchestratorSchema } from './orchestrator.service';
import { jobsQuerySchema, SearchesService } from './searches.service';

const MINUTE = 60_000;
const tooMany = () =>
  new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);

// ---- Group A: the seeker's web session (cookie). Never accepts the token. ----
@Controller('extension')
@UseGuards(JwtAuthGuard)
export class ExtensionWebController {
  constructor(
    private readonly extension: ExtensionService,
    private readonly jobSeekers: JobSeekerService,
    private readonly batches: ExtensionBatchService,
    private readonly searches: SearchesService,
    private readonly prismaRef: PrismaService,
  ) {}

  private async seekerId(req: AuthenticatedRequest) {
    const js = await this.jobSeekers.getByUserId(req.userId);
    if (!js) throw new NotFoundException('Job seeker profile not found');
    return js.id;
  }

  @Post('pairing/start')
  async start(@Req() req: AuthenticatedRequest) {
    const id = await this.seekerId(req);
    if (!limiter.hit(`start:${id}`, 5, MINUTE)) throw tooMany();
    return this.extension.startPairing(id);
  }

  // The web app's progress sidebar (and the Plato AI) read this: what the extension is doing now.
  @Get('progress')
  async progress(@Req() req: AuthenticatedRequest) {
    return extensionProgress(this.prismaRef, await this.seekerId(req));
  }

  // Where the extension stopped and asked the seeker, by site and reason: what to fix next.
  @Get('stops')
  async stops(@Req() req: AuthenticatedRequest) {
    return this.batches.stopReport(await this.seekerId(req));
  }

  @Get('devices')
  async devices(@Req() req: AuthenticatedRequest) {
    return this.extension.listDevices(await this.seekerId(req));
  }

  @Post('devices/revoke-all')
  async revokeAll(@Req() req: AuthenticatedRequest) {
    return this.extension.revokeAll(await this.seekerId(req));
  }

  // The web's search history checkbox: starred searches show first in the extension.
  @Post('searches/:id/featured')
  async feature(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const p = featuredSchema.safeParse(body);
    if (!p.success) throw new BadRequestException('Invalid request');
    return this.searches.setFeatured(
      await this.seekerId(req),
      id,
      p.data.featured,
    );
  }

  @Post('apply-batches')
  async createBatch(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = batchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid request');
    return this.batches.createBatch(
      await this.seekerId(req),
      parsed.data.jobIds,
    );
  }

  // Take an item back before the page was ever ready to submit.
  @Post('items/:id/release')
  async release(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.batches.release(await this.seekerId(req), id);
  }

  @Delete('devices/:id')
  async revoke(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.extension.revoke(await this.seekerId(req), id);
  }
}

const featuredSchema = z.object({ featured: z.boolean() });
const stopSchema = z.object({ reason: z.string().min(1).max(60), message: z.string().max(300) });
const consentSchema = z
  .object({
    decision: z.enum(['allow', 'decline']),
    reason: z.string().trim().min(3).max(500).optional(),
    jobs: z.number().int().min(1).max(50),
    tabs: z.number().int().min(1).max(10),
    // The seeker let Plato press Submit for them (per run, recorded for audit).
    auto_submit: z.boolean().optional(),
  })
  .refine((c) => c.decision === 'allow' || !!c.reason, {
    message: 'A reason is required when declining',
  });

const batchSchema = z.object({ jobIds: z.array(z.string()).min(1).max(50), searchId: z.string().regex(/^[0-9a-f]{24}$/).optional() });

export const transitionSchema = z.object({
  attempt_id: z.string().min(1).max(64),
  seq: z.number().int().min(1).max(1000),
  to: z.enum(TRANSITION_TARGETS),
  detail: z
    .object({
      failure_kind: z
        .string()
        .regex(/^[a-z_]{1,40}$/)
        .optional(),
      message: z.string().max(300).optional(),
      marker: z.string().max(200).optional(),
      reason: z.string().max(100).optional(),
    })
    .strict()
    .optional(),
});
const heartbeatSchema = z.object({ attempt_id: z.string().min(1).max(64) });

const exchangeSchema = z.object({
  code: z.string().min(1).max(20),
  device_label: z.string().trim().min(1).max(60),
  ext_version: z.string().max(20).optional(),
});

// ---- Group B: pairing exchange. Extension origin only; the code is the credential. ----
@Controller('extension/pairing')
export class ExtensionPairingController {
  constructor(private readonly extension: ExtensionService) {}

  @Post('exchange')
  @ExtensionPublic()
  async exchange(@Req() req: Request, @Body() body: unknown) {
    if (!isExtensionOrigin(req.headers.origin))
      throw new ForbiddenException('Origin not allowed');
    // Wrong guesses are throttled per caller and, as a breaker, across all callers.
    const ip = req.ip ?? 'unknown';
    if (
      !limiter.hit(`xchg:${ip}`, 5, MINUTE) ||
      limiter.count('xchg-fail') >= 50
    )
      throw tooMany();
    const parsed = exchangeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid request');
    try {
      return await this.extension.exchange(
        parsed.data.code,
        parsed.data.device_label,
        parsed.data.ext_version,
      );
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() === 401)
        limiter.hit('xchg-fail', Infinity, 10 * MINUTE);
      throw e;
    }
  }
}

// ---- Group C: token API. Bearer only, per-route scopes, extension origin only. ----
@Controller('extension/v1')
@UseGuards(ExtensionAuthGuard)
export class ExtensionApiController {
  private readonly log = new Logger('ExtensionApi');
  @Get('me')
  @ExtensionScopes('apply:read')
  me(@Req() req: ExtensionRequest) {
    return { device_id: req.extension.deviceId, scopes: req.extension.scopes };
  }

  // Which providers the extension may touch. Unknown = BLOCKED.
  @Get('policy')
  @ExtensionScopes('apply:read')
  policy() {
    return {
      providers: PROVIDER_POLICY,
      matches: enabledMatches(),
      auto_submit: autoSubmitProviders(),
    };
  }

  // The wizard: this seeker's searches (featured first, then newest) and the jobs in one.
  @Get('searches')
  @ExtensionScopes('apply:read')
  searchList(@Req() req: ExtensionRequest) {
    return this.searches.list(req.extension.jobSeekerId);
  }

  @Get('searches/:id/jobs')
  @ExtensionScopes('apply:read')
  searchJobs(@Req() req: ExtensionRequest, @Param('id') id: string, @Query() query: unknown) {
    const q = jobsQuerySchema.safeParse(query);
    if (!q.success) throw new BadRequestException('Invalid filters');
    return this.searches.jobs(req.extension.jobSeekerId, id, q.data);
  }

  // The seeker picked jobs in the wizard: same batch the web creates.
  @Post('apply-batches')
  @ExtensionScopes('apply:write')
  createBatch(@Req() req: ExtensionRequest, @Body() body: unknown) {
    const p = batchSchema.safeParse(body);
    if (!p.success) throw new BadRequestException('Invalid request');
    return this.batches.createBatch(req.extension.jobSeekerId, p.data.jobIds, p.data.searchId);
  }

  // Audit log of the tab-opening consent, a decline carries the seeker's reason.
  @Post('consent')
  @ExtensionScopes('apply:write')
  consent(@Req() req: ExtensionRequest, @Body() body: unknown) {
    const p = consentSchema.safeParse(body);
    if (!p.success) throw new BadRequestException('Invalid request');
    return this.searches.recordConsent(req.extension, p.data);
  }

  // The apply orchestrator agent: one stateless turn. It only returns text and
  // UI events (ask, skip, pause...); the panel decides what to do with them.
  @Post('orchestrator')
  @ExtensionScopes('apply:read')
  async orchestrate(@Req() req: ExtensionRequest, @Body() body: unknown) {
    const p = orchestratorSchema.safeParse(body);
    if (!p.success) throw new BadRequestException('Invalid request');
    if (!limiter.hit(`orch:${req.extension.deviceId}`, 20, MINUTE)) throw tooMany();
    return this.orchestrator.turn(req.extension, p.data);
  }

  // The whole page in one AI call: page type, every field's value, what is missing, the next move.
  @Post('items/:id/decide')
  @ExtensionScopes('apply:write')
  async decide(@Req() req: ExtensionRequest, @Param('id') id: string, @Body() body: unknown) {
    const p = decideBodySchema.safeParse(body);
    if (!p.success) {
      // Audit: which part of the page snapshot the schema refused (the extension only shows "Invalid request").
      this.log.warn(`decide ${id} rejected: ${JSON.stringify(p.error.issues.slice(0, 5))}`);
      throw new BadRequestException('Invalid request');
    }
    if (!limiter.hit(`decide:${req.extension.deviceId}`, 60, MINUTE)) throw tooMany();
    return this.answersSvc.decide(req.extension, id, p.data);
  }

  // Which resume this application uploads (asked once per application, kept on the item).
  @Post('items/:id/resume')
  @ExtensionScopes('apply:write')
  async resumeChoice(@Req() req: ExtensionRequest, @Param('id') id: string, @Body() body: unknown) {
    const p = resumeChoiceSchema.safeParse(body);
    if (!p.success) throw new BadRequestException('Invalid request');
    return this.resumeFiles.choose(req.extension, id, p.data.choice);
  }

  // The chosen resume's bytes, for the page's upload field.
  @Get('items/:id/file')
  @ExtensionScopes('apply:read')
  resumeFile(@Req() req: ExtensionRequest, @Param('id') id: string) {
    if (!limiter.hit(`file:${req.extension.deviceId}`, 20, MINUTE)) throw tooMany();
    return this.resumeFiles.file(req.extension, id);
  }

  // The seeker's answers to form questions: remembered for every later form, never asked again.
  @Post('answers/remember')
  @ExtensionScopes('apply:write')
  async remember(@Req() req: ExtensionRequest, @Body() body: unknown) {
    const p = rememberSchema.safeParse(body);
    if (!p.success) throw new BadRequestException('Invalid request');
    if (!limiter.hit(`remember:${req.extension.deviceId}`, 60, MINUTE)) throw tooMany();
    return this.answersSvc.remember(req.extension, p.data.entries);
  }

  // The run stopped for the seeker: keep why (state is unchanged), for the stop report.
  @Post('items/:id/stops')
  @ExtensionScopes('apply:write')
  async stop(@Req() req: ExtensionRequest, @Param('id') id: string, @Body() body: unknown) {
    const p = stopSchema.safeParse(body);
    if (!p.success) throw new BadRequestException('Invalid request');
    if (!limiter.hit(`stop:${req.extension.deviceId}`, 60, MINUTE)) throw tooMany();
    await this.batches.recordStop(req.extension, id, p.data);
    return { ok: true };
  }

  // Draft answers for form questions the engine could not map. Profile facts only; null = unknown.
  @Post('items/:id/answers')
  @ExtensionScopes('apply:write')
  async answers(
    @Req() req: ExtensionRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const p = answersSchema.safeParse(body);
    if (!p.success) throw new BadRequestException('Invalid request');
    if (!limiter.hit(`ans:${req.extension.deviceId}`, 40, MINUTE)) throw tooMany();
    return this.answersSvc.draft(req.extension, id, p.data);
  }

  // Run settings shown on the panel's "Ready to apply" card (resume, cover letter, speed, auto-submit).
  @Get('settings')
  @ExtensionScopes('apply:read')
  getSettings(@Req() req: ExtensionRequest) {
    return this.settings.get(req.extension.jobSeekerId);
  }

  @Post('settings')
  @ExtensionScopes('apply:write')
  saveSettings(@Req() req: ExtensionRequest, @Body() body: unknown) {
    const p = settingsPatchSchema.safeParse(body);
    if (!p.success) throw new BadRequestException('Invalid request');
    return this.settings.put(req.extension.jobSeekerId, p.data);
  }

  // The waiting queue with company and match %, and narrowing it (min match, skip companies, by id).
  @Get('queue')
  @ExtensionScopes('apply:read')
  queue(@Req() req: ExtensionRequest) {
    return this.queueSvc.pending(req.extension.jobSeekerId);
  }

  @Post('queue/drop')
  @ExtensionScopes('apply:write')
  dropFromQueue(@Req() req: ExtensionRequest, @Body() body: unknown) {
    const p = dropSchema.safeParse(body);
    if (!p.success) throw new BadRequestException('Invalid request');
    return this.queueSvc.drop(req.extension.jobSeekerId, p.data);
  }

  // "Clear queue": cancel everything still waiting. Jobs already started are not touched.
  @Post('queue/clear')
  @ExtensionScopes('apply:write')
  clearQueue(@Req() req: ExtensionRequest) {
    return this.batches.clearPending(req.extension.jobSeekerId);
  }

  // Work waiting for this seeker (also sweeps expired leases).
  @Get('batches')
  @ExtensionScopes('apply:read')
  list(@Req() req: ExtensionRequest) {
    return this.batches.list(req.extension);
  }

  @Post('items/:id/claim')
  @ExtensionScopes('apply:write')
  claim(@Req() req: ExtensionRequest, @Param('id') id: string) {
    return this.batches.claim(req.extension, id);
  }

  @Post('items/:id/heartbeat')
  @ExtensionScopes('apply:write')
  heartbeat(
    @Req() req: ExtensionRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const p = heartbeatSchema.safeParse(body);
    if (!p.success) throw new BadRequestException('Invalid request');
    return this.batches.heartbeat(req.extension, id, p.data.attempt_id);
  }

  @Post('items/:id/transition')
  @ExtensionScopes('apply:write')
  transition(
    @Req() req: ExtensionRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const p = transitionSchema.safeParse(body);
    if (!p.success) throw new BadRequestException('Invalid request');
    return this.batches.transition(req.extension, id, p.data);
  }

  // The seeker's application snapshot, only while this device holds the item.
  @Get('items/:id/candidate')
  @ExtensionScopes('apply:read')
  async candidate(@Req() req: ExtensionRequest, @Param('id') id: string) {
    await this.batches.assertWorking(req.extension, id);
    return this.candidates.load(req.extension.jobSeekerId);
  }

  // The extension unpairs itself.
  @Delete('device')
  @ExtensionScopes()
  async unpair(@Req() req: ExtensionRequest) {
    return this.service.revoke(
      req.extension.jobSeekerId,
      req.extension.deviceId,
    );
  }

  constructor(
    private readonly service: ExtensionService,
    private readonly batches: ExtensionBatchService,
    private readonly candidates: CandidateService,
    private readonly searches: SearchesService,
    private readonly orchestrator: OrchestratorService,
    private readonly answersSvc: AnswersService,
    private readonly settings: ExtensionSettingsService,
    private readonly queueSvc: QueueService,
    private readonly resumeFiles: ResumeFileService,
  ) {}
}
