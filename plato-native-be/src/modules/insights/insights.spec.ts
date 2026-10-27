import { ForbiddenException } from '@nestjs/common';
import { JobRemoteType, JobSource } from '@prisma/client';

jest.mock('../discovery/job-freshness.service', () => ({
  ...jest.requireActual('../discovery/job-freshness.service'),
  probeListing: jest.fn(),
}));

import { probeListing } from '../discovery/job-freshness.service';
import { AlertMatcherService } from './alert-matcher.service';
import {
  headline,
  isDue,
  JobLike,
  matchesAlert,
  verdict,
  withinLimits,
} from './alert-rules';
import { digestEmail } from './digest-email';
import { DigestService } from './digest.service';
import { InsightsService } from './insights.service';

const probe = probeListing as jest.MockedFunction<typeof probeListing>;
const NOW = new Date('2026-10-27T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

let ids = 0;
const job = (
  over: Partial<JobLike & { url: string; apply_url: string | null }> = {},
) => ({
  id: `j${++ids}`,
  source: JobSource.LINKEDIN as JobSource,
  title: 'Frontend Engineer',
  company: 'Stripe',
  location: 'Cairo, Egypt',
  remote_type: JobRemoteType.ONSITE as JobRemoteType,
  posted_at: daysAgo(1) as Date | null,
  created_at: daysAgo(1),
  expired_at: null as Date | null,
  checked_at: null as Date | null,
  url: 'https://example.com/job',
  apply_url: null as string | null,
  ...over,
});

const field = (over = {}) => ({
  id: 'a1',
  job_seeker_id: 's1',
  kind: 'FIELD' as const,
  title: 'Frontend Engineer',
  location: null as string | null,
  remote_only: false as boolean | null,
  company: null as string | null,
  company_key: null as string | null,
  paused: false,
  created_at: daysAgo(10),
  updated_at: daysAgo(10),
  ...over,
});

describe('matchesAlert', () => {
  it('a field alert finds the same role however the board words it', () => {
    const a = field();
    expect(matchesAlert(a, job({ title: 'Senior Frontend Developer' }))).toBe(
      true,
    );
    expect(matchesAlert(a, job({ title: 'Backend Engineer' }))).toBe(false);
  });

  it('a place narrows it, but remote jobs still count; remote-only means remote only', () => {
    const cairo = field({ location: 'Cairo' });
    expect(matchesAlert(cairo, job({ location: 'Cairo, Egypt' }))).toBe(true);
    expect(matchesAlert(cairo, job({ location: 'Berlin' }))).toBe(false);
    expect(
      matchesAlert(
        cairo,
        job({ location: 'Berlin', remote_type: JobRemoteType.REMOTE }),
      ),
    ).toBe(true);
    const remote = field({ remote_only: true });
    expect(matchesAlert(remote, job())).toBe(false);
    expect(
      matchesAlert(remote, job({ remote_type: JobRemoteType.REMOTE })),
    ).toBe(true);
  });

  it('following a company matches every spelling of it, and paused alerts match nothing', () => {
    const c = field({
      kind: 'COMPANY',
      title: null,
      company: 'Stripe',
      company_key: 'stripe',
    });
    expect(
      matchesAlert(c, job({ company: 'Stripe, Inc.', title: 'Accountant' })),
    ).toBe(true);
    expect(matchesAlert(c, job({ company: 'Stripes Media' }))).toBe(false);
    expect(
      matchesAlert({ ...c, paused: true }, job({ company: 'Stripe' })),
    ).toBe(false);
  });
});

describe('plan limits and cadence', () => {
  it('after a downgrade, the oldest alerts within the plan keep working', () => {
    const alerts = [1, 2, 3, 4, 5].map((i) =>
      field({ id: `a${i}`, created_at: daysAgo(10 - i) }),
    );
    expect(withinLimits(alerts, 'free').map((a) => a.id)).toEqual([
      'a1',
      'a2',
      'a3',
    ]);
    expect(withinLimits(alerts, 'pro')).toHaveLength(5);
  });

  it('a digest is due after its cadence, never before', () => {
    expect(isDue({ cadence: 'EVERY_3_DAYS', last_digest_at: null }, NOW)).toBe(
      true,
    );
    expect(
      isDue({ cadence: 'EVERY_3_DAYS', last_digest_at: daysAgo(2) }, NOW),
    ).toBe(false);
    expect(
      isDue({ cadence: 'EVERY_3_DAYS', last_digest_at: daysAgo(3) }, NOW),
    ).toBe(true);
    expect(isDue({ cadence: 'WEEKLY', last_digest_at: daysAgo(6) }, NOW)).toBe(
      false,
    );
    expect(isDue({ cadence: 'DAILY', last_digest_at: daysAgo(1) }, NOW)).toBe(
      true,
    );
  });
});

describe('verdict: never send a closed or stale job', () => {
  it('closed, or older than three weeks: dropped', () => {
    expect(verdict(job({ expired_at: daysAgo(1) }), NOW)).toEqual({
      send: false,
      reason: 'closed',
    });
    expect(verdict(job({ posted_at: daysAgo(22) }), NOW)).toEqual({
      send: false,
      reason: 'too_old',
    });
  });

  it('a board we can look at is looked at again unless we just did', () => {
    expect(verdict(job({ source: JobSource.GREENHOUSE }), NOW)).toEqual({
      check: true,
    });
    expect(
      verdict(
        job({
          source: JobSource.GREENHOUSE,
          checked_at: new Date(NOW.getTime() - 3_600_000),
        }),
        NOW,
      ),
    ).toEqual({ send: true });
  });

  it("a board we can't look at only sends jobs from the last week", () => {
    expect(verdict(job({ posted_at: daysAgo(3) }), NOW)).toEqual({
      send: true,
    });
    expect(verdict(job({ posted_at: daysAgo(9) }), NOW)).toEqual({
      send: false,
      reason: 'unverified',
    });
  });
});

describe('the digest', () => {
  it('reads as one line about what is in it', () => {
    const alerts = [
      { id: 'a1', kind: 'FIELD', title: 'Frontend Engineer', company: null },
      { id: 'a2', kind: 'COMPANY', title: null, company: 'Stripe' },
    ];
    const jobs = [
      { alertId: 'a1', company: 'X' },
      { alertId: 'a1', company: 'Y' },
      { alertId: 'a2', company: 'Stripe' },
    ];
    expect(headline(jobs, alerts)).toBe(
      '2 Frontend Engineer jobs and 1 at Stripe',
    );
  });

  it('the email lists ten, counts the rest, escapes what boards wrote, and can be stopped', () => {
    const jobs = Array.from({ length: 13 }, (_, i) => ({
      title: i === 0 ? '<script>x</script> Engineer' : `Role ${i}`,
      company: 'Acme',
      location: 'Cairo',
      remote: false,
      posted_at: daysAgo(1),
      url: `https://example.com/${i}`,
    }));
    const m = digestEmail({
      name: 'Mona Ali',
      headline: '13 Engineer jobs',
      jobs,
      appUrl: 'https://app.plato',
      unsubscribeUrl: 'https://app.plato/unsubscribe?token=t',
      cadenceLabel: 'every 3 days',
      now: NOW,
    });
    expect(m.subject).toBe('13 new jobs: 13 Engineer jobs');
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('See all 13 jobs');
    expect((m.html.match(/Posted yesterday/g) ?? []).length).toBe(10);
    expect(m.text).toContain('3 more: https://app.plato/insights');
    expect(m.html).toContain('unsubscribe?token=t');
  });
});

// A small in-memory stand-in for the Prisma calls these services make.
function fakeDb(state: {
  jobs: ReturnType<typeof job>[];
  alerts?: ReturnType<typeof field>[];
  settings?: Record<string, unknown>[];
}) {
  const matches: Record<string, unknown>[] = [];
  const digests: Record<string, unknown>[] = [];
  const settings = state.settings ?? [];
  let cursor: Date | null = null;
  const hit = (
    row: Record<string, unknown>,
    where: Record<string, unknown> = {},
  ) =>
    Object.entries(where).every(([k, v]) => {
      const val = row[k];
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        const o = v as Record<string, unknown>;
        if ('in' in o) return (o.in as unknown[]).includes(val);
        if ('gt' in o) return (val as Date) > (o.gt as Date);
        if ('gte' in o) return (val as Date) >= (o.gte as Date);
        if ('not' in o) return val !== o.not;
      }
      return (val ?? null) === v;
    });
  const db = {
    insightsCursor: {
      findUnique: async () => (cursor ? { at: cursor } : null),
      upsert: async ({ update }: { update: { at: Date } }) =>
        (cursor = update.at),
    },
    job: {
      findMany: async ({
        where,
        take,
      }: {
        where: Record<string, unknown>;
        take?: number;
      }) =>
        state.jobs
          .filter((j) => hit(j, where))
          .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
          .slice(0, take ?? 1e9),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: object;
      }) =>
        Object.assign(
          state.jobs.find((j) => j.id === where.id)!,
          data,
        ),
    },
    jobAlert: {
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        (state.alerts ?? []).filter((a) => hit(a, where)),
    },
    jobSeeker: {
      findMany: async () => [{ id: 's1', user_id: 'u1' }],
      findUnique: async () => ({
        user: { email: 'mona@example.com', full_name: 'Mona Ali' },
      }),
    },
    creditAccount: { findMany: async () => [{ user_id: 'u1', plan: 'free' }] },
    alertMatch: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        const dup = matches.find(
          (m) =>
            m.job_seeker_id === create.job_seeker_id &&
            m.job_id === create.job_id,
        );
        if (!dup) matches.push({ ...create });
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        matches.filter((m) => hit(m, where)),
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: object;
      }) =>
        matches
          .filter((m) => hit(m, where))
          .forEach((m) => Object.assign(m, data)),
    },
    alertSettings: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        settings.filter((s) => hit(s, where)),
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        settings.find((s) => hit(s, where)) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: object;
      }) =>
        Object.assign(
          settings.find((s) => hit(s, where))!,
          data,
        ),
    },
    alertDigest: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const d = { id: `d${digests.length + 1}`, created_at: NOW, ...data };
        digests.push(d);
        return d;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: object;
      }) =>
        Object.assign(
          digests.find((d) => d.id === where.id)!,
          data,
        ),
    },
  };
  return { db, matches, digests, settings };
}

describe('AlertMatcherService', () => {
  it("holds new jobs from anyone's search for every seeker whose alert fits, once each", async () => {
    const jobs = [
      job({
        title: 'Frontend Engineer',
        created_at: new Date(NOW.getTime() - 3_600_000),
      }),
      job({
        title: 'Accountant',
        company: 'Stripe Inc',
        created_at: new Date(NOW.getTime() - 1_800_000),
      }),
      job({
        title: 'Nurse',
        company: 'Clinic',
        created_at: new Date(NOW.getTime() - 900_000),
      }),
    ];
    const alerts = [
      field({ id: 'a1' }),
      // Two alerts both fit the first job: still one match.
      field({
        id: 'a2',
        kind: 'COMPANY',
        title: null,
        company: 'Stripe',
        company_key: 'stripe',
      }),
    ];
    const { db, matches } = fakeDb({ jobs, alerts });
    const svc = new AlertMatcherService(db as never);
    await svc.scan(NOW);
    expect(matches.map((m) => [m.alert_id, m.job_id])).toEqual([
      ['a1', jobs[0].id],
      ['a2', jobs[1].id],
    ]);
    expect(matches[0]).toMatchObject({ sent_at: null, dropped: null });
    // Next scan starts after the cursor: nothing matched twice.
    await svc.scan(NOW);
    expect(matches).toHaveLength(2);
  });
  it('never sends a link one seeker pasted to anyone else', async () => {
    // stripe.attacker.tld -> company "stripe", title chosen by that page.
    const pasted = job({
      source: JobSource.MANUAL,
      title: 'Frontend Engineer',
      company: 'stripe',
      created_at: new Date(NOW.getTime() - 600_000),
    });
    const alerts = [
      field({ id: 'a1' }),
      field({
        id: 'a2',
        kind: 'COMPANY',
        title: null,
        company: 'Stripe',
        company_key: 'stripe',
      }),
    ];
    const { db, matches } = fakeDb({ jobs: [pasted], alerts });
    const svc = new AlertMatcherService(db as never);
    await svc.scan(NOW);
    await svc.seed(alerts[1] as never, NOW);
    expect(matches).toHaveLength(0);
    expect(matchesAlert(alerts[1], pasted)).toBe(false);
  });
});

describe('DigestService', () => {
  const mail = (enabled: boolean) => ({
    enabled,
    send: jest.fn(async () => true),
  });
  const bus = () => ({ publish: jest.fn() });
  const settingsRow = (over = {}) => ({
    job_seeker_id: 's1',
    cadence: 'EVERY_3_DAYS',
    email: true,
    in_app: true,
    unsubscribe_token: 'tok',
    last_digest_at: null,
    ...over,
  });

  beforeEach(() => probe.mockReset());

  async function setup(
    jobs: ReturnType<typeof job>[],
    settings = settingsRow(),
  ) {
    const alerts = [field({ id: 'a1' })];
    const f = fakeDb({ jobs, alerts, settings: [settings] });
    await new AlertMatcherService(f.db as never).scan(NOW);
    const m = mail(true);
    const b = bus();
    const svc = new DigestService(f.db as never, m as never, b as never);
    return { ...f, m, b, svc };
  }

  it('sends one digest for many jobs, drops closed and stale ones, and checks live boards first', async () => {
    const jobs = [
      job({ title: 'Frontend Engineer', created_at: daysAgo(0.5) }),
      job({
        title: 'Frontend Developer',
        created_at: daysAgo(0.4),
        expired_at: daysAgo(0.1),
      }),
      job({
        title: 'Frontend Lead',
        created_at: daysAgo(0.3),
        posted_at: daysAgo(10),
      }),
      job({
        title: 'Frontend Engineer III',
        created_at: daysAgo(0.2),
        source: JobSource.GREENHOUSE,
      }),
      job({
        title: 'Frontend Engineer II',
        created_at: daysAgo(0.1),
        source: JobSource.LEVER,
      }),
    ];
    // Live look: the Greenhouse job is open, the Lever one has closed.
    probe.mockImplementation(async (url) =>
      url.includes('lever') ? true : false,
    );
    jobs[4].url = 'https://jobs.lever.co/x/1';
    const { svc, matches, digests, m, b } = await setup(jobs);
    // The matcher only walks open jobs, so the closed one was never held.
    expect(matches).toHaveLength(4);

    await svc.sendDue(NOW);

    expect(digests).toHaveLength(1);
    expect(digests[0].job_ids).toEqual(
      expect.arrayContaining([jobs[0].id, jobs[3].id]),
    );
    expect(digests[0].job_ids).toHaveLength(2);
    expect(matches.find((x) => x.job_id === jobs[2].id)?.dropped).toBe(
      'unverified',
    );
    expect(matches.find((x) => x.job_id === jobs[4].id)?.dropped).toBe(
      'closed',
    );
    expect(jobs[4].expired_at).toEqual(NOW);
    expect(b.publish).toHaveBeenCalledTimes(1);
    expect(b.publish.mock.calls[0][1]).toMatchObject({
      kind: 'alert',
      title: '2 new jobs for you',
    });
    expect(m.send).toHaveBeenCalledTimes(1);
    expect(digests[0].emailed).toBe(true);
  });

  it('never sends the same job twice, and sends nothing when nothing is new', async () => {
    const jobs = [job({ created_at: daysAgo(0.5) })];
    const { svc, digests, settings } = await setup(jobs);
    await svc.sendDue(NOW);
    expect(digests).toHaveLength(1);
    settings[0].last_digest_at = daysAgo(4);
    await svc.sendDue(NOW);
    expect(digests).toHaveLength(1);
  });

  it('waits for the cadence', async () => {
    const jobs = [job({ created_at: daysAgo(0.5) })];
    const { svc, digests } = await setup(
      jobs,
      settingsRow({ last_digest_at: daysAgo(1) }),
    );
    await svc.sendDue(NOW);
    expect(digests).toHaveLength(0);
  });

  it('email off, or in-app off, is respected', async () => {
    const jobs = [job({ created_at: daysAgo(0.5) })];
    const { svc, m, b } = await setup(
      jobs,
      settingsRow({ email: false, in_app: false }),
    );
    await svc.sendDue(NOW);
    expect(m.send).not.toHaveBeenCalled();
    expect(b.publish).not.toHaveBeenCalled();
  });
});

describe('InsightsService.create', () => {
  const make = (used: number, plan = 'free') => {
    const create = jest.fn(async ({ data }: { data: object }) => ({
      id: 'new',
      ...data,
    }));
    const db = {
      jobAlert: {
        count: async () => used,
        findFirst: async () => null,
        create,
      },
      alertSettings: { upsert: async () => ({}) },
    };
    const svc = new InsightsService(
      db as never,
      { getByUserId: async () => ({ id: 's1' }) } as never,
      { account: async () => ({ plan }) } as never,
      { seed: jest.fn() } as never,
      { enabled: false } as never,
    );
    return { svc, create };
  };

  it('alerts are free but capped by plan', async () => {
    await expect(
      make(3).svc.create('u1', { kind: 'FIELD', title: 'Designer' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const { svc, create } = make(3, 'pro');
    await svc.create('u1', { kind: 'FIELD', title: '  Product   Designer ' });
    expect(create.mock.calls[0][0].data).toMatchObject({
      title: 'Product Designer',
    });
  });

  it('a followed company is stored under its one spelling', async () => {
    const { svc, create } = make(0);
    await svc.create('u1', { kind: 'COMPANY', company: 'STRIPE, INC.' });
    expect(create.mock.calls[0][0].data).toMatchObject({
      company: 'Stripe',
      company_key: 'stripe',
    });
  });
});
