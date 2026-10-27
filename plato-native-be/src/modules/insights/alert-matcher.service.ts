import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { JobAlert } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JobLike, matchesAlert, withinLimits } from './alert-rules';

const CURSOR = 'alert-matcher';
const EVERY_MS = 15 * 60_000;
const BATCH = 500;
// A new alert starts with what the index found in the last few days, so the
// first digest isn't empty.
const SEED_DAYS = 3;

const JOB_FIELDS = {
  id: true,
  source: true,
  title: true,
  company: true,
  location: true,
  remote_type: true,
  posted_at: true,
  created_at: true,
  expired_at: true,
  checked_at: true,
} as const;

// Walks jobs as they enter the shared index, from any source: another seeker's
// search, the alert backfill, a pasted link. Every job is matched once against
// every alert. Matches are held for the digest; nothing is sent from here.
// Seekers never see whose search found a job: a match only records the job.
@Injectable()
export class AlertMatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertMatcherService.name);
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.INSIGHTS_JOBS === 'off') return;
    const first = setTimeout(() => void this.scan(), 60_000);
    const loop = setInterval(() => void this.scan(), EVERY_MS);
    first.unref();
    loop.unref();
    this.timers.push(first, loop);
  }

  onModuleDestroy() {
    this.timers.forEach(clearTimeout);
  }

  /** Match every job added since the last scan. Returns how many matches were held. */
  async scan(now = new Date()) {
    if (this.running) return 0;
    this.running = true;
    try {
      const cursor = await this.prisma.insightsCursor.findUnique({
        where: { key: CURSOR },
      });
      // First run ever: start from yesterday, not the whole history.
      let since = cursor?.at ?? new Date(now.getTime() - 86_400_000);
      const alerts = await this.activeAlerts();
      let held = 0;
      for (;;) {
        const jobs = await this.prisma.job.findMany({
          where: { created_at: { gt: since }, expired_at: null },
          orderBy: { created_at: 'asc' },
          take: BATCH,
          select: JOB_FIELDS,
        });
        if (!jobs.length) break;
        if (alerts.length) held += await this.hold(alerts, jobs);
        since = jobs[jobs.length - 1].created_at;
        await this.prisma.insightsCursor.upsert({
          where: { key: CURSOR },
          create: { key: CURSOR, at: since },
          update: { at: since },
        });
        if (jobs.length < BATCH) break;
      }
      if (held) this.logger.log(`Job alerts: held ${held} new match(es)`);
      return held;
    } finally {
      this.running = false;
    }
  }

  /** A new alert: look back over the last few days of the index. */
  async seed(alert: JobAlert, now = new Date()) {
    const jobs = await this.prisma.job.findMany({
      where: {
        created_at: { gte: new Date(now.getTime() - SEED_DAYS * 86_400_000) },
        expired_at: null,
      },
      orderBy: { created_at: 'desc' },
      take: 5000,
      select: JOB_FIELDS,
    });
    return this.hold([alert], jobs);
  }

  // Alerts that count: not paused, and within the seeker's plan after a downgrade.
  private async activeAlerts(): Promise<JobAlert[]> {
    const alerts = await this.prisma.jobAlert.findMany({
      where: { paused: false },
    });
    if (!alerts.length) return [];
    const seekers = [...new Set(alerts.map((a) => a.job_seeker_id))];
    const people = await this.prisma.jobSeeker.findMany({
      where: { id: { in: seekers } },
      select: { id: true, user_id: true },
    });
    const accounts = await this.prisma.creditAccount.findMany({
      where: { user_id: { in: people.map((p) => p.user_id) } },
      select: { user_id: true, plan: true },
    });
    const planOf = new Map(
      people.map((p) => [
        p.id,
        accounts.find((a) => a.user_id === p.user_id)?.plan ?? 'free',
      ]),
    );
    return seekers.flatMap((s) =>
      withinLimits(
        alerts.filter((a) => a.job_seeker_id === s),
        planOf.get(s) ?? 'free',
      ),
    );
  }

  private async hold(alerts: JobAlert[], jobs: JobLike[]) {
    let held = 0;
    for (const job of jobs) {
      // One match per seeker per job, even when two of their alerts fit.
      const taken = new Set<string>();
      for (const alert of alerts) {
        if (taken.has(alert.job_seeker_id) || !matchesAlert(alert, job))
          continue;
        taken.add(alert.job_seeker_id);
        try {
          // Already held or sent before: leave it as it is, never twice.
          await this.prisma.alertMatch.upsert({
            where: {
              job_seeker_id_job_id: {
                job_seeker_id: alert.job_seeker_id,
                job_id: job.id,
              },
            },
            create: {
              job_seeker_id: alert.job_seeker_id,
              alert_id: alert.id,
              job_id: job.id,
              digest_id: null,
              sent_at: null,
              dropped: null,
            },
            update: {},
          });
          held++;
        } catch (err) {
          this.logger.warn(`Alert match ${alert.id}/${job.id}: ${String(err)}`);
        }
      }
    }
    return held;
  }
}
