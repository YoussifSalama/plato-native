import { seekerReferenceScore } from '../discovery/match-reasons';
import { toMatchPercent } from '../discovery/discovery-run.helpers';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlertCadence, JobRemoteType } from '@prisma/client';
import { randomBytes } from 'crypto';
import { normalizeCompany } from '../discovery/company';
import { CreditsService } from '../credits/credits.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { JobSeekerService } from '../user/job-seeker.service';
import { AlertMatcherService } from './alert-matcher.service';
import { CADENCE_DAYS, limitsFor } from './alert-rules';

export type NewAlert =
  | {
      kind: 'FIELD';
      title: string;
      location?: string | null;
      remote_only?: boolean;
    }
  | { kind: 'COMPANY'; company: string };

export interface AlertPatch {
  paused?: boolean;
  title?: string;
  location?: string | null;
  remote_only?: boolean;
}

export interface SettingsPatch {
  cadence?: AlertCadence;
  email?: boolean;
  in_app?: boolean;
}

// A seeker's job alerts: what they follow, how often they hear, and what was sent.
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seekers: JobSeekerService,
    private readonly credits: CreditsService,
    private readonly matcher: AlertMatcherService,
    private readonly mail: MailService,
  ) {}

  private async seekerId(userId: string) {
    const s = await this.seekers.getByUserId(userId);
    if (!s) throw new NotFoundException('Job seeker profile not found');
    return s.id;
  }

  private settingsFor(jobSeekerId: string) {
    return this.prisma.alertSettings.upsert({
      where: { job_seeker_id: jobSeekerId },
      create: {
        job_seeker_id: jobSeekerId,
        unsubscribe_token: randomBytes(24).toString('base64url'),
        last_digest_at: null,
      },
      update: {},
    });
  }

  /** Everything the alerts page shows. */
  async overview(userId: string) {
    const id = await this.seekerId(userId);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const [alerts, settings, account, counts, pending, weekly] =
      await Promise.all([
        this.prisma.jobAlert.findMany({
          where: { job_seeker_id: id },
          orderBy: { created_at: 'asc' },
        }),
        this.settingsFor(id),
        this.credits.account(userId),
        this.prisma.alertMatch.groupBy({
          by: ['alert_id'],
          where: { job_seeker_id: id, sent_at: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.alertMatch.count({
          where: { job_seeker_id: id, sent_at: null, dropped: null },
        }),
        // "6 new this week" on each alert: new jobs it picked up in the last 7 days.
        this.prisma.alertMatch.groupBy({
          by: ['alert_id'],
          where: { job_seeker_id: id, created_at: { gte: weekAgo } },
          _count: { _all: true },
        }),
      ]);
    const sent = new Map(counts.map((c) => [c.alert_id, c._count._all]));
    const week = new Map(weekly.map((c) => [c.alert_id, c._count._all]));
    const reach = await this.companyReach(
      id,
      alerts.flatMap((a) =>
        a.kind === 'COMPANY' && a.company ? [a.company] : [],
      ),
    );
    const limits = limitsFor(account.plan);
    const next = settings.last_digest_at
      ? new Date(
          settings.last_digest_at.getTime() +
            CADENCE_DAYS[settings.cadence] * 86_400_000,
        )
      : null;
    return {
      plan: account.plan,
      limits,
      used: {
        field: alerts.filter((a) => a.kind === 'FIELD').length,
        company: alerts.filter((a) => a.kind === 'COMPANY').length,
      },
      alerts: alerts.map((a) => ({
        id: a.id,
        kind: a.kind,
        title: a.title,
        location: a.location,
        remote_only: !!a.remote_only,
        company: a.company,
        paused: a.paused,
        sent: sent.get(a.id) ?? 0,
        new_week: week.get(a.id) ?? 0,
        ...(a.kind === 'COMPANY' && a.company && reach.get(a.company)),
        created_at: a.created_at,
      })),
      settings: {
        cadence: settings.cadence,
        email: settings.email,
        in_app: settings.in_app,
        emailAvailable: this.mail.enabled,
      },
      pending,
      lastDigestAt: settings.last_digest_at,
      nextDigestAt: next,
    };
  }

  async create(userId: string, input: NewAlert) {
    const id = await this.seekerId(userId);
    const { plan } = await this.credits.account(userId);
    const limit = limitsFor(plan)[input.kind === 'FIELD' ? 'field' : 'company'];
    const used = await this.prisma.jobAlert.count({
      where: { job_seeker_id: id, kind: input.kind },
    });
    if (used >= limit)
      throw new ForbiddenException({
        code: 'alert_limit',
        message:
          input.kind === 'FIELD'
            ? `Your plan includes ${limit} job alerts. Remove one or upgrade for more.`
            : `Your plan lets you follow ${limit} companies. Unfollow one or upgrade for more.`,
        limit,
        plan,
      });

    const data =
      input.kind === 'FIELD'
        ? {
            title: input.title.trim().replace(/\s+/g, ' '),
            location: input.location?.trim() || null,
            remote_only: !!input.remote_only,
            company: null,
            company_key: null,
          }
        : (() => {
            const c = normalizeCompany(input.company);
            return {
              title: null,
              location: null,
              remote_only: null,
              company: c.name,
              company_key: c.key,
            };
          })();
    // The same alert twice is just the one alert.
    const twin = await this.prisma.jobAlert.findFirst({
      where:
        input.kind === 'FIELD'
          ? {
              job_seeker_id: id,
              kind: 'FIELD',
              title: { equals: data.title!, mode: 'insensitive' },
              location: data.location,
              remote_only: data.remote_only,
            }
          : {
              job_seeker_id: id,
              kind: 'COMPANY',
              company_key: data.company_key,
            },
    });
    if (twin) return twin;

    await this.settingsFor(id);
    const alert = await this.prisma.jobAlert.create({
      data: { job_seeker_id: id, kind: input.kind, paused: false, ...data },
    });
    await this.matcher.seed(alert);
    return alert;
  }

  async update(userId: string, alertId: string, patch: AlertPatch) {
    const alert = await this.owned(userId, alertId);
    return this.prisma.jobAlert.update({
      where: { id: alert.id },
      data: {
        ...(patch.paused !== undefined && { paused: patch.paused }),
        ...(alert.kind === 'FIELD' && {
          ...(patch.title?.trim() && {
            title: patch.title.trim().replace(/\s+/g, ' '),
          }),
          ...(patch.location !== undefined && {
            location: patch.location?.trim() || null,
          }),
          ...(patch.remote_only !== undefined && {
            remote_only: patch.remote_only,
          }),
        }),
      },
    });
  }

  async remove(userId: string, alertId: string) {
    const alert = await this.owned(userId, alertId);
    // Jobs it found but hasn't sent yet go with it; sent ones stay in their digests.
    await this.prisma.alertMatch.deleteMany({
      where: { alert_id: alert.id, sent_at: null },
    });
    await this.prisma.jobAlert.delete({ where: { id: alert.id } });
    return { ok: true };
  }

  async updateSettings(userId: string, patch: SettingsPatch) {
    const id = await this.seekerId(userId);
    await this.settingsFor(id);
    const s = await this.prisma.alertSettings.update({
      where: { job_seeker_id: id },
      data: patch,
    });
    return { cadence: s.cadence, email: s.email, in_app: s.in_app };
  }

  /** Recent digests and their jobs. A job that has closed since is marked, not hidden. */
  async digests(userId: string, limit = 10) {
    const id = await this.seekerId(userId);
    const digests = await this.prisma.alertDigest.findMany({
      where: { job_seeker_id: id },
      orderBy: { created_at: 'desc' },
      take: Math.min(Math.max(limit, 1), 30),
    });
    const ids = digests.flatMap((d) => d.job_ids);
    const [jobs, matches, reference] = await Promise.all([
      this.prisma.job.findMany({ where: { id: { in: ids } } }),
      // The seeker's own match for a digest job, when Plato ranked it for them.
      this.prisma.jobSeekerJobMatch.findMany({
        where: { job_seeker_id: id, job_id: { in: ids } },
        select: { job_id: true, match_score: true },
      }),
      seekerReferenceScore(this.prisma, id),
    ]);
    const byId = new Map(jobs.map((j) => [j.id, j]));
    const scoreOf = new Map(matches.map((m) => [m.job_id, m.match_score]));
    return digests.map((d) => ({
      id: d.id,
      headline: d.headline,
      at: d.created_at,
      emailed: d.emailed,
      jobs: d.job_ids
        .map((jid) => byId.get(jid))
        .filter((j) => !!j)
        .map((j) => ({
          id: j.id,
          title: j.title,
          company: j.company,
          location: j.location,
          remote: j.remote_type === JobRemoteType.REMOTE,
          posted_at: j.posted_at,
          url: j.apply_url || j.url,
          closed: !!j.expired_at,
          match_percent: scoreOf.has(j.id)
            ? toMatchPercent(scoreOf.get(j.id), reference)
            : null,
        })),
    }));
  }

  /**
   * For each followed company: open roles Plato knows of, and how many of them are in
   * this seeker's matches ("14 for you · 212 open").
   */
  private async companyReach(seekerId: string, companies: string[]) {
    const out = new Map<
      string,
      { open: number; for_you: number; where: string | null }
    >();
    await Promise.all(
      [...new Set(companies)].map(async (name) => {
        const company = { equals: name, mode: 'insensitive' as const };
        const live = {
          OR: [{ expired_at: null }, { expired_at: { isSet: false } }],
        };
        const [open, forYou, latest] = await Promise.all([
          this.prisma.job.count({
            where: { company, source: { not: 'MANUAL' }, ...live },
          }),
          this.prisma.jobSeekerJobMatch.count({
            where: {
              job_seeker_id: seekerId,
              hidden: false,
              job: { is: { company, ...live } },
            },
          }),
          // Where it hires: the place on its newest open role, for the card's sub-line.
          this.prisma.job.findFirst({
            where: { company, source: { not: 'MANUAL' }, ...live },
            orderBy: { created_at: 'desc' },
            select: { location: true },
          }),
        ]);
        out.set(name, {
          open,
          for_you: forYou,
          where: latest?.location ?? null,
        });
      }),
    );
    return out;
  }

  /**
   * "More companies to follow": the companies behind most of this seeker's own matches (built from their titles,
   * level and places), not followed yet, each with one of the matching roles as the reason.
   */
  async suggested(userId: string) {
    const id = await this.seekerId(userId);
    const [matches, follows] = await Promise.all([
      this.prisma.jobSeekerJobMatch.findMany({
        where: {
          job_seeker_id: id,
          hidden: false,
          job: {
            is: {
              source: { not: 'MANUAL' },
              OR: [{ expired_at: null }, { expired_at: { isSet: false } }],
            },
          },
        },
        select: { job: { select: { company: true, title: true } } },
        orderBy: { discovered_at: 'desc' },
        take: 1000,
      }),
      this.prisma.jobAlert.findMany({
        where: { job_seeker_id: id, kind: 'COMPANY' },
        select: { company_key: true },
      }),
    ]);
    const followed = new Set(follows.map((f) => f.company_key));
    const by = new Map<
      string,
      { name: string; key: string; jobs: number; titles: Map<string, number> }
    >();
    for (const { job } of matches) {
      const c = normalizeCompany(job.company);
      if (!c.key || followed.has(c.key)) continue;
      const hit = by.get(c.key) ?? { ...c, jobs: 0, titles: new Map() };
      hit.jobs++;
      hit.titles.set(job.title, (hit.titles.get(job.title) ?? 0) + 1);
      by.set(c.key, hit);
    }
    return [...by.values()]
      .sort((a, b) => b.jobs - a.jobs)
      .slice(0, 5)
      .map(({ titles, ...c }) => ({
        ...c,
        example: [...titles].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      }));
  }

  /** Company names in the index, for the follow box. */
  async companies(q: string) {
    const term = q.trim();
    if (term.length < 2) return [];
    const rows = await this.prisma.job.findMany({
      where: {
        company: { contains: term, mode: 'insensitive' },
        expired_at: null,
        // A pasted link's "company" is just its host name: never shown to others.
        source: { not: 'MANUAL' },
      },
      select: { company: true },
      orderBy: { created_at: 'desc' },
      take: 400,
    });
    const seen = new Map<string, { name: string; key: string; jobs: number }>();
    for (const r of rows) {
      const c = normalizeCompany(r.company);
      if (!c.key) continue;
      const hit = seen.get(c.key);
      if (hit) hit.jobs++;
      else seen.set(c.key, { ...c, jobs: 1 });
    }
    return [...seen.values()].sort((a, b) => b.jobs - a.jobs).slice(0, 8);
  }

  /** The link in every email. No login: the token is the proof. */
  async unsubscribe(token: string) {
    if (!token) return { ok: false };
    const r = await this.prisma.alertSettings.updateMany({
      where: { unsubscribe_token: token },
      data: { email: false },
    });
    return { ok: r.count > 0 };
  }

  private async owned(userId: string, alertId: string) {
    if (!/^[a-f0-9]{24}$/i.test(alertId))
      throw new NotFoundException('Alert not found');
    const id = await this.seekerId(userId);
    const alert = await this.prisma.jobAlert.findFirst({
      where: { id: alertId, job_seeker_id: id },
    });
    if (!alert) throw new NotFoundException('Alert not found');
    return alert;
  }
}
