import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AlertCadence, JobRemoteType } from '@prisma/client';
import { probeListing } from '../discovery/job-freshness.service';
import { MailService } from '../mail/mail.service';
import { NotificationsBus } from '../notifications/notifications.bus';
import { alertNotification } from '../notifications/notification-factory';
import { PrismaService } from '../prisma/prisma.service';
import { headline, isDue, sendable, verdict } from './alert-rules';
import { digestEmail } from './digest-email';

const EVERY_MS = 60 * 60_000;

export const CADENCE_LABEL: Record<AlertCadence, string> = {
  DAILY: 'once a day',
  EVERY_3_DAYS: 'every 3 days',
  WEEKLY: 'once a week',
};

const appUrl = () =>
  (process.env.FRONTEND_URL ?? 'http://localhost:3001').replace(/\/$/, '');

// Turns held matches into one digest per seeker on their cadence: an in-app
// notification and (if on) one email. Every job is checked right before it
// goes out, and closed or stale ones are dropped. Nothing new, nothing sent.
@Injectable()
export class DigestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DigestService.name);
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly bus: NotificationsBus,
  ) {}

  onModuleInit() {
    if (process.env.INSIGHTS_JOBS === 'off') return;
    const first = setTimeout(() => void this.sendDue(), 5 * 60_000);
    const loop = setInterval(() => void this.sendDue(), EVERY_MS);
    first.unref();
    loop.unref();
    this.timers.push(first, loop);
  }

  onModuleDestroy() {
    this.timers.forEach(clearTimeout);
  }

  /** Every seeker whose digest is due and who has something new. */
  async sendDue(now = new Date()) {
    if (this.running) return { sent: 0 };
    this.running = true;
    let sent = 0;
    try {
      const pending = await this.prisma.alertMatch.findMany({
        where: { sent_at: null, dropped: null },
        select: { job_seeker_id: true },
        distinct: ['job_seeker_id'],
      });
      const settings = await this.prisma.alertSettings.findMany({
        where: { job_seeker_id: { in: pending.map((p) => p.job_seeker_id) } },
      });
      for (const s of settings) {
        if (!isDue(s, now)) continue;
        try {
          if (await this.sendOne(s.job_seeker_id, now)) sent++;
        } catch (err) {
          this.logger.warn(`Digest for ${s.job_seeker_id}: ${String(err)}`);
        }
      }
      if (sent) this.logger.log(`Job alerts: sent ${sent} digest(s)`);
      return { sent };
    } finally {
      this.running = false;
    }
  }

  /** One seeker's digest. Returns the digest id, or null when nothing could go out. */
  async sendOne(jobSeekerId: string, now = new Date()) {
    const settings = await this.prisma.alertSettings.findUnique({
      where: { job_seeker_id: jobSeekerId },
    });
    if (!settings) return null;
    const matches = await this.prisma.alertMatch.findMany({
      where: { job_seeker_id: jobSeekerId, sent_at: null, dropped: null },
    });
    if (!matches.length) return null;
    const jobs = await this.prisma.job.findMany({
      where: { id: { in: matches.map((m) => m.job_id) } },
    });

    // The last look before sending: never a closed or stale job.
    const ok = new Set<string>();
    const dropped = new Map<string, string>();
    const toCheck: typeof jobs = [];
    for (const job of jobs) {
      const v = verdict(job, now);
      if ('check' in v) toCheck.push(job);
      else if (v.send) ok.add(job.id);
      else dropped.set(job.id, v.reason);
    }
    for (let i = 0; i < toCheck.length; i += 5)
      await Promise.all(
        toCheck.slice(i, i + 5).map(async (job) => {
          const gone = await probeListing(job.apply_url ?? job.url);
          await this.prisma.job.update({
            where: { id: job.id },
            data: { checked_at: now, ...(gone && { expired_at: now }) },
          });
          // Couldn't tell (blocked, timeout): treat like a board we can't check.
          const keep =
            gone === false ||
            (gone === null && sendable(verdict(job, now, false)));
          if (keep) ok.add(job.id);
          else dropped.set(job.id, gone ? 'closed' : 'unverified');
        }),
      );
    // A job whose row is gone can't be sent either.
    for (const m of matches)
      if (!ok.has(m.job_id) && !dropped.has(m.job_id))
        dropped.set(m.job_id, 'closed');

    for (const [reason, ids] of groupBy(dropped))
      await this.prisma.alertMatch.updateMany({
        where: { job_seeker_id: jobSeekerId, job_id: { in: ids } },
        data: { dropped: reason },
      });
    if (!ok.size) return null;

    const send = jobs
      .filter((j) => ok.has(j.id))
      .sort(
        (a, b) =>
          (b.posted_at ?? b.created_at).getTime() -
          (a.posted_at ?? a.created_at).getTime(),
      );
    const alerts = await this.prisma.jobAlert.findMany({
      where: { job_seeker_id: jobSeekerId },
    });
    const alertOf = new Map(matches.map((m) => [m.job_id, m.alert_id]));
    const line = headline(
      send.map((j) => ({ alertId: alertOf.get(j.id)!, company: j.company })),
      alerts,
    );

    const digest = await this.prisma.alertDigest.create({
      data: {
        job_seeker_id: jobSeekerId,
        job_ids: send.map((j) => j.id),
        headline: line,
        emailed: false,
      },
    });
    await this.prisma.alertMatch.updateMany({
      where: {
        job_seeker_id: jobSeekerId,
        job_id: { in: send.map((j) => j.id) },
      },
      data: { sent_at: now, digest_id: digest.id },
    });
    await this.prisma.alertSettings.update({
      where: { job_seeker_id: jobSeekerId },
      data: { last_digest_at: now },
    });

    if (settings.in_app)
      this.bus.publish(jobSeekerId, alertNotification(digest));

    if (settings.email && this.mail.enabled) {
      const seeker = await this.prisma.jobSeeker.findUnique({
        where: { id: jobSeekerId },
        select: {
          user: {
            select: { email: true, full_name: true, email_verified_at: true },
          },
        },
      });
      // Only to an address its owner confirmed: never mail a typo'd or borrowed one.
      if (seeker?.user.email && seeker.user.email_verified_at) {
        const unsubscribeUrl = `${appUrl()}/unsubscribe?token=${settings.unsubscribe_token}`;
        const mail = digestEmail({
          name: seeker.user.full_name,
          headline: line,
          jobs: send.map((j) => ({
            title: j.title,
            company: j.company,
            location: j.location,
            remote: j.remote_type === JobRemoteType.REMOTE,
            posted_at: j.posted_at,
            url: j.apply_url ?? j.url,
          })),
          appUrl: appUrl(),
          unsubscribeUrl,
          cadenceLabel: CADENCE_LABEL[settings.cadence],
          now,
        });
        // One-click unsubscribe straight to the API when its public URL is known.
        const api = process.env.API_PUBLIC_URL?.replace(/\/$/, '');
        const emailed = await this.mail.send({
          to: seeker.user.email,
          ...mail,
          category: 'job-alerts',
          unsubscribeUrl: api
            ? `${api}/insights/unsubscribe?token=${settings.unsubscribe_token}`
            : undefined,
        });
        if (emailed)
          await this.prisma.alertDigest.update({
            where: { id: digest.id },
            data: { emailed: true },
          });
      }
    }
    return digest.id;
  }
}

function groupBy(m: Map<string, string>) {
  const out = new Map<string, string[]>();
  for (const [id, reason] of m)
    out.set(reason, [...(out.get(reason) ?? []), id]);
  return out;
}
