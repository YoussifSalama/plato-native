import { Injectable } from '@nestjs/common';
import { planOf } from '../credits/credit-prices';
import { PrismaService } from '../prisma/prisma.service';
import { searchItems, summarize } from '../usage/search-stats';
import { dayStart, nextDay, tzDay, weekOf } from '../usage/tz';
import {
  daysOf,
  ejDate,
  type Range,
  round,
  str,
  sumBy,
  usageGroups,
} from '../usage/usage-stats';
import { memo } from './memo';

type Ej = Record<string, any>;
type Pair = { userId: string; day: string };
const DAY = 86_400_000;

/** The same length of time just before `range`: what the dashboard compares against. */
export const previousRange = (r: Range): Range => ({
  from: new Date(r.from.getTime() - (r.to.getTime() - r.from.getTime())),
  to: r.from,
});

/** Change from `before` to `now` as a fraction (0.12 = +12%); null when there is nothing to compare. */
export const change = (now: number | null, before: number | null) =>
  now === null || before === null || before === 0
    ? null
    : Math.round(((now - before) / before) * 1000) / 1000;

// The Dashboard's numbers, the funnel, retention and what needs the owner's attention.
@Injectable()
export class AdminInsightsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Who did anything on which (Cairo) day: usage, chat, applications, searches and page visits.
   * One source of truth for "active" across the dashboard, the trend and retention.
   */
  async activity(range: Range): Promise<Pair[]> {
    return memo(
      `activity:${range.from.toISOString()}:${range.to.toISOString()}`,
      async () => {
        const at = { $gte: ejDate(range.from), $lt: ejDate(range.to) };
        const tz = process.env.ADMIN_TZ || 'Africa/Cairo';
        const pairs = async (
          model: { aggregateRaw: (a: { pipeline: Ej[] }) => Promise<unknown> },
          key: string,
          field: string,
        ) =>
          (
            (await model.aggregateRaw({
              pipeline: [
                { $match: { [field]: at } },
                {
                  $group: {
                    _id: {
                      id: `$${key}`,
                      day: {
                        $dateToString: {
                          format: '%Y-%m-%d',
                          date: `$${field}`,
                          timezone: tz,
                        },
                      },
                    },
                  },
                },
              ],
            })) as { _id: { id: unknown; day: unknown } }[]
          )
            .map((r) => ({ id: str(r._id.id), day: str(r._id.day) }))
            .filter((r): r is { id: string; day: string } => !!r.id && !!r.day);
        const [usage, threads, apps, runs, pages] = await Promise.all([
          pairs(this.prisma.usageEvent, 'user_id', 'created_at'),
          pairs(this.prisma.chatThread, 'job_seeker_id', 'updated_at'),
          pairs(this.prisma.jobApplication, 'job_seeker_id', 'updated_at'),
          pairs(this.prisma.discoveryRun, 'job_seeker_id', 'started_at'),
          this.prisma.pageActivity.findMany({
            where: {
              day: {
                gte: tzDay(range.from),
                lte: tzDay(new Date(range.to.getTime() - 1)),
              },
            },
            select: { user_id: true, day: true },
          }),
        ]);
        const seekerIds = [
          ...new Set([...threads, ...apps, ...runs].map((p) => p.id)),
        ];
        const seekers = seekerIds.length
          ? await this.prisma.jobSeeker.findMany({
              where: { id: { in: seekerIds } },
              select: { id: true, user_id: true },
            })
          : [];
        const userOf = new Map(seekers.map((s) => [s.id, s.user_id]));
        const seen = new Set<string>();
        const out: Pair[] = [];
        const add = (userId: string | undefined, day: string) => {
          if (!userId || seen.has(`${userId}|${day}`)) return;
          seen.add(`${userId}|${day}`);
          out.push({ userId, day });
        };
        for (const p of usage) add(p.id, p.day);
        for (const p of [...threads, ...apps, ...runs])
          add(userOf.get(p.id), p.day);
        for (const p of pages) add(p.user_id, p.day);
        return out;
      },
    );
  }

  /** One period's headline numbers (also computed for the period before, to compare). */
  async period(range: Range) {
    return memo(
      `period:${range.from.toISOString()}:${range.to.toISOString()}`,
      async () => {
        const inRange = { gte: range.from, lt: range.to };
        const [
          signups,
          active,
          usage,
          apps,
          submitted,
          failed,
          errors,
          searches,
          spent,
        ] = await Promise.all([
          this.prisma.user.count({ where: { created_at: inRange } }),
          this.activity(range).then(
            (p) => new Set(p.map((x) => x.userId)).size,
          ),
          usageGroups(this.prisma, range, []),
          this.prisma.jobApplication.count({ where: { created_at: inRange } }),
          this.prisma.jobApplication.count({
            where: { status: 'SUBMITTED', created_at: inRange },
          }),
          this.prisma.jobApplication.count({
            where: { status: 'FAILED', created_at: inRange },
          }),
          this.prisma.errorLog.groupBy({
            by: ['status'],
            where: { created_at: inRange },
            _count: { _all: true },
          }),
          searchItems(this.prisma, range).then(summarize),
          this.prisma.creditLedger.aggregate({
            where: { kind: 'consume', created_at: inRange },
            _sum: { amount: true },
          }),
        ]);
        const costUsd = usage.reduce((s, r) => s + r.costUsd, 0);
        const count = (f: (s: number) => boolean) =>
          errors
            .filter((e) => f(e.status))
            .reduce((s, e) => s + e._count._all, 0);
        const tokens = -(spent._sum.amount ?? 0);
        return {
          signups,
          active,
          costUsd: round(costUsd),
          byProvider: sumBy(usage, 'provider', (r) => r.provider).map(
            ({ provider, costUsd: c }) => ({ provider, costUsd: c }),
          ),
          applications: { total: apps, submitted, failed },
          // what matters is ours (5xx) and seekers out of tokens (402); the rest is mostly expired sessions and bots
          errors: {
            server: count((s) => s >= 500),
            outOfTokens: count((s) => s === 402),
            client: count((s) => s >= 400 && s < 500 && s !== 402),
            extension: count((s) => s === 0),
          },
          searches: {
            total: searches.searches,
            avgCostUsd: searches.avgCostUsd,
            avgTokens: searches.avgTokens,
            avgDurationSec: searches.avgDurationSec,
          },
          perActiveUser: {
            costUsd: active ? round(costUsd / active) : null,
            tokens: active ? Math.round((tokens / active) * 10) / 10 : null,
          },
        };
      },
    );
  }

  /** Per day: signups, active users, cost, searches. */
  async byDay(range: Range) {
    const days = daysOf(range);
    const [pairs, usage, users, runs] = await Promise.all([
      this.activity(range),
      usageGroups(this.prisma, range, ['day']),
      this.prisma.user.findMany({
        where: { created_at: { gte: range.from, lt: range.to } },
        select: { created_at: true },
      }),
      this.prisma.discoveryRun.findMany({
        where: { started_at: { gte: range.from, lt: range.to } },
        select: { started_at: true },
      }),
    ]);
    const row = new Map(
      days.map((d) => [
        d,
        { day: d, signups: 0, active: 0, costUsd: 0, searches: 0 },
      ]),
    );
    const at = (day: string | undefined) => (day ? row.get(day) : undefined);
    for (const p of pairs) {
      const r = at(p.day);
      if (r) r.active++;
    }
    for (const g of usage) {
      const r = at(g.day);
      if (r) r.costUsd += g.costUsd;
    }
    for (const u of users) {
      const r = at(tzDay(u.created_at));
      if (r) r.signups++;
    }
    for (const x of runs) {
      const r = at(tzDay(x.started_at));
      if (r) r.searches++;
    }
    return [...row.values()].map((r) => ({ ...r, costUsd: round(r.costUsd) }));
  }

  /**
   * Of the people who signed up in the range: how many confirmed their email, finished onboarding,
   * ran a search, had an application go through, and reported an interview or offer.
   */
  async funnel(range: Range) {
    const users = await this.prisma.user.findMany({
      where: { created_at: { gte: range.from, lt: range.to } },
      select: {
        id: true,
        email_verified_at: true,
        job_seeker: { select: { id: true } },
      },
      take: 20_000,
    });
    const sids = users
      .map((u) => u.job_seeker?.id)
      .filter((x): x is string => !!x);
    const [prefs, runs, applied, interviews] = sids.length
      ? await Promise.all([
          this.prisma.jobSeekerPreference.findMany({
            where: { job_seeker_id: { in: sids }, source: 'USER_CONFIRMED' },
            select: { job_seeker_id: true },
          }),
          this.prisma.discoveryRun.groupBy({
            by: ['job_seeker_id'],
            where: { job_seeker_id: { in: sids } },
          }),
          this.prisma.jobApplication.groupBy({
            by: ['job_seeker_id'],
            where: { job_seeker_id: { in: sids }, status: 'SUBMITTED' },
          }),
          this.prisma.jobApplication.groupBy({
            by: ['job_seeker_id'],
            where: {
              job_seeker_id: { in: sids },
              outcome: { in: ['INTERVIEW', 'OFFER'] },
            },
          }),
        ])
      : [[], [], [], []];
    const steps = [
      { key: 'signup', label: 'Signed up', count: users.length },
      {
        key: 'verified',
        label: 'Confirmed email',
        count: users.filter((u) => u.email_verified_at).length,
      },
      { key: 'onboarded', label: 'Finished onboarding', count: prefs.length },
      { key: 'searched', label: 'Ran a search', count: runs.length },
      { key: 'applied', label: 'Applied to a job', count: applied.length },
      { key: 'interview', label: 'Got an interview', count: interviews.length },
    ];
    return steps.map((s, i) => ({
      ...s,
      ofSignups: steps[0].count
        ? Math.round((s.count / steps[0].count) * 1000) / 1000
        : null,
      ofPrevious:
        i && steps[i - 1].count
          ? Math.round((s.count / steps[i - 1].count) * 1000) / 1000
          : null,
    }));
  }

  /** The seekers who cost us most in the range, against what their plan brings in. */
  async topUsers(range: Range, n = 5) {
    const groups = await usageGroups(this.prisma, range, ['user']);
    const per = new Map<string, number>();
    for (const g of groups)
      if (g.userId) per.set(g.userId, (per.get(g.userId) ?? 0) + g.costUsd);
    const top = [...per].sort((a, b) => b[1] - a[1]).slice(0, n);
    const ids = top.map(([id]) => id);
    const [users, accounts] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, email: true, full_name: true },
      }),
      this.prisma.creditAccount.findMany({
        where: { user_id: { in: ids } },
        select: { user_id: true, plan: true },
      }),
    ]);
    const user = new Map(users.map((u) => [u.id, u]));
    const plan = new Map(accounts.map((a) => [a.user_id, a.plan]));
    return top.map(([id, cost]) => ({
      userId: id,
      email: user.get(id)?.email ?? null,
      name: user.get(id)?.full_name ?? null,
      plan: plan.get(id) ?? 'free',
      costUsd: round(cost),
      priceUsd: planOf(plan.get(id) ?? 'free').priceUsd,
    }));
  }

  /**
   * Weekly retention: people who signed up in each of the last `weeks` weeks (Monday-based, Cairo),
   * and the share of them active in each week after.
   */
  async retention(weeks = 8, now = new Date()) {
    return memo(`retention:${weeks}:${tzDay(now)}`, async () => {
      const thisWeek = weekOf(tzDay(now));
      const starts: string[] = [];
      let w = thisWeek;
      for (let i = 0; i < weeks; i++) {
        starts.unshift(w);
        w = tzDay(new Date(dayStart(w).getTime() - 3 * DAY));
        w = weekOf(w);
      }
      const from = dayStart(starts[0]);
      const users = await this.prisma.user.findMany({
        where: { created_at: { gte: from } },
        select: { id: true, created_at: true },
      });
      const pairs = await this.activity({
        from,
        to: dayStart(nextDay(tzDay(now))),
      });
      const activeWeeks = new Map<string, Set<string>>();
      for (const p of pairs) {
        const s = activeWeeks.get(p.userId) ?? new Set<string>();
        s.add(weekOf(p.day));
        activeWeeks.set(p.userId, s);
      }
      return starts.map((start, i) => {
        const cohort = users.filter(
          (u) => weekOf(tzDay(u.created_at)) === start,
        );
        const shares: (number | null)[] = [];
        for (let k = 0; k < weeks - i; k++) {
          const wk = starts[i + k];
          const n = cohort.filter((u) => activeWeeks.get(u.id)?.has(wk)).length;
          shares.push(
            cohort.length
              ? Math.round((n / cohort.length) * 1000) / 1000
              : null,
          );
        }
        return { week: start, users: cohort.length, weeks: shares };
      });
    });
  }

  /** Things the owner should look at now, most serious first. */
  async attention(now = new Date()) {
    return memo(`attention:${Math.floor(now.getTime() / 60_000)}`, async () => {
      const items: {
        kind: string;
        severity: 'high' | 'medium';
        title: string;
        detail: string;
        link: string;
      }[] = [];
      const day = (n: number) => new Date(now.getTime() - n * DAY);

      // our own errors: the last 24 h against the week before
      const [s24, s7] = await Promise.all([
        this.prisma.errorLog.count({
          where: { status: { gte: 500 }, created_at: { gte: day(1) } },
        }),
        this.prisma.errorLog.count({
          where: {
            status: { gte: 500 },
            created_at: { gte: day(8), lt: day(1) },
          },
        }),
      ]);
      if (s24 >= 10 && s24 > (s7 / 7) * 2)
        items.push({
          kind: 'errors',
          severity: 'high',
          title: `${s24} server errors in the last 24 hours`,
          detail: `About ${Math.round(s7 / 7)} a day the week before.`,
          link: '/logs?status=5xx',
        });

      // searches that never finished
      const stuck = await this.prisma.discoveryRun.count({
        where: {
          status: 'RUNNING',
          started_at: { lt: new Date(now.getTime() - 15 * 60_000) },
        },
      });
      if (stuck)
        items.push({
          kind: 'stuck',
          severity: 'high',
          title: `${stuck} search${stuck === 1 ? '' : 'es'} stuck for over 15 minutes`,
          detail: 'Still marked running. The seeker sees no results.',
          link: '/usage/searches?status=running',
        });

      // a provider spending much more yesterday than its daily average
      const [yesterday, week] = await Promise.all([
        usageGroups(this.prisma, { from: day(1), to: now }, []),
        usageGroups(this.prisma, { from: day(8), to: day(1) }, []),
      ]);
      const by = (rows: typeof week) => {
        const m = new Map<string, number>();
        for (const r of rows)
          m.set(r.provider, (m.get(r.provider) ?? 0) + r.costUsd);
        return m;
      };
      const y = by(yesterday);
      const wk = by(week);
      for (const [p, cost] of y) {
        const avg = (wk.get(p) ?? 0) / 7;
        if (cost >= 5 && cost > avg * 2)
          items.push({
            kind: 'spend',
            severity: 'medium',
            title: `${p} cost $${cost.toFixed(2)} in the last 24 hours`,
            detail: `Its daily average was $${avg.toFixed(2)}.`,
            link: `/usage/${p}`,
          });
      }

      // seekers who cost more than their plan brings in (last 30 days)
      const top = await this.topUsers({ from: day(30), to: now }, 50);
      const losing = top.filter((u) => u.costUsd > Math.max(u.priceUsd, 1));
      if (losing.length)
        items.push({
          kind: 'margin',
          severity: 'medium',
          title: `${losing.length} seeker${losing.length === 1 ? ' costs' : 's cost'} more than their plan`,
          detail: losing
            .slice(0, 3)
            .map(
              (u) =>
                `${u.email ?? u.userId} ($${u.costUsd.toFixed(2)} on ${u.plan})`,
            )
            .join(', '),
          link: '/users?sort=-costUsd',
        });

      // seekers who ran out of tokens this week and bought nothing
      const ranOut = await this.prisma.errorLog.groupBy({
        by: ['user_id'],
        where: {
          status: 402,
          created_at: { gte: day(7) },
          user_id: { not: null },
        },
      });
      const outIds = ranOut.map((r) => r.user_id!).filter(Boolean);
      if (outIds.length) {
        const bought = await this.prisma.creditLedger.groupBy({
          by: ['user_id'],
          where: {
            user_id: { in: outIds },
            kind: 'topup',
            created_at: { gte: day(7) },
          },
        });
        const n = outIds.length - bought.length;
        if (n > 0)
          items.push({
            kind: 'out-of-tokens',
            severity: 'medium',
            title: `${n} seeker${n === 1 ? '' : 's'} ran out of tokens this week and bought nothing`,
            detail: 'A chance to offer a bigger plan or a top-up.',
            link: '/logs?status=402',
          });
      }
      return items.sort((a, b) =>
        a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1,
      );
    });
  }
}
