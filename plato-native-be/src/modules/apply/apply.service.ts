import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobApplication, Prisma } from '@prisma/client';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import type { Browser, Page } from 'playwright-core';
import { openBrowser } from './open-browser';
import { IEnvParams } from '../../types/config/env.types';
import { StorageService } from '../documents/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApplyAdapter } from './adapters/apply-adapter';
import { LeverApplyAdapter } from './adapters/lever.adapter';
import { WorkableApplyAdapter } from './adapters/workable.adapter';
import { GreenhouseApplyAdapter } from './adapters/greenhouse.adapter';
import { AshbyApplyAdapter } from './adapters/ashby.adapter';
import { effectiveApplySource } from './ats-detect';
import { draftAnswers } from './answer-draft.agent';
import { ResumeEngine } from '../resume/resume-engine.service';
import { resolveCountry } from '../discovery/countries';
import {
  mapAnswers,
  normalizeLabel,
  splitName,
  totalYears,
} from './answer-mapper';
import { checkEligibility } from './eligibility';
import { diagnoseFailure } from './failure-doctor.agent';
import { INTAKE } from './intake';
import { assertLegacy } from './engine-guard';
import { INTERVIEW_FILLER, validateAnswers } from './validate-answers';
import { applyReadiness } from './readiness';
import { ApplyEvent, ApplyEventsBus, ApplyStep } from './apply-events.bus';
import { NotificationsBus } from '../notifications/notifications.bus';
import {
  applicationNotification,
  NOTIFY_APPLICATION_STATUSES,
} from '../notifications/notification-factory';
import {
  Answers,
  AnswerValue,
  ApplySource,
  Candidate,
  FailureKind,
  FormSchema,
  HumanNeededError,
  JobExpiredError,
  NeedsInput,
  PendingQuestion,
  PermanentApplyError,
  SiteRejectedError,
  SkipApplicationError,
} from './apply.types';

const POLL_MS = 5000;
const BREAKER_PAUSE_MIN = 60;
// Wait before attempt 2, 3, ... (minutes).
const BACKOFF_MIN = [1, 5, 15];

// The ATSs Plato can submit to. Which board DISCOVERED a job doesn't matter:
// a job found via Dice/Glassdoor/Google Jobs/etc. whose real application
// form lives on one of these (see ats-detect.ts) is applied to the same way.
const APPLY_SOURCES: ApplySource[] = [
  'LEVER',
  'WORKABLE',
  'GREENHOUSE',
  'ASHBY',
];

// job.select shape needed everywhere effectiveApplySource() is computed.
const JOB_ATS_SELECT = { source: true, apply_url: true, url: true } as const;

const presentableName = (name: string) =>
  name === name.toUpperCase() || name === name.toLowerCase()
    ? name.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase())
    : name;

// An open essay the profile doesn't cover gets an honest line. Anything else
// (a number, a link, a fact, a choice) has no honest default: it is an
// unknown fact, asked once and remembered, never padded.
function fallbackAnswer(q: PendingQuestion): AnswerValue | undefined {
  return q.type === 'paragraph' ? INTERVIEW_FILLER : undefined;
}

// What a failed attempt knew, so the doctor and the seeker can see it.
interface Prepared {
  schema: FormSchema;
  answers: Answers;
  candidate: Candidate;
}
const sentList = (p: Prepared | null) =>
  p
    ? p.schema.fields
        .filter((f) => p.answers[f.id] !== undefined)
        .map((f) => ({ label: f.label, value: p.answers[f.id] }))
    : [];

const VERIFY_IN_WINDOW =
  'Human verification required. Complete the verification in the application window, then continue.';

// Marker kept with the application's confirmed answers (no form field has
// this id, so it never reaches an employer).
const APPLY_ANYWAY = '__apply_anyway';
// Answer ids for the "does the profile really cover this job" step.
const RESUME_SKILL = 'resume_skill:';
const RESUME_POLICY = 'resume_policy';
const POLICY_APPLY = 'Apply with my real resume';
const POLICY_SKIP = 'Skip this job';

// The doctor repairs answers at most this many times per application.
const MAX_REPAIRS = 2;

type ClaimedApplication = Prisma.JobApplicationGetPayload<{
  include: { job: true };
}>;

@Injectable()
export class ApplyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApplyService.name);
  private readonly env: IEnvParams;
  private readonly adapters: Map<ApplySource, ApplyAdapter>;
  private timer: NodeJS.Timeout | null = null;
  private browser: Browser | null = null;
  private busy = false;
  // What the worker is doing right now, survivable across page refreshes.
  // ponytail: in memory — lost on restart, which also resets the work itself.
  private current: { applicationId: string; jobSeekerId: string } | null = null;
  private readonly timelines = new Map<string, ApplyEvent[]>();
  // Rolling duration of recent applications, for the ETA.
  private readonly durations: number[] = [];
  // Circuit breaker: a site that keeps demanding a human check is paused
  // rather than hit once per queued application.
  // Applications whose browser window is open right now, waiting for a
  // person to complete a human-verification step.
  private readonly awaitingHuman = new Set<string>();
  // The page each running application is driving, for the live view.
  private readonly livePages = new Map<string, Page>();
  private readonly humanChecks = new Map<ApplySource, number>();
  private readonly pausedUntil = new Map<ApplySource, Date>();
  // Outcomes per seeker since their queue last emptied, for the summary.
  private readonly batches = new Map<string, Record<string, number>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly bus: ApplyEventsBus,
    private readonly notifications: NotificationsBus,
    config: ConfigService,
    lever: LeverApplyAdapter,
    workable: WorkableApplyAdapter,
    greenhouse: GreenhouseApplyAdapter,
    ashby: AshbyApplyAdapter,
    private readonly resumeEngine: ResumeEngine,
  ) {
    this.env = config.get<IEnvParams>('env')!;
    this.adapters = new Map<ApplySource, ApplyAdapter>([
      ['LEVER', lever],
      ['WORKABLE', workable],
      ['GREENHOUSE', greenhouse],
      ['ASHBY', ashby],
    ]);
  }

  async onModuleInit() {
    // Rows created before these fields existed: Prisma's Mongo filters
    // don't match missing keys, so make them explicit once.
    await this.prisma.$runCommandRaw({
      update: 'job_applications',
      updates: [
        {
          q: { attempts: { $exists: false } },
          u: { $set: { attempts: 0, next_attempt_at: null } },
          multi: true,
        },
      ],
    });
    // Rows parked under the older scheme (NEEDS_INPUT + reason "captcha")
    // get the explicit status. Small set; filtered here because Prisma's
    // Mongo JSON filters can't look inside needs_input.
    const legacy = await this.prisma.jobApplication.findMany({
      where: { status: 'NEEDS_INPUT' },
      select: { id: true, needs_input: true },
    });
    const humanChecks = legacy
      .filter(
        (r) =>
          (r.needs_input as unknown as NeedsInput | null)?.reason === 'captcha',
      )
      .map((r) => r.id);
    if (humanChecks.length)
      await this.prisma.jobApplication.updateMany({
        where: { id: { in: humanChecks } },
        data: {
          status: 'NEEDS_USER_VERIFICATION',
          failure_kind: 'human_check',
        },
      });

    // A restart mid-application leaves IN_PROGRESS rows nobody owns.
    const orphans = await this.prisma.jobApplication.updateMany({
      where: { status: 'IN_PROGRESS' },
      data: { status: 'QUEUED' },
    });
    if (orphans.count)
      this.logger.warn(`Re-queued ${orphans.count} orphaned application(s)`);

    if (!this.env.applyWorkerEnabled) {
      this.logger.log('Apply worker is OFF (APPLY_WORKER_ENABLED=false)');
      return;
    }
    this.logger.log(
      `Apply worker ON — ${this.env.applyDryRun ? 'DRY RUN (nothing is submitted)' : 'LIVE (applications are really submitted)'}`,
    );
    // The timer is only the safety net (retries coming due, missed kicks);
    // queueing an application kicks the worker directly.
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.kick();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    // Don't leave a Chrome behind; the interrupted application is re-queued
    // by the orphan sweep on the next boot.
    await this.browser?.close().catch(() => undefined);
  }

  // --- Worker ---------------------------------------------------------

  // One application at a time: gentle on the ATS, and one Chrome at a time.
  // Called the moment something is queued, so the seeker never waits on a poll.
  kick() {
    if (this.env.applyWorkerEnabled) void this.tick();
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      // Drain: go straight to the next one instead of waiting for a poll.
      await this.parkUnsupported();
      await this.requeueResolved();
      for (;;) {
        const claimed = await this.claimNext();
        if (!claimed) break;
        const started = Date.now();
        this.current = {
          applicationId: claimed.id,
          jobSeekerId: claimed.job_seeker_id,
        };
        await this.process(claimed);
        this.current = null;
        this.durations.push((Date.now() - started) / 1000);
        if (this.durations.length > 20) this.durations.shift();
        await this.recordOutcome(claimed);
      }
    } catch (error) {
      this.logger.error('Apply worker tick failed', error as Error);
    } finally {
      this.busy = false;
    }
  }

  // Sites without an adapter would sit in QUEUED forever. Say so instead:
  // hand them to the seeker with a link, quietly (no notification each).
  private async parkUnsupported() {
    const queued = await this.prisma.jobApplication.findMany({
      where: { status: 'QUEUED' },
      include: { job: { select: JOB_ATS_SELECT } },
    });
    const rows = queued.filter((row) => !effectiveApplySource(row.job));
    for (const row of rows) {
      const site = row.job.source[0] + row.job.source.slice(1).toLowerCase();
      const needs: NeedsInput = {
        reason: 'unsupported',
        message: `Plato can't apply on ${site} yet. Open the posting, apply there, then mark it as submitted.`,
        questions: [],
      };
      await this.prisma.jobApplication.update({
        where: { id: row.id },
        data: {
          status: 'NEEDS_INPUT',
          needs_input: needs as unknown as Prisma.InputJsonValue,
        },
      });
      this.publishEvent(row, 'needs_input', needs.message, 'NEEDS_INPUT');
    }
  }

  // Parked rows that no longer need the seeker go back in line by themselves:
  // per-job questions (auto-apply answers them now), and "complete your
  // details" once the snapshot is complete.
  private async requeueResolved() {
    const candidates = await this.prisma.jobApplication.findMany({
      where: { status: 'NEEDS_INPUT' },
      select: {
        id: true,
        job_seeker_id: true,
        needs_input: true,
        job: { select: JOB_ATS_SELECT },
      },
    });
    const parked = candidates.filter((row) => effectiveApplySource(row.job));
    const ready = new Map<string, ReturnType<typeof applyReadiness>>();
    for (const row of parked) {
      const reason = (row.needs_input as unknown as NeedsInput | null)?.reason;
      // Left "prepared" by an earlier rehearsal: now that Plato submits for
      // real, send it. No readiness question here, it already passed.
      if (reason === 'ready' && !this.env.applyDryRun) {
        await this.prisma.jobApplication.update({
          where: { id: row.id },
          data: {
            status: 'QUEUED',
            needs_input: null,
            error: null,
            failure_kind: null,
          },
        });
        continue;
      }
      // 'questions' rows wait for the seeker's answers (provideAnswers).
      if (reason !== 'profile') continue;
      if (!ready.has(row.job_seeker_id))
        ready.set(
          row.job_seeker_id,
          applyReadiness(await this.loadCandidate(row.job_seeker_id)),
        );
      const readiness = ready.get(row.job_seeker_id)!;
      if (!readiness.ready) {
        // Leave it parked rather than bounce it every tick.
        continue;
      }
      await this.prisma.jobApplication.update({
        where: { id: row.id },
        data: { status: 'QUEUED', needs_input: null, error: null },
      });
    }
  }

  async readiness(jobSeekerId: string) {
    const candidate = await this.loadCandidate(jobSeekerId);
    return {
      ...applyReadiness(candidate),
      // Not blocking, but forms keep asking: worth collecting once.
      recommended: [
        ...(['linkedin', 'github', 'portfolio'] as const)
          .filter((k) => !candidate.links[k])
          .map((k) => ({
            key: `${k}_url`,
            question: `Your ${k === 'linkedin' ? 'LinkedIn' : k === 'github' ? 'GitHub' : 'portfolio'} link?`,
            sensitive: false,
          })),
        ...INTAKE.filter((q) => candidate.facts[q.key] === undefined).map(
          (q) => ({
            key: q.key,
            question: q.question,
            sensitive: !!q.sensitive,
          }),
        ),
      ],
    };
  }

  // The intake bank with this seeker's current answers.
  async intake(jobSeekerId: string) {
    const seeker = await this.prisma.jobSeeker.findUniqueOrThrow({
      where: { id: jobSeekerId },
      select: { apply_facts: true },
    });
    const facts = (seeker.apply_facts ?? {}) as Record<string, AnswerValue>;
    return INTAKE.map(({ key, question, type, options, sensitive }) => ({
      key,
      question,
      type,
      options: options ?? null,
      sensitive: !!sensitive,
      value: facts[key] ?? null,
    }));
  }

  // Save intake facts. An empty value clears the fact ("I'd rather not say").
  async saveIntake(jobSeekerId: string, input: Record<string, string | null>) {
    const seeker = await this.prisma.jobSeeker.findUniqueOrThrow({
      where: { id: jobSeekerId },
      select: { apply_facts: true },
    });
    const facts = {
      ...((seeker.apply_facts ?? {}) as Record<string, AnswerValue>),
    };
    for (const q of INTAKE) {
      if (!(q.key in input)) continue;
      const raw = (input[q.key] ?? '').trim();
      if (!raw) {
        delete facts[q.key];
        continue;
      }
      if (q.type === 'number' && !/^\d+(\.\d+)?$/.test(raw))
        throw new BadRequestException(`${q.key} must be a number`);
      if (q.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(raw))
        throw new BadRequestException(`${q.key} must be a date (YYYY-MM-DD)`);
      if (q.type === 'choice' && q.options && !q.options.includes(raw))
        throw new BadRequestException(
          `${q.key} must be one of: ${q.options.join(', ')}`,
        );
      facts[q.key] = raw;
    }
    await this.prisma.jobSeeker.update({
      where: { id: jobSeekerId },
      data: { apply_facts: facts },
    });
    this.kick();
    return this.intake(jobSeekerId);
  }

  // When a seeker's queue empties, tell them how the whole batch went.
  private async recordOutcome(app: ClaimedApplication) {
    const row = await this.prisma.jobApplication.findUnique({
      where: { id: app.id },
      select: { status: true },
    });
    const tally = this.batches.get(app.job_seeker_id) ?? {};
    if (row && row.status !== 'QUEUED')
      tally[row.status] = (tally[row.status] ?? 0) + 1;
    this.batches.set(app.job_seeker_id, tally);

    const queued = await this.prisma.jobApplication.findMany({
      where: { job_seeker_id: app.job_seeker_id, status: 'QUEUED' },
      select: { job: { select: JOB_ATS_SELECT } },
    });
    const remaining = queued.filter((row) =>
      effectiveApplySource(row.job),
    ).length;
    if (remaining) return;
    this.batches.delete(app.job_seeker_id);
    const total = Object.values(tally).reduce((n, c) => n + c, 0);
    // A single application already produced its own notification.
    if (total < 2) return;
    const parts = [
      tally.SUBMITTED && `${tally.SUBMITTED} applied`,
      tally.NEEDS_INPUT && `${tally.NEEDS_INPUT} need you`,
      tally.FAILED && `${tally.FAILED} failed`,
      tally.EXPIRED && `${tally.EXPIRED} closed`,
    ].filter(Boolean);
    this.notifications.publish(app.job_seeker_id, {
      id: `queue:${Date.now()}:DONE`,
      kind: 'queue',
      status: 'DONE',
      tone: tally.FAILED ? 'warning' : 'success',
      title: 'Your applications are done',
      body: `Finished ${total}: ${parts.join(', ')}.`,
      href: '/applications',
      at: new Date().toISOString(),
    });
  }

  // Two human checks in a row from one site means every next application
  // there will hit the same wall. Stop, say so once, try again later.
  private tripBreaker(app: ClaimedApplication) {
    const source = effectiveApplySource(app.job);
    if (!source) return; // unsupported jobs never reach process()
    const count = (this.humanChecks.get(source) ?? 0) + 1;
    this.humanChecks.set(source, count);
    if (count < 2 || this.pausedUntil.has(source)) return;
    const until = new Date(Date.now() + BREAKER_PAUSE_MIN * 60_000);
    this.pausedUntil.set(source, until);
    const site = source[0] + source.slice(1).toLowerCase();
    this.logger.warn(
      `${site} keeps asking for a human check; paused until ${until.toISOString()}`,
    );
    this.notifications.publish(app.job_seeker_id, {
      id: `queue:${Date.now()}:PAUSED`,
      kind: 'queue',
      status: 'PAUSED',
      tone: 'warning',
      title: `${site} applications paused`,
      body: `${site} is asking "verify you are human" on every application. Plato doesn't bypass that, so the rest are on hold for ${BREAKER_PAUSE_MIN} min. The ones it reached are ready for you to submit by hand.`,
      href: '/applications',
      at: new Date().toISOString(),
    });
  }

  private avgSeconds() {
    // Measured once there is history; a real form run is about a minute and a half.
    return this.durations.length
      ? this.durations.reduce((n, d) => n + d, 0) / this.durations.length
      : 90;
  }

  // Called right after the seeker queues applications.
  async onQueued(jobSeekerId: string) {
    const status = await this.queueStatus(jobSeekerId);
    const waiting = Object.keys(status.positions).length;
    // Small batches just start; big ones deserve an honest estimate up front.
    if (this.env.applyWorkerEnabled && waiting >= 5) {
      const minutes = Math.max(1, Math.round(status.totalEtaSeconds / 60));
      this.notifications.publish(jobSeekerId, {
        id: `queue:${Date.now()}:QUEUED`,
        kind: 'queue',
        status: 'QUEUED',
        tone: 'info',
        title: `${waiting} applications queued`,
        body: `About ${minutes} min in total, one at a time. I'll tell you when they're done or when one needs you.`,
        href: '/applications',
        at: new Date().toISOString(),
      });
    }
    this.kick();
    return status;
  }

  // Everything the Applications page needs to explain "what is happening".
  async queueStatus(jobSeekerId: string) {
    // The worker is shared, so position is counted across all seekers.
    const candidates = await this.prisma.jobApplication.findMany({
      where: { status: 'QUEUED' },
      orderBy: { created_at: 'asc' },
      select: {
        id: true,
        job_seeker_id: true,
        next_attempt_at: true,
        job: { select: JOB_ATS_SELECT },
      },
    });
    const queue = candidates.filter((row) => effectiveApplySource(row.job));
    const avg = this.avgSeconds();
    const ahead = this.current ? 1 : 0;
    const positions: Record<string, { position: number; etaSeconds: number }> =
      {};
    let totalEtaSeconds = 0;
    queue.forEach((row, i) => {
      if (row.job_seeker_id !== jobSeekerId) return;
      const etaSeconds = Math.round((i + ahead + 1) * avg);
      positions[row.id] = { position: i + 1, etaSeconds };
      totalEtaSeconds = etaSeconds;
    });
    const mine = this.current?.jobSeekerId === jobSeekerId;
    const ids = await this.prisma.jobApplication.findMany({
      where: { job_seeker_id: jobSeekerId },
      select: { id: true },
    });
    const timelines: Record<string, ApplyEvent[]> = {};
    for (const { id } of ids) {
      const events = this.timelines.get(id);
      if (events) timelines[id] = events;
    }
    return {
      worker: {
        enabled: this.env.applyWorkerEnabled,
        dryRun: this.env.applyDryRun,
        busy: this.busy,
        sources: APPLY_SOURCES,
        // Sites on hold because they keep demanding a human check.
        paused: [...this.pausedUntil].map(([source, until]) => ({
          source,
          until: until.toISOString(),
        })),
      },
      currentApplicationId: mine ? this.current!.applicationId : null,
      avgSeconds: Math.round(avg),
      positions,
      totalEtaSeconds,
      timelines,
    };
  }

  private activeSources(): ApplySource[] {
    const now = new Date();
    for (const [source, until] of this.pausedUntil)
      if (until <= now) {
        this.pausedUntil.delete(source);
        this.humanChecks.delete(source);
      }
    return APPLY_SOURCES.filter((s) => !this.pausedUntil.has(s));
  }

  private async claimNext(): Promise<ClaimedApplication | null> {
    const active = new Set(this.activeSources());
    if (!active.size) return null;
    const candidates = await this.prisma.jobApplication.findMany({
      where: {
        status: 'QUEUED',
        // Freshly queued rows have no next_attempt_at key at all, and on
        // Mongo `null` does not match a missing key: check both.
        OR: [
          { next_attempt_at: { isSet: false } },
          { next_attempt_at: null },
          { next_attempt_at: { lte: new Date() } },
        ],
      },
      orderBy: { created_at: 'asc' },
      // ponytail: bounded scan (can't filter the ATS-sniff in the DB query
      // itself); revisit if a paused source's backlog routinely exceeds this.
      take: 200,
      select: { id: true, job: { select: JOB_ATS_SELECT } },
    });
    const next = candidates.find((c) => {
      const source = effectiveApplySource(c.job);
      return source && active.has(source);
    });
    if (!next) return null;
    // Atomic claim: only one worker flips QUEUED -> IN_PROGRESS.
    const { count } = await this.prisma.jobApplication.updateMany({
      where: { id: next.id, status: 'QUEUED' },
      data: { status: 'IN_PROGRESS', attempts: { increment: 1 }, error: null },
    });
    if (!count) return null;
    return this.prisma.jobApplication.findUnique({
      where: { id: next.id },
      include: { job: true },
    });
  }

  private async process(app: ClaimedApplication) {
    const atsSource = effectiveApplySource(app.job)!; // process() only runs on eligible jobs
    const adapter = this.adapters.get(atsSource)!;
    const emit = (step: ApplyStep, message: string, status = 'IN_PROGRESS') =>
      this.emit(app, step, message, status);
    let workDir: string | null = null;
    let prepared: Prepared | null = null;

    try {
      emit('claimed', `Starting on ${app.job.title} at ${app.job.company}`);

      // The same role is often posted once per location. One application
      // per employer + role is enough; more reads as spam to the recruiter.
      const twin = await this.prisma.jobApplication.findFirst({
        where: {
          job_seeker_id: app.job_seeker_id,
          id: { not: app.id },
          status: { in: ['SUBMITTED', 'NEEDS_INPUT', 'IN_PROGRESS'] },
          job: { company: app.job.company, title: app.job.title },
        },
        select: { id: true },
      });
      if (twin)
        throw new SkipApplicationError(
          `You already have an application for this role at ${app.job.company} (it is posted in several locations).`,
          'duplicate',
        );

      emit(
        'checking',
        'Checking the posting is still open and reading its form',
      );
      const schema = await adapter.loadForm(app.job.apply_url ?? app.job.url);

      emit(
        'mapping',
        `Form has ${schema.fields.length} fields — filling from your profile`,
      );
      const candidate = await this.loadCandidate(app.job_seeker_id);
      const confirmed = (app.answers ?? {}) as Answers;

      // Not every shortlisted job is one to apply to: wrong stack in the
      // title, a management role, a region the seeker can't work in.
      // The seeker can overrule a skip ("apply anyway" on the application).
      const fit = confirmed[APPLY_ANYWAY]
        ? { eligible: true as const, reason: undefined }
        : checkEligibility(app.job, candidate);
      if (!fit.eligible)
        throw new SkipApplicationError(fit.reason!, 'ineligible');

      // Asked once, never per job: without these basics the form answers
      // would be guesses, so nothing is sent until the snapshot has them.
      const readiness = applyReadiness(candidate);
      if (!readiness.ready)
        return await this.park(app, {
          reason: 'profile',
          message: `Before I can apply for you I need: ${readiness.missing.map((d) => d.label).join('; ')}.`,
          questions: [],
        });

      // A resume written for this job from real facts only. Skills the job
      // asks for and the profile lacks are confirmed with the seeker first.
      const tailored = await this.tailorFor(app, confirmed, emit);
      if (tailored.park) return await this.park(app, tailored.park);

      const mapped = mapAnswers(schema, candidate, confirmed);
      const answers = mapped.answers;
      const questions = mapped.questions;

      if (questions.length) {
        emit(
          'drafting',
          `Answering ${questions.length} screening question(s) from your profile`,
        );
        const drafted = await draftAnswers(
          this.env.applyAnswerModel,
          candidate,
          app.job,
          questions,
        ).catch((error) => {
          this.logger.warn(`Drafting failed: ${(error as Error).message}`);
          return questions;
        });
        // Review mode is opt-in; auto-apply answers and moves on.
        if (this.env.applyConfirmAnswers)
          return await this.park(app, {
            reason: 'questions',
            message: `This employer asks ${drafted.length} question(s). Review my drafts to continue.`,
            questions: drafted,
          });
        const unknown: PendingQuestion[] = [];
        for (const q of drafted) {
          const value = q.draft ?? fallbackAnswer(q);
          if (value === undefined) unknown.push(q);
          else answers[q.id] = value;
        }
        // Facts Plato doesn't hold are asked ONCE: the answer is remembered
        // (as an intake fact or by question text) for every later employer.
        if (unknown.length)
          return await this.park(
            app,
            {
              reason: 'questions',
              message: `This employer requires ${unknown.length} thing(s) I don't know about you yet. Tell me once and I'll remember for every application.`,
              questions: unknown,
            },
            'unknown_fact',
          );
      }

      // Last gate: nothing malformed ever reaches an employer.
      prepared = { schema, answers, candidate };
      const problems = validateAnswers(schema, answers);
      if (problems.length)
        throw new SiteRejectedError(
          `I stopped before sending: ${problems.map((p) => `"${p.label}" ${p.problem}`).join('; ')}`,
          problems.map((p) => `${p.fieldId}: ${p.problem}`),
        );

      workDir = mkdtempSync(join(tmpdir(), 'plato-apply-'));
      let resumePath: string;
      if (tailored.pdf) {
        resumePath = join(workDir, 'resume.pdf');
        writeFileSync(resumePath, tailored.pdf);
      } else {
        // Tailoring unavailable: the uploaded CV, as before.
        const resume = await this.prisma.jobSeekerDocument.findFirst({
          where: {
            job_seeker_id: app.job_seeker_id,
            type: 'CV_RESUME',
            status: 'READY',
          },
          orderBy: { created_at: 'desc' },
        });
        if (!resume)
          throw new PermanentApplyError('No processed CV on file', 'no_resume');
        resumePath = join(workDir, basename(resume.name ?? 'resume.pdf'));
        writeFileSync(
          resumePath,
          await this.storage.getObjectBuffer(resume.storage_key),
        );
      }

      emit('filling', 'Opening the application form');
      const browser = await openBrowser(
        {
          channel: this.env.applyBrowserChannel,
          headless: this.env.applyHeadless,
          // Playwright's own signal handlers swallow the SIGTERM that Nest's*
          // watch mode (and any process manager) uses to restart the app, so
          // new code never loads. The app owns shutdown; see onModuleDestroy.
          handleSIGINT: false,
          handleSIGTERM: false,
          handleSIGHUP: false,
        },
        // Ashby flags the stealth browser as spam; plain Chrome on the
        // user's own network is the supported path there.
        { plain: atsSource === 'ASHBY' },
      );
      this.browser = browser;
      try {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 1000 },
        });
        const page = await context.newPage();
        page.setDefaultTimeout(30_000);
        this.livePages.set(app.id, page);
        emit(
          'submitting',
          this.env.applyDryRun
            ? 'Filling the form (dry run)'
            : 'Filling and submitting the form',
        );
        const result = await adapter.submit(page, schema, answers, {
          resumePath,
          dryRun: this.env.applyDryRun,
          headed: !this.env.applyHeadless,
          screenshotPath: join(workDir, 'proof.png'),
          verificationWaitMs: this.env.applyVerificationWaitSec * 1000,
          // (B) The site asked for a person. Same page stays open; nothing
          // is refilled. Status says exactly what is going on.
          onHumanCheck: async (indicators) => {
            this.logger.warn(
              `[${app.id}] HUMAN VERIFICATION detected on ${atsSource}: ${indicators.join(' | ')}`,
            );
            this.awaitingHuman.add(app.id);
            await this.prisma.jobApplication.update({
              where: { id: app.id },
              data: {
                status: 'NEEDS_USER_VERIFICATION',
                failure_kind: 'human_check',
                needs_input: {
                  reason: 'captcha',
                  message: VERIFY_IN_WINDOW,
                  questions: [],
                },
                evidence: {
                  sent: sentList(prepared),
                  indicators,
                  at: new Date().toISOString(),
                },
              },
            });
            this.logger.log(
              `[${app.id}] application PAUSED for the user (waiting up to ${this.env.applyVerificationWaitSec}s, window kept open)`,
            );
            emit('human_check', VERIFY_IN_WINDOW, 'NEEDS_USER_VERIFICATION');
          },
          onVerificationCompleted: async () => {
            this.awaitingHuman.delete(app.id);
            this.logger.log(
              `[${app.id}] user verification COMPLETED; continuing`,
            );
            await this.prisma.jobApplication.update({
              where: { id: app.id },
              data: {
                status: 'IN_PROGRESS',
                needs_input: null,
                failure_kind: null,
              },
            });
            emit(
              'verified',
              'Verification completed. Submitting the application',
            );
          },
        });
        // Proof of application: kept in private object storage, served only
        // to its owner through the authed screenshot endpoint.
        const screenshotKey = result.screenshot
          ? await this.storage
              .putBuffer(
                `apply-evidence/${app.job_seeker_id}/${app.id}.png`,
                readFileSync(result.screenshot),
                'image/png',
              )
              .catch((error) => {
                this.logger.warn(
                  `Proof upload failed: ${(error as Error).message}`,
                );
                return null;
              })
          : null;
        const evidence = {
          dryRun: result.dryRun,
          confirmation: result.confirmation,
          screenshotKey,
          // Label + value, so the seeker can read exactly what was sent.
          sent: schema.fields
            .filter((f) => answers[f.id] !== undefined)
            .map((f) => ({ label: f.label, value: answers[f.id] })),
          at: new Date().toISOString(),
        };

        if (result.dryRun) {
          // Nothing was sent. Everything is prepared: the seeker can read
          // the answers, see the filled form, and submit it themselves.
          await this.prisma.jobApplication.update({
            where: { id: app.id },
            // park() hands the attempt back; don't do it twice.
            data: { evidence: evidence },
          });
          return await this.park(
            app,
            {
              reason: 'ready',
              message:
                'Dry run: I filled the whole form and stopped before Submit. Check the answers and the preview below.',
              questions: [],
            },
            'dry_run',
          );
        }
        await this.prisma.jobApplication.update({
          where: { id: app.id },
          data: {
            status: 'SUBMITTED',
            submitted_at: new Date(),
            next_attempt_at: null,
            evidence: evidence,
            failure_kind: null,
            error: null,
          },
        });
        this.humanChecks.delete(atsSource);
        this.logger.log(
          `[${app.id}] submission CONFIRMED by ${atsSource}: ${result.confirmation}`,
        );
        emit('submitted', result.confirmation, 'SUBMITTED');
      } finally {
        this.awaitingHuman.delete(app.id);
        this.livePages.delete(app.id);
        this.browser = null;
        await browser.close().catch(() => undefined);
      }
    } catch (error) {
      // If the adapter got as far as a picture of the problem, keep it.
      const shot = workDir ? join(workDir, 'proof.png') : null;
      const failureShot =
        shot && existsSync(shot)
          ? await this.storage
              .putBuffer(
                `apply-evidence/${app.job_seeker_id}/${app.id}.png`,
                readFileSync(shot),
                'image/png',
              )
              .catch(() => null)
          : null;
      await this.handleFailure(app, error as Error, failureShot, prepared);
    } finally {
      if (workDir) rmSync(workDir, { recursive: true, force: true });
    }
  }

  private async handleFailure(
    app: ClaimedApplication,
    error: Error,
    failureShot: string | null = null,
    prepared: Prepared | null = null,
  ) {
    const set = (data: Prisma.JobApplicationUpdateInput) =>
      this.prisma.jobApplication.update({ where: { id: app.id }, data });
    // What Plato had ready and what the page looked like, on every outcome:
    // the seeker (and the doctor) can see exactly what happened.
    const evidence = (extra: Record<string, unknown> = {}) =>
      ({
        failed: true,
        screenshotKey: failureShot,
        sent: sentList(prepared),
        at: new Date().toISOString(),
        ...extra,
      }) as Prisma.InputJsonValue;

    if (error instanceof JobExpiredError) {
      await set({
        status: 'EXPIRED',
        error: error.message,
        failure_kind: 'closed',
      });
      return this.emit(app, 'expired', error.message, 'EXPIRED');
    }
    if (error instanceof SkipApplicationError) {
      await set({
        status: 'SKIPPED',
        error: error.message,
        failure_kind: error.kind,
      });
      return this.emit(app, 'skipped', error.message, 'SKIPPED');
    }
    if (error instanceof HumanNeededError) {
      // (B, unresolved) Not submitted, not failed: waiting on a person.
      // Everything prepared is kept so nothing has to be redone by hand.
      const message = error.waited
        ? `${VERIFY_IN_WINDOW} Nobody completed it within ${Math.round(this.env.applyVerificationWaitSec / 60)} min, so the window was closed. Your answers are saved: press Continue to reopen it, or submit on the site yourself.`
        : this.env.applyHeadless
          ? `${error.message}. Plato runs without a visible browser here and never bypasses human checks. Your answers are ready below: open the posting, submit it, then mark it as submitted.`
          : `${error.message}. ${VERIFY_IN_WINDOW}`;
      this.logger.warn(
        `[${app.id}] submission NOT confirmed: human verification ${error.waited ? 'not completed in time' : 'required'} (${error.indicators.join(' | ') || 'no indicators'})`,
      );
      await set({
        status: 'NEEDS_USER_VERIFICATION',
        failure_kind: 'human_check',
        attempts: { decrement: 1 },
        needs_input: { reason: 'captcha', message, questions: [] },
        evidence: evidence({ failed: false, indicators: error.indicators }),
      });
      this.emit(app, 'human_check', message, 'NEEDS_USER_VERIFICATION');
      return this.tripBreaker(app);
    }

    const kind: FailureKind =
      error instanceof PermanentApplyError ? error.kind : 'site_error';
    const repairs = Number(
      (app.evidence as { repairs?: number } | null)?.repairs ?? 0,
    );

    // Don't retry the same thing blindly: ask the doctor what went wrong.
    // Only for failures answers can explain; never for human checks etc.
    if (
      prepared &&
      (kind === 'invalid_answer' || kind === 'site_error') &&
      repairs < MAX_REPAIRS
    ) {
      this.emit(
        app,
        'diagnosing',
        'That failed. Working out why before trying again',
        'IN_PROGRESS',
      );
      const diagnosis = await diagnoseFailure(
        this.env.applyAnswerModel,
        {
          kind,
          message: error.message,
          siteProblems:
            error instanceof SiteRejectedError ? error.siteProblems : [],
        },
        prepared.schema,
        prepared.answers,
        prepared.candidate,
      );
      if (diagnosis) {
        const base = evidence({
          repairs: repairs + 1,
          diagnosis: diagnosis.cause,
        });
        if (diagnosis.fixable) {
          // Corrected answers ride along as confirmed answers on the retry.
          await set({
            status: 'QUEUED',
            error: `Fixing and retrying: ${diagnosis.cause}`,
            failure_kind: kind,
            next_attempt_at: null,
            answers: {
              ...((app.answers ?? {}) as Answers),
              ...diagnosis.patches,
            },
            evidence: base,
          });
          return this.emit(
            app,
            'retrying',
            `Found the problem: ${diagnosis.cause} Retrying with the fix.`,
            'QUEUED',
          );
        }
        if (diagnosis.needsSeeker.length) {
          const questions = prepared.schema.fields.filter((f) =>
            diagnosis.needsSeeker.includes(f.id),
          );
          await set({ evidence: base });
          return this.park(
            app,
            {
              reason: 'questions',
              message: `${diagnosis.cause} I need this from you once, then I'll retry by myself.`,
              questions,
            },
            'unknown_fact',
          );
        }
        // Understood but not fixable by answers: say so instead of a raw error.
        error = Object.assign(error, {
          message: `${diagnosis.cause} (${error.message})`,
        });
      }
    }

    if (error instanceof PermanentApplyError) {
      this.logger.warn(
        `[${app.id}] submission FAILED (${kind}): ${error.message}`,
      );
      await set({
        status: 'FAILED',
        error: error.message,
        failure_kind: kind,
        evidence: evidence({ repairs }),
      });
      return this.emit(app, 'failed', error.message, 'FAILED');
    }

    // Transient (timeout, navigation, 5xx): back off and try again.
    this.logger.warn(
      `Application ${app.id} attempt ${app.attempts} failed: ${error.message}`,
    );
    if (app.attempts >= this.env.applyMaxAttempts) {
      await set({
        status: 'FAILED',
        error: `Gave up after ${app.attempts} attempts: ${error.message}`,
        failure_kind: 'site_error',
        evidence: evidence({ repairs }),
      });
      return this.emit(
        app,
        'failed',
        `Gave up after ${app.attempts} attempts`,
        'FAILED',
      );
    }
    const minutes =
      BACKOFF_MIN[Math.min(app.attempts - 1, BACKOFF_MIN.length - 1)];
    await set({
      status: 'QUEUED',
      error: error.message,
      failure_kind: 'site_error',
      next_attempt_at: new Date(Date.now() + minutes * 60_000),
    });
    this.emit(
      app,
      'retrying',
      `Attempt ${app.attempts} failed — retrying in ${minutes} min`,
      'QUEUED',
    );
  }

  // Writes a resume for this job with the shared resume engine, on its own
  // (auto mode never asks). Never blocks applying: any failure falls back to
  // the uploaded CV. Only "skip" and "ask the seeker about skill gaps" exit early.
  private async tailorFor(
    app: ClaimedApplication,
    confirmed: Answers,
    emit: (step: ApplyStep, message: string) => void,
  ): Promise<{ park?: NeedsInput; pdf?: Buffer }> {
    if (confirmed[RESUME_POLICY] === POLICY_SKIP)
      throw new SkipApplicationError(
        'You chose to skip this job because it asks for skills your profile does not show.',
        'ineligible',
      );
    if (!this.env.applyTailorResume || !app.job.description) return {};
    try {
      emit('drafting', 'Writing a resume for this job');
      const yes = Object.entries(confirmed)
        .filter(([k, v]) => k.startsWith(RESUME_SKILL) && v === 'Yes')
        .map(([k]) => k.slice(RESUME_SKILL.length));
      // Asked once: after the seeker answered, gaps no longer block.
      const result = await this.resumeEngine.build({
        jobSeekerId: app.job_seeker_id,
        mode: 'auto',
        targetRole: app.job.title,
        jobDescription: app.job.description,
        jobCountry: app.job.location ? resolveCountry(app.job.location) : null,
        confirmedSkills: yes,
        ignoreGaps: confirmed[RESUME_POLICY] !== undefined,
      });
      if (result.status === 'needs_input') {
        if (result.kind !== 'skill_gaps') return {};
        return {
          park: {
            reason: 'resume',
            message: `This job asks for ${result.gaps.join(', ')}, which I can't see in your profile. Tell me what is true so your resume never claims more than you've done.`,
            questions: [
              ...result.gaps.map<PendingQuestion>((g) => ({
                id: RESUME_SKILL + g,
                label: `Do you have real experience with ${g}?`,
                type: 'choice',
                required: true,
                options: ['Yes', 'Partly', 'No'],
              })),
              {
                id: RESUME_POLICY,
                label: 'If you are missing some of these, what should I do?',
                type: 'choice',
                required: true,
                options: [POLICY_APPLY, POLICY_SKIP],
              },
            ],
          },
        };
      }
      const key = await this.storage.putBuffer(
        `resumes/${app.job_seeker_id}/${app.id}.pdf`,
        result.pdf,
        'application/pdf',
      );
      await this.prisma.jobApplication.update({
        where: { id: app.id },
        data: {
          resume_key: key,
          resume_strategy: {
            ...result.strategy,
            checks: result.checks,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return { pdf: result.pdf };
    } catch (error) {
      this.logger.warn(
        `[${app.id}] Resume tailoring failed, using uploaded CV: ${(error as Error).message}`,
      );
      return {};
    }
  }

  // Waiting on the seeker is not a failed attempt.
  private async park(
    app: ClaimedApplication,
    needs: NeedsInput,
    kind: FailureKind | null = null,
  ) {
    await this.prisma.jobApplication.update({
      where: { id: app.id },
      data: {
        status: 'NEEDS_INPUT',
        failure_kind: kind,
        attempts: { decrement: 1 },
        needs_input: needs as unknown as Prisma.InputJsonValue,
      },
    });
    this.emit(app, 'needs_input', needs.message, 'NEEDS_INPUT');
  }

  private emit(
    app: JobApplication,
    step: ApplyStep,
    message: string,
    status: string,
  ) {
    this.publishEvent(app, step, message, status);
    if (NOTIFY_APPLICATION_STATUSES.includes(status)) void this.notify(app.id);
  }

  // Live event + remembered timeline, without a bell notification.
  private publishEvent(
    app: Pick<JobApplication, 'id' | 'job_id' | 'job_seeker_id' | 'attempts'>,
    step: ApplyStep,
    message: string,
    status: string,
  ) {
    this.logger.log(`[${app.id}] ${step}: ${message}`);
    const event: ApplyEvent = {
      applicationId: app.id,
      jobId: app.job_id,
      status,
      step,
      message,
      attempt: app.attempts,
      at: new Date().toISOString(),
    };
    // `claimed` opens a new attempt: the timeline is per attempt, not forever.
    const previous =
      step === 'claimed' ? [] : (this.timelines.get(app.id) ?? []);
    const events = [...previous, event].slice(-20);
    this.timelines.delete(app.id);
    this.timelines.set(app.id, events);
    // Also on the row, so the application page can explain a failure after
    // a restart. Fire and forget: a lost step must never break applying.
    void this.prisma.jobApplication
      .update({
        where: { id: app.id },
        data: { events: events as unknown as Prisma.InputJsonValue },
      })
      .catch(() => undefined);
    // Oldest application's timeline goes first once the cap is hit.
    if (this.timelines.size > 300)
      this.timelines.delete(this.timelines.keys().next().value as string);
    this.bus.publish(app.job_seeker_id, event);
  }

  // Bell + toasts: read the row back so the text matches the stored feed.
  private async notify(id: string) {
    const row = await this.prisma.jobApplication.findUnique({
      where: { id },
      include: { job: { select: { title: true, company: true } } },
    });
    if (row)
      this.notifications.publish(
        row.job_seeker_id,
        applicationNotification(row),
      );
  }

  // --- Candidate ------------------------------------------------------

  private async loadCandidate(jobSeekerId: string): Promise<Candidate> {
    const seeker = await this.prisma.jobSeeker.findUniqueOrThrow({
      where: { id: jobSeekerId },
      include: {
        user: true,
        preferences: true,
        social_links: true,
        experiences: { orderBy: { start_date: 'desc' } },
        educations: { orderBy: { end_date: 'desc' } },
        languages: true,
        certifications: true,
        documents: {
          where: { type: 'CV_RESUME', status: 'READY' },
          select: { id: true },
          take: 1,
        },
      },
    });
    const prefs = seeker.preferences;
    const social = (platform: string) =>
      seeker.social_links.find((l) =>
        l.platform.toLowerCase().includes(platform),
      )?.url;
    const location = seeker.location as {
      city?: string;
      country?: string;
    } | null;
    const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
    const current =
      seeker.experiences.find((e) => !e.end_date) ?? seeker.experiences[0];

    // Names typed IN CAPITALS at signup shouldn't shout at a recruiter.
    const fullName = presentableName(seeker.user.full_name);
    return {
      fullName,
      ...splitName(fullName),
      email: seeker.user.email,
      phone: seeker.user.phone,
      location: [location?.city, location?.country].filter(Boolean).join(', '),
      headline: current?.title ?? '',
      currentCompany: current?.company ?? '',
      summary: seeker.bio ?? '',
      skills: seeker.skills,
      links: {
        linkedin: prefs?.linkedin_url ?? social('linkedin'),
        github: prefs?.github_url ?? social('github'),
        portfolio:
          prefs?.portfolio_url ?? seeker.website ?? social('portfolio'),
      },
      preferences: {
        salaryMin: prefs?.salary_min ?? null,
        salaryMax: prefs?.salary_max ?? null,
        salaryCurrency: prefs?.salary_currency ?? null,
        salaryPeriod: prefs?.salary_period ?? null,
        availability: prefs?.availability ?? null,
        yearsExperience: prefs?.years_experience ?? null,
        willingToRelocate: prefs?.willing_to_relocate ?? false,
        visaSponsorshipRequired: prefs?.visa_sponsorship_required ?? false,
        workAuthorization: prefs?.work_authorization ?? [],
        autoApplyConsent: prefs?.auto_apply_consent ?? false,
      },
      languages: seeker.languages.map((l) => ({
        language: l.language,
        proficiency: l.proficiency,
      })),
      certifications: seeker.certifications.map((c) => ({
        name: c.name,
        issuer: c.issuer,
      })),
      hasResume: seeker.documents.length > 0,
      country: location?.country ?? '',
      totalYears: totalYears(
        seeker.experiences.map((e) => ({ start: day(e.start_date) })),
      ),
      facts: (seeker.apply_facts ?? {}) as Record<string, AnswerValue>,
      experiences: seeker.experiences.map((e) => ({
        title: e.title,
        company: e.company,
        start: day(e.start_date),
        end: day(e.end_date),
        description: e.description,
      })),
      educations: seeker.educations.map((e) => ({
        institution: e.institution,
        degree: e.degree,
        field: e.field,
        end: day(e.end_date),
      })),
      answerBank: (seeker.apply_answers ?? {}) as Record<string, AnswerValue>,
    };
  }

  // --- Seeker actions -------------------------------------------------

  events(jobSeekerId: string) {
    return this.bus.stream(jobSeekerId);
  }

  private async own(jobSeekerId: string, id: string) {
    const app = await this.prisma.jobApplication.findFirst({
      where: { id, job_seeker_id: jobSeekerId },
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  // Legacy actions must never touch rows the extension engine owns.
  private async ownLegacy(jobSeekerId: string, id: string) {
    const app = await this.own(jobSeekerId, id);
    assertLegacy(app);
    return app;
  }

  // The seeker confirmed/edited the drafts: save, remember, re-queue.
  async provideAnswers(jobSeekerId: string, id: string, answers: Answers) {
    const app = await this.ownLegacy(jobSeekerId, id);
    if (app.status !== 'NEEDS_INPUT')
      throw new BadRequestException(
        'This application is not waiting for answers',
      );
    const needs = app.needs_input as unknown as NeedsInput | null;
    const missing = (needs?.questions ?? []).filter(
      (q) =>
        q.required && (answers[q.id] === undefined || answers[q.id] === ''),
    );
    if (missing.length)
      throw new BadRequestException(
        `Still unanswered: ${missing.map((q) => q.label).join('; ')}`,
      );

    // Remember by question text so the same question never comes back.
    const seeker = await this.prisma.jobSeeker.findUniqueOrThrow({
      where: { id: jobSeekerId },
      select: { apply_answers: true, apply_facts: true },
    });
    const bank = {
      ...((seeker.apply_answers ?? {}) as Record<string, AnswerValue>),
    };
    const facts = {
      ...((seeker.apply_facts ?? {}) as Record<string, AnswerValue>),
    };
    for (const q of needs?.questions ?? []) {
      if (answers[q.id] === undefined) continue;
      // Per-job resume confirmations are not reusable form answers.
      if (q.id.startsWith(RESUME_SKILL) || q.id === RESUME_POLICY) continue;
      bank[normalizeLabel(q.label)] = answers[q.id];
      // A known intake fact is stored as the fact, so it answers every
      // employer's wording of the question, not just this label.
      if (q.intakeKey) facts[q.intakeKey] = answers[q.id];
    }

    await this.prisma.$transaction([
      this.prisma.jobSeeker.update({
        where: { id: jobSeekerId },
        data: { apply_answers: bank, apply_facts: facts },
      }),
      this.prisma.jobApplication.update({
        where: { id },
        data: {
          status: 'QUEUED',
          answers: {
            ...((app.answers ?? {}) as Answers),
            ...answers,
          },
          needs_input: null,
          next_attempt_at: null,
          error: null,
        },
      }),
    ]);
    this.kick();
    return this.prisma.jobApplication.findUnique({
      where: { id },
      include: { job: true },
    });
  }

  async screenshot(jobSeekerId: string, id: string): Promise<Buffer> {
    const app = await this.own(jobSeekerId, id);
    const key = (app.evidence as { screenshotKey?: string | null } | null)
      ?.screenshotKey;
    if (!key) throw new NotFoundException('No screenshot for this application');
    return this.storage.getObjectBuffer(key);
  }

  // Raise the running application's real browser window (local headed run).
  async liveFocus(jobSeekerId: string, id: string) {
    await this.own(jobSeekerId, id);
    const page = this.livePages.get(id);
    if (!page || page.isClosed())
      throw new NotFoundException('This application is not running right now');
    await page.bringToFront();
  }

  async resume(jobSeekerId: string, id: string): Promise<Buffer> {
    const app = await this.own(jobSeekerId, id);
    if (!app.resume_key)
      throw new NotFoundException('No tailored resume for this application');
    return this.storage.getObjectBuffer(app.resume_key);
  }

  // Everything the single-application page shows.
  async getOne(jobSeekerId: string, id: string) {
    const app = await this.prisma.jobApplication.findFirst({
      where: { id, job_seeker_id: jobSeekerId },
      include: { job: true },
    });
    if (!app) throw new NotFoundException('Application not found');
    const [thread, queue] = await Promise.all([
      app.thread_id
        ? this.prisma.chatThread.findUnique({
            where: { id: app.thread_id },
            select: { id: true, title: true },
          })
        : null,
      this.queueStatus(jobSeekerId),
    ]);
    // Drop the heavy fields the page never renders (raw payload, full text).
    // effective_ats_source: which ATS is actually handling this job, since
    // it may differ from job.source (a Dice-discovered Greenhouse job, say).
    const job = {
      ...app.job,
      raw: undefined,
      description: undefined,
      effective_ats_source: effectiveApplySource(app.job),
    };
    return {
      ...app,
      job,
      thread,
      // Live memory wins while the worker is on it; the row covers restarts.
      events: queue.timelines[id] ?? app.events ?? [],
      place: queue.positions[id] ?? null,
      isCurrent: queue.currentApplicationId === id,
      // The application window is open right now, waiting for a person.
      verificationLive: this.awaitingHuman.has(id),
      worker: queue.worker,
    };
  }

  // Failed (or closed-by-mistake) -> back in line with a clean slate.
  async retry(jobSeekerId: string, id: string) {
    const app = await this.ownLegacy(jobSeekerId, id);
    // Anything that ended without being sent can be run again. Rows waiting
    // on answers or profile details are excluded: re-running changes nothing
    // until the seeker provides them.
    const reason = (app.needs_input as unknown as NeedsInput | null)?.reason;
    const rerunnable =
      ['FAILED', 'EXPIRED', 'SKIPPED'].includes(app.status) ||
      (app.status === 'NEEDS_INPUT' && reason === 'ready');
    if (!rerunnable)
      throw new BadRequestException('This application cannot be run again');
    await this.prisma.jobApplication.update({
      where: { id },
      data: {
        status: 'QUEUED',
        failure_kind: null,
        // Retrying something Plato skipped as "not a fit" is the seeker
        // overruling that judgment.
        ...(app.failure_kind === 'ineligible' && {
          answers: {
            ...((app.answers ?? {}) as Answers),
            [APPLY_ANYWAY]: true,
          },
        }),
        attempts: 0,
        error: null,
        next_attempt_at: null,
        needs_input: null,
      },
    });
    this.kick();
    return this.getOne(jobSeekerId, id);
  }

  // Take it out of Plato's hands. Not while the worker is on it, and a sent
  // application can't be unsent.
  async withdraw(jobSeekerId: string, id: string) {
    const app = await this.ownLegacy(jobSeekerId, id);
    if (app.status === 'IN_PROGRESS' || this.awaitingHuman.has(id))
      throw new BadRequestException(
        'Plato is applying right now; try again in a minute',
      );
    if (app.status === 'SUBMITTED')
      throw new BadRequestException(
        'This application was already sent to the employer',
      );
    await this.prisma.jobApplication.delete({ where: { id } });
    this.timelines.delete(id);
    return { id, withdrawn: true };
  }

  // "Continue" after a human-verification pause.
  //  - window still open: Plato is already watching it and carries on by
  //    itself the moment the check is completed; just report that.
  //  - window gone (timed out / restart / headless): reopen by re-queueing.
  //    Nothing was submitted, so this can't duplicate an application.
  async continueVerification(jobSeekerId: string, id: string) {
    const app = await this.prisma.jobApplication.findFirst({
      where: { id, job_seeker_id: jobSeekerId },
      include: { job: { select: JOB_ATS_SELECT } },
    });
    if (!app) throw new NotFoundException('Application not found');
    assertLegacy(app);
    if (this.awaitingHuman.has(id))
      return {
        live: true,
        status: app.status,
        message:
          'Plato is watching the application window and will continue as soon as the verification is completed.',
      };
    if (app.status !== 'NEEDS_USER_VERIFICATION')
      throw new BadRequestException(
        'This application is not waiting for verification',
      );
    await this.prisma.jobApplication.update({
      where: { id },
      data: { status: 'QUEUED', next_attempt_at: null, error: null },
    });
    // The person asked for it: don't let the site-wide pause hold it back.
    const atsSource = effectiveApplySource(app.job);
    if (atsSource) {
      this.pausedUntil.delete(atsSource);
      this.humanChecks.delete(atsSource);
    }
    this.kick();
    return {
      live: false,
      status: 'QUEUED',
      message: 'Reopening the application.',
    };
  }

  // CAPTCHA case: the seeker finished the submission by hand.
  async markSubmitted(jobSeekerId: string, id: string) {
    const app = await this.ownLegacy(jobSeekerId, id);
    if (this.awaitingHuman.has(id))
      throw new BadRequestException(
        'Plato is watching the open window and will confirm the submission itself',
      );
    if (!['NEEDS_INPUT', 'NEEDS_USER_VERIFICATION'].includes(app.status))
      throw new BadRequestException('This application is not waiting on you');
    return this.prisma.jobApplication.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        submitted_at: new Date(),
        needs_input: null,
        evidence: { manual: true, at: new Date().toISOString() },
      },
      include: { job: true },
    });
  }
}
