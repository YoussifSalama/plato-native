import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountService } from '../auth/account.service';
import { forgetSessions } from '../auth/session-state';
import { CreditsService } from '../credits/credits.service';
import { clearRateLimitsFor } from '../extension/extension-token';
import { PrismaService } from '../prisma/prisma.service';
import {
  ejDate,
  ejId,
  num,
  OBJECT_ID,
  parseSort,
  PAGE_SIZE,
  type Range,
  round,
  str,
  sumBy,
  tokensSpentBy,
  usageGroups,
} from '../usage/usage-stats';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ej = Record<string, any>;
const notSet = (f: string) => ({ OR: [{ [f]: null }, { [f]: { isSet: false } }] });
const day = (d: Date) => d.toISOString().slice(0, 10);
/** Monday of the day's ISO week. */
const weekOf = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return day(t);
};
const top = <K extends string>(values: string[], key: K, n = 10) => {
  const m = new Map<string, number>();
  for (const v of values) {
    const k = v.trim();
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m]
    .map(([v, count]) => ({ [key]: v, count }) as { [P in K]: string } & { count: number })
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
};

// Admin panel, Users page: the seeker list, one seeker's use of Plato (from
// existing data only: usage, chat, applications, searches, interviews, tokens),
// and the support actions (block, verify, sign out, clear rate limits).
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly account: AccountService,
  ) {}

  /** Max of the activity dates per user: usage, chat threads, applications, searches. */
  private async lastActive(userIds: string[]) {
    const seekers = await this.prisma.jobSeeker.findMany({
      where: { user_id: { in: userIds } },
      select: { id: true, user_id: true },
    });
    const userOf = new Map(seekers.map((s) => [s.id, s.user_id]));
    const sIds = seekers.map((s) => ejId(s.id));
    const maxBy = async (
      model: { aggregateRaw: (a: { pipeline: Ej[] }) => Promise<unknown> },
      key: string,
      field: string,
      ids: unknown[],
    ) =>
      ids.length
        ? ((await model.aggregateRaw({
            pipeline: [
              { $match: { [key]: { $in: ids } } },
              { $group: { _id: `$${key}`, last: { $max: `$${field}` } } },
            ],
          })) as { _id: unknown; last: unknown }[])
        : [];
    const [usage, threads, apps, runs] = await Promise.all([
      maxBy(this.prisma.usageEvent, 'user_id', 'created_at', userIds.map(ejId)),
      maxBy(this.prisma.chatThread, 'job_seeker_id', 'updated_at', sIds),
      maxBy(this.prisma.jobApplication, 'job_seeker_id', 'updated_at', sIds),
      maxBy(this.prisma.discoveryRun, 'job_seeker_id', 'started_at', sIds),
    ]);
    const last = new Map<string, Date>();
    const put = (u: string | null | undefined, v: unknown) => {
      const s = str(v);
      if (!u || !s) return;
      const d = new Date(s);
      if (!isNaN(d.getTime()) && d > (last.get(u) ?? new Date(0))) last.set(u, d);
    };
    for (const r of usage) put(str(r._id), r.last);
    for (const r of [...threads, ...apps, ...runs]) put(userOf.get(str(r._id) ?? ''), r.last);
    return last;
  }

  /** How many users did anything in `range` (usage, chat, applications, searches): the Dashboard's "active". */
  async activeUsers(range: Range) {
    const at = { $gte: ejDate(range.from), $lt: ejDate(range.to) };
    const distinct = async (
      model: { aggregateRaw: (a: { pipeline: Ej[] }) => Promise<unknown> },
      key: string,
      field: string,
    ) =>
      ((await model.aggregateRaw({
        pipeline: [{ $match: { [field]: at } }, { $group: { _id: `$${key}` } }],
      })) as { _id: unknown }[])
        .map((r) => str(r._id))
        .filter((s): s is string => !!s);
    const [usage, threads, apps, runs] = await Promise.all([
      distinct(this.prisma.usageEvent, 'user_id', 'created_at'),
      distinct(this.prisma.chatThread, 'job_seeker_id', 'updated_at'),
      distinct(this.prisma.jobApplication, 'job_seeker_id', 'updated_at'),
      distinct(this.prisma.discoveryRun, 'job_seeker_id', 'started_at'),
    ]);
    const sIds = [...new Set([...threads, ...apps, ...runs])];
    const seekers = sIds.length
      ? await this.prisma.jobSeeker.findMany({
          where: { id: { in: sIds } },
          select: { user_id: true },
        })
      : [];
    return new Set([...usage, ...seekers.map((s) => s.user_id)]).size;
  }

  private async costAllTime(userIds: string[]) {
    const rows = (await this.prisma.usageEvent.aggregateRaw({
      pipeline: [
        { $match: { user_id: { $in: userIds.map(ejId) } } },
        { $group: { _id: '$user_id', cost: { $sum: { $ifNull: ['$cost_usd', 0] } } } },
      ],
    })) as unknown as { _id: unknown; cost: unknown }[];
    return new Map(rows.map((r) => [str(r._id) ?? '', round(num(r.cost))]));
  }

  /** The list rows for these users, in this order. */
  private async rows(
    users: { id: string; full_name: string; email: string; created_at: Date; email_verified_at: Date | null; blocked_at: Date | null }[],
  ) {
    const ids = users.map((u) => u.id);
    const [accounts, last, cost] = await Promise.all([
      this.prisma.creditAccount.findMany({
        where: { user_id: { in: ids } },
        select: { user_id: true, plan: true, balance: true },
      }),
      this.lastActive(ids),
      this.costAllTime(ids),
    ]);
    const acc = new Map(accounts.map((a) => [a.user_id, a]));
    return users.map((u) => ({
      id: u.id,
      name: u.full_name,
      email: u.email,
      createdAt: u.created_at,
      verified: !!u.email_verified_at,
      blocked: !!u.blocked_at,
      plan: acc.get(u.id)?.plan ?? 'free',
      balance: acc.has(u.id) ? round(acc.get(u.id)!.balance, 1) : null,
      lastActiveAt: last.get(u.id) ?? null,
      costUsd: cost.get(u.id) ?? 0,
    }));
  }

  private readonly userSelect = {
    id: true,
    full_name: true,
    email: true,
    created_at: true,
    email_verified_at: true,
    blocked_at: true,
  } as const;

  /** sort = [-]createdAt (default -createdAt) | email | name | balance | costUsd | lastActiveAt. */
  async list(q: string | undefined, status: string, page: number, sort: string) {
    const needle = q?.trim();
    const where: Prisma.UserWhereInput = {
      AND: [
        needle
          ? {
              OR: [
                { email: { contains: needle, mode: 'insensitive' } },
                { full_name: { contains: needle, mode: 'insensitive' } },
                ...(OBJECT_ID.test(needle) ? [{ id: needle }] : []),
              ],
            }
          : {},
        status === 'verified'
          ? { email_verified_at: { not: null } }
          : status === 'unverified'
            ? notSet('email_verified_at')
            : status === 'blocked'
              ? { blocked_at: { not: null } }
              : {},
      ],
    };
    const total = await this.prisma.user.count({ where });
    const skip = (page - 1) * PAGE_SIZE;
    const order = parseSort(
      sort,
      ['createdAt', 'email', 'name', 'balance', 'costUsd', 'lastActiveAt'] as const,
      '-createdAt',
    );
    const dir = order.desc ? 'desc' : 'asc';
    if (order.field === 'balance' || order.field === 'costUsd' || order.field === 'lastActiveAt') {
      // ponytail: computed over every matching user; fine to a few thousand seekers
      const all = await this.prisma.user.findMany({ where, select: this.userSelect });
      const rows = await this.rows(all);
      const key = (r: (typeof rows)[number]) =>
        order.field === 'lastActiveAt'
          ? (r.lastActiveAt?.getTime() ?? 0)
          : order.field === 'balance'
            ? (r.balance ?? 0)
            : r.costUsd;
      rows.sort((a, b) => (order.desc ? key(b) - key(a) : key(a) - key(b)));
      return { items: rows.slice(skip, skip + PAGE_SIZE), total };
    }
    const orderBy: Prisma.UserOrderByWithRelationInput =
      order.field === 'email'
        ? { email: dir }
        : order.field === 'name'
          ? { full_name: dir }
          : { created_at: dir };
    const users = await this.prisma.user.findMany({
      where,
      select: this.userSelect,
      orderBy,
      skip,
      take: PAGE_SIZE,
    });
    return { items: await this.rows(users), total };
  }

  private async user(id: string) {
    const u = OBJECT_ID.test(id)
      ? await this.prisma.user.findUnique({ where: { id }, select: this.userSelect })
      : null;
    if (!u) throw new NotFoundException('No such user');
    return u;
  }

  async row(id: string) {
    return (await this.rows([await this.user(id)]))[0];
  }

  async analytics(id: string, range: Range) {
    const u = await this.prisma.user.findUnique({
      where: { id: OBJECT_ID.test(id) ? id : '000000000000000000000000' },
      select: { ...this.userSelect, blocked_reason: true, job_seeker: { select: { id: true } } },
    });
    if (!u) throw new NotFoundException('No such user');
    const seekerId = u.job_seeker?.id;
    const inRange = { gte: range.from, lt: range.to };
    const bySeeker = <T>(fn: (sid: string) => Promise<T>, none: T) =>
      seekerId ? fn(seekerId) : Promise.resolve(none);
    const [acc, usage, spent, last, usageDays, runs, apps, threads, messages, messageDays, interviews, prefs, exp, cv] =
      await Promise.all([
        this.prisma.creditAccount.findUnique({ where: { user_id: id }, select: { plan: true, balance: true } }),
        usageGroups(this.prisma, range, ['feature'], { userId: id }),
        tokensSpentBy(this.prisma, range, [id]),
        this.lastActive([id]),
        this.prisma.usageEvent.aggregateRaw({
          pipeline: [
            { $match: { user_id: ejId(id), created_at: { $gte: ejDate(range.from), $lt: ejDate(range.to) } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } } } },
          ],
        }) as unknown as Promise<{ _id: unknown }[]>,
        bySeeker(
          (sid) =>
            this.prisma.discoveryRun.findMany({
              where: { job_seeker_id: sid, started_at: inRange },
              select: { query: true, started_at: true },
              take: 2000,
            }),
          [],
        ),
        bySeeker(
          (sid) =>
            this.prisma.jobApplication.findMany({
              where: { job_seeker_id: sid, created_at: inRange },
              select: { status: true, engine: true, created_at: true },
              take: 10000,
            }),
          [],
        ),
        bySeeker((sid) => this.prisma.chatThread.count({ where: { job_seeker_id: sid, created_at: inRange } }), 0),
        bySeeker(
          (sid) => this.prisma.chatMessage.count({ where: { thread: { job_seeker_id: sid }, created_at: inRange } }),
          0,
        ),
        bySeeker(
          (sid) =>
            this.prisma.chatMessage.findMany({
              where: { thread: { job_seeker_id: sid }, role: 'USER', created_at: inRange },
              select: { created_at: true },
              take: 5000,
            }),
          [],
        ),
        bySeeker((sid) => this.prisma.mockInterview.count({ where: { job_seeker_id: sid, created_at: inRange } }), 0),
        bySeeker(
          (sid) =>
            this.prisma.jobSeekerPreference.findUnique({
              where: { job_seeker_id: sid },
              select: { years_experience: true },
            }),
          null,
        ),
        bySeeker(
          (sid) =>
            this.prisma.jobSeekerExperience.findMany({
              where: { job_seeker_id: sid },
              select: { title: true, end_date: true },
              orderBy: { start_date: 'desc' },
              take: 10,
            }),
          [],
        ),
        bySeeker(
          (sid) =>
            this.prisma.jobSeekerDocument.findFirst({
              where: { job_seeker_id: sid, type: 'CV_RESUME' },
              select: { name: true },
              orderBy: { created_at: 'desc' },
            }),
          null,
        ),
      ]);

    // "Visits": distinct days with any activity in the range
    const days = new Set<string>([
      ...usageDays.map((d) => str(d._id) ?? ''),
      ...messageDays.map((m) => day(m.created_at)),
      ...apps.map((a) => day(a.created_at)),
      ...runs.map((r) => day(r.started_at)),
    ]);
    days.delete('');
    const weeks = new Map<string, number>();
    for (const d of days) weeks.set(weekOf(d), (weeks.get(weekOf(d)) ?? 0) + 1);

    const queries = runs.map((r) => (r.query ?? {}) as { titles?: string[]; requestedTitles?: string[]; locations?: string[] });
    const count = (vals: string[]) =>
      vals.reduce<Record<string, number>>((m, v) => ((m[v] = (m[v] ?? 0) + 1), m), {});
    const current = exp.find((e) => !e.end_date) ?? exp[0];
    const costUsd = round(usage.reduce((s, r) => s + r.costUsd, 0));
    return {
      user: {
        id: u.id,
        name: u.full_name,
        email: u.email,
        createdAt: u.created_at,
        verified: !!u.email_verified_at,
        blocked: !!u.blocked_at,
        blockedReason: u.blocked_reason ?? null,
        plan: acc?.plan ?? 'free',
        balance: acc ? round(acc.balance, 1) : null,
      },
      activity: {
        lastActiveAt: last.get(id) ?? null,
        activeDays: days.size,
        activeDaysByWeek: [...weeks]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([week, n]) => ({ week, days: n })),
        events: usage.reduce((s, r) => s + r.events, 0),
      },
      features: sumBy(usage, 'feature', (r) => r.feature ?? '').map((f) => ({
        feature: f.feature,
        events: f.events,
        costUsd: f.costUsd,
      })),
      searches: {
        total: runs.length,
        topTitles: top(queries.flatMap((q) => q.requestedTitles ?? q.titles ?? []), 'title'),
        topLocations: top(queries.flatMap((q) => q.locations ?? []), 'location'),
      },
      applications: {
        total: apps.length,
        byStatus: count(apps.map((a) => a.status)),
        byEngine: count(apps.map((a) => a.engine ?? 'LEGACY')),
      },
      chat: { threads, messages },
      interviews,
      spentTokens: spent.get(id) ?? 0,
      costUsd,
      // minimal on purpose: the owner does not want the personal profile shown here
      profile: {
        ...(current?.title && { headline: current.title }),
        ...(prefs?.years_experience && { yearsExperience: prefs.years_experience }),
        ...(cv?.name && { cvFile: cv.name }),
      },
    };
  }

  async block(id: string, reason: string) {
    await this.user(id);
    await this.prisma.user.update({
      where: { id },
      data: { blocked_at: new Date(), blocked_reason: reason },
    });
    forgetSessions(id); // this instance refuses the sessions at once
    return this.row(id);
  }

  async unblock(id: string) {
    await this.user(id);
    await this.prisma.user.update({
      where: { id },
      data: { blocked_at: null, blocked_reason: null },
    });
    forgetSessions(id);
    return this.row(id);
  }

  /** Same effect as the seeker opening the confirmation link: email confirmed, then the free grant (CreditsService.account). */
  async verifyEmail(id: string) {
    const u = await this.user(id);
    if (!u.email_verified_at)
      await this.prisma.user.update({ where: { id }, data: { email_verified_at: new Date() } });
    await this.credits.account(id);
    return this.row(id);
  }

  /** Every web session and linked browser, like the seeker's own "Sign out everywhere". */
  async logoutAll(id: string) {
    await this.user(id);
    await this.account.signOutEverywhere(id);
    return { ok: true };
  }

  /** Every limiter key tied to the user: ids, email, linked browsers and the IPs seen in their last week of errors. */
  async clearRateLimits(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: OBJECT_ID.test(id) ? id : '000000000000000000000000' },
      select: { id: true, email: true, job_seeker: { select: { id: true } } },
    });
    if (!u) throw new NotFoundException('No such user');
    const sid = u.job_seeker?.id;
    const [devices, logs] = await Promise.all([
      sid
        ? this.prisma.extensionDevice.findMany({ where: { job_seeker_id: sid }, select: { id: true } })
        : Promise.resolve([]),
      // ponytail: the only IPs Plato keeps for a seeker are on their error logs
      this.prisma.errorLog.findMany({
        where: {
          OR: [{ user_id: u.id }, { user_email: u.email }],
          created_at: { gte: new Date(Date.now() - 7 * 86_400_000) },
          ip: { not: null },
        },
        select: { ip: true },
        orderBy: { created_at: 'desc' },
        take: 200,
      }),
    ]);
    const ips = [...new Set(logs.map((l) => l.ip!).filter(Boolean))].slice(0, 20);
    return {
      cleared: clearRateLimitsFor([
        u.id,
        u.email,
        ...(sid ? [sid] : []),
        ...devices.map((d) => d.id),
        ...ips,
      ]),
    };
  }

  static reasonOf(body: unknown) {
    const r = (body as { reason?: unknown } | null)?.reason;
    if (typeof r !== 'string' || r.trim().length < 3 || r.length > 300)
      throw new BadRequestException('A reason of 3 to 300 characters is needed.');
    return r.trim();
  }
}
