import { PrismaService } from '../prisma/prisma.service';
import { pageShape } from './activity';
import {
  assignByWindow,
  durationOf,
  percentile,
  summarize,
  type SearchItem,
} from './search-stats';
import { recordUsage, withDiscoveryRun } from './usage';
import { planFit } from '../admin-users/plan-fit';

const item = (o: Partial<SearchItem>): SearchItem => ({
  id: 'r',
  userId: 'u1',
  startedAt: new Date('2026-11-01T10:00:00Z'),
  finishedAt: new Date('2026-11-01T10:01:00Z'),
  status: 'DONE',
  fetched: 100,
  matched: 20,
  shortlisted: 10,
  costUsd: 0.1,
  tokens: 100,
  events: 5,
  byProvider: {},
  attribution: 'exact',
  durationSec: 60,
  ...o,
});

describe('search averages', () => {
  it('percentile by nearest rank', () => {
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
    expect(percentile([], 0.5)).toBeNull();
  });

  it('duration from start to finish; none while running', () => {
    expect(
      durationOf({ startedAt: new Date(0), finishedAt: new Date(95_400) }),
    ).toBe(95);
    expect(durationOf({ startedAt: new Date(0), finishedAt: null })).toBeNull();
  });

  it('summarize: averages skip running searches, totals include them', () => {
    const s = summarize([
      item({
        id: 'a',
        costUsd: 0.1,
        tokens: 100,
        durationSec: 60,
        shortlisted: 10,
      }),
      item({
        id: 'b',
        userId: 'u2',
        costUsd: 0.3,
        tokens: 300,
        durationSec: 120,
        shortlisted: 30,
      }),
      item({
        id: 'c',
        status: 'FAILED',
        costUsd: 0.2,
        tokens: 200,
        durationSec: 30,
        shortlisted: 0,
      }),
      item({
        id: 'd',
        status: 'RUNNING',
        costUsd: 0.05,
        tokens: 50,
        durationSec: null,
        finishedAt: null,
      }),
    ]);
    expect(s).toMatchObject({
      searches: 4,
      done: 2,
      failed: 1,
      running: 1,
      searchers: 2,
      searchesPerSearcher: 2,
      totalCostUsd: 0.65,
      avgCostUsd: 0.2,
      avgTokens: 200,
      avgDurationSec: 70,
      p50DurationSec: 60,
      costPerShortlistedUsd: 0.015,
    });
  });
});

describe('estimated cost for searches from before tagging', () => {
  const runs = [
    {
      id: 'old',
      userId: 'u1',
      startedAt: new Date(1_000_000),
      finishedAt: new Date(1_060_000),
      status: 'DONE',
      fetched: 0,
      matched: 0,
      shortlisted: 0,
    },
    {
      id: 'new',
      userId: 'u1',
      startedAt: new Date(2_000_000),
      finishedAt: null,
      status: 'RUNNING',
      fetched: 0,
      matched: 0,
      shortlisted: 0,
    },
  ];
  const ev = (at: number, userId = 'u1') => ({
    id: `e${at}`,
    userId,
    runId: null,
    at,
    model: null,
    apify: 0,
    feature: 'discovery.fit',
    cost: 0.01,
  });

  it('an event goes to the same user’s run whose window holds it (2 min tail after the end)', () => {
    const out = assignByWindow(
      [
        ev(1_030_000),
        ev(1_170_000),
        ev(1_500_000),
        ev(2_000_500),
        ev(1_030_000, 'u2'),
      ],
      runs,
    );
    expect(out.map((e) => [e.at, e.runId])).toEqual([
      [1_030_000, 'old'],
      [1_170_000, 'old'],
      [2_000_500, 'new'],
    ]);
  });
});

describe('usage events carry their search', () => {
  afterEach(() => {
    PrismaService.instance = undefined;
  });
  it('recordUsage inside withDiscoveryRun is tagged with the run; outside it is not', async () => {
    const create = jest
      .fn<
        Promise<{ id: string }>,
        [{ data: { discovery_run_id: string | null } }]
      >()
      .mockResolvedValue({ id: 'ev' });
    PrismaService.instance = { usageEvent: { create } } as never;
    await withDiscoveryRun('6650aaaaaaaaaaaaaaaaaaaa', async () => {
      await Promise.resolve();
      recordUsage({
        feature: 'discovery.fit',
        model: 'gpt-4o-mini',
        input_tokens: 10,
        output_tokens: 5,
      });
    });
    recordUsage({ feature: 'chat.orchestrator', model: 'gpt-4o-mini' });
    expect(create.mock.calls[0][0].data.discovery_run_id).toBe(
      '6650aaaaaaaaaaaaaaaaaaaa',
    );
    expect(create.mock.calls[1][0].data.discovery_run_id).toBeNull();
  });
});

describe('page activity keeps only the route shape', () => {
  it.each([
    ['/applications/6650aaaaaaaaaaaaaaaaaaaa?tab=steps', '/applications/:id'],
    ['/jobs/123#top', '/jobs/:id'],
    [
      '/career/interviews/0f8fad5b-d9cb-469f-a165-70867728950e',
      '/career/interviews/:id',
    ],
    ['/', '/'],
    ['/Profile', '/profile'],
  ])('%s -> %s', (raw, shape) => expect(pageShape(raw)).toBe(shape));
  it.each(['https://evil.example/x', 'jobs', 42, '/' + 'a'.repeat(400)])(
    'refuses %s',
    (raw) => expect(pageShape(raw)).toBeNull(),
  );
});

describe('plan fit', () => {
  const base = {
    plan: 'pro',
    grant: 7000,
    priceUsd: 19,
    periodStart: new Date('2026-11-01T00:00:00Z'),
    periodEnd: new Date('2026-12-01T00:00:00Z'),
    toppedUp: 0,
    balance: 3000,
    ranOut: 0,
    now: new Date('2026-11-16T00:00:00Z'), // half way
  };
  it('enough: on pace for half the grant', () => {
    expect(planFit({ ...base, used: 1750 })).toMatchObject({
      verdict: 'enough',
      usedPct: 25,
      projectedPct: 50,
      daysLeft: 15,
    });
  });
  it('tight: on pace for 80% or more', () => {
    expect(planFit({ ...base, used: 3000 }).verdict).toBe('tight');
  });
  it('short: on pace past the grant, or ran out, or bought a top-up', () => {
    expect(planFit({ ...base, used: 4000 }).verdict).toBe('short');
    expect(planFit({ ...base, used: 100, ranOut: 2 })).toMatchObject({
      verdict: 'short',
      advice: expect.stringContaining('Ran out 2 times') as unknown,
    });
    expect(planFit({ ...base, used: 100, toppedUp: 1000 }).verdict).toBe(
      'short',
    );
  });
  it('unused: nothing spent', () => {
    expect(planFit({ ...base, used: 0 }).verdict).toBe('unused');
  });
});
