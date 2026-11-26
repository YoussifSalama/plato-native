import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  affordableResults,
  runCeiling,
  tokensFor,
  toTokens,
} from './credit-prices';
import { CreditsService } from './credits.service';
import { InsufficientTokensException } from './insufficient-tokens.exception';

describe('tokensFor (1,000 Plato tokens = $1 of cost)', () => {
  it('an AI call costs its real dollar cost in tokens, so a pricier model costs more', () => {
    expect(
      tokensFor({ feature: 'career.chat', model: 'gpt-4.1', cost_usd: 0.0098 }),
    ).toBe(9.8);
    expect(
      tokensFor({
        feature: 'career.chat',
        model: 'gpt-4.1-mini',
        cost_usd: 0.002,
      }),
    ).toBe(2);
    expect(tokensFor({ feature: 'resume.write', cost_usd: null })).toBe(0); // unknown price: not charged
  });

  it('a job board is charged its fixed price per result (plus its start fee), not what Apify reported', () => {
    const run = (model: string, results: number) =>
      tokensFor({
        feature: 'discovery.apify',
        model,
        apify_usd: 9,
        meta: { results },
      });
    expect(run('cirkit~talent-com-jobs-scraper', 40)).toBe(28);
    expect(run('automation-lab~indeed-scraper', 40)).toBe(125);
    expect(run('automation-lab~glassdoor-jobs-scraper', 40)).toBe(210);
  });

  it('a board without a fixed price pays what Apify reported; an empty or failed run is free', () => {
    expect(
      tokensFor({
        feature: 'discovery.apify',
        model: 'goat255~bayt-scraper',
        apify_usd: 0.05,
        meta: { results: 12 },
      }),
    ).toBe(50);
    expect(
      tokensFor({
        feature: 'discovery.apify',
        model: 'automation-lab~indeed-scraper',
        apify_usd: 0.2,
        meta: { results: 0 },
      }),
    ).toBe(0);
    expect(
      tokensFor({
        feature: 'discovery.apify',
        model: 'automation-lab~indeed-scraper',
        apify_usd: 0.2,
      }),
    ).toBe(0);
  });

  it('auto apply is not charged in tokens', () => {
    expect(tokensFor({ feature: 'extension.v3.turn', cost_usd: 0.3 })).toBe(0);
    expect(tokensFor({ feature: 'apply.answers', cost_usd: 0.01 })).toBe(0);
    expect(toTokens(0.0011)).toBe(1.1);
  });
});

// A tiny in-memory stand-in for the collections, injected into the service. A
// transaction runs its callback on the same store (each call is synchronous, so
// a conditional update is atomic, as Mongo's is).
type Row = Record<string, unknown>;
const matches = (row: Row, where: Row) =>
  Object.entries(where).every(([k, v]) => {
    if (v instanceof Date)
      return (row[k] as Date | undefined)?.getTime() === v.getTime();
    if (v && typeof v === 'object') {
      const o = v as { gte?: number | Date; lte?: Date };
      if (o.gte !== undefined) return (row[k] as number) >= (o.gte as number);
      if (o.lte !== undefined) return (row[k] as Date) <= o.lte;
    }
    return (row[k] ?? null) === v;
  });
// plain values are set; { increment, decrement } move a number
const apply = (row: Row, data: Row) => {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && ('increment' in v || 'decrement' in v)) {
      const o = v as { increment?: number; decrement?: number };
      const d = (o.increment ?? 0) - (o.decrement ?? 0);
      row[k] = Math.round((((row[k] as number) ?? 0) + d) * 1000) / 1000;
    } else row[k] = v;
  }
};
let svc: CreditsService;
function fakeDb(verified = true) {
  const accounts: Record<string, Row & { balance: number }> = {};
  const ledger: Row[] = [];
  const users: Record<string, Row> = {};
  const userOf = (id: string) =>
    (users[id] ??= { id, email_verified_at: verified ? new Date() : null });
  let t = 0;
  const db = {
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ ...userOf(where.id) }),
      ),
    },
    usageEvent: { create: jest.fn(() => Promise.resolve({ id: 'ev' })) },
    $transaction: jest.fn(),
    creditAccount: {
      findUnique: jest.fn(({ where }: { where: { user_id: string } }) =>
        Promise.resolve(
          accounts[where.user_id] ? { ...accounts[where.user_id] } : null,
        ),
      ),
      findUniqueOrThrow: jest.fn(({ where }: { where: { user_id: string } }) =>
        Promise.resolve({ ...accounts[where.user_id] }),
      ),
      create: jest.fn(
        ({ data }: { data: Row & { user_id: string; balance: number } }) => {
          if (accounts[data.user_id])
            return Promise.reject(
              new Prisma.PrismaClientKnownRequestError('dup', {
                code: 'P2002',
                clientVersion: 'x',
              }),
            );
          accounts[data.user_id] = { topup: 0, ...data };
          return Promise.resolve({ ...accounts[data.user_id] });
        },
      ),
      updateMany: jest.fn(({ where, data }: { where: Row; data: Row }) => {
        const a = accounts[where.user_id as string];
        if (!a || !matches(a, where)) return Promise.resolve({ count: 0 });
        apply(a, data);
        return Promise.resolve({ count: 1 });
      }),
      update: jest.fn(
        ({ where, data }: { where: { user_id: string }; data: Row }) => {
          const a = accounts[where.user_id];
          apply(a, data);
          return Promise.resolve({ ...a });
        },
      ),
    },
    creditLedger: {
      create: jest.fn(({ data }: { data: Row }) => {
        // distinct, increasing times, like rows written one after another
        const row = {
          id: `l${ledger.length + 1}`,
          settled_at: null,
          created_at: new Date(Date.now() + ++t),
          ...data,
        };
        ledger.push(row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(ledger.find((l) => matches(l, where)) ?? null),
      ),
      findMany: jest.fn(({ where, take }: { where: Row; take?: number }) =>
        Promise.resolve(
          ledger
            .filter((l) => matches(l, where))
            .reverse()
            .slice(0, take ?? Infinity),
        ),
      ),
      groupBy: jest.fn(({ where }: { where: Row }) => {
        const sums = new Map<string, number>();
        for (const l of ledger.filter((x) => matches(x, where)))
          sums.set(
            l.feature as string,
            (sums.get(l.feature as string) ?? 0) + (l.amount as number),
          );
        return Promise.resolve(
          [...sums].map(([feature, amount]) => ({
            feature,
            _sum: { amount },
          })),
        );
      }),
      updateMany: jest.fn(({ where, data }: { where: Row; data: Row }) => {
        const l = ledger.find((x) => matches(x, where));
        if (!l) return Promise.resolve({ count: 0 });
        apply(l, data);
        return Promise.resolve({ count: 1 });
      }),
    },
  };
  db.$transaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) =>
    fn(db),
  );
  svc = new CreditsService(db as never);
  return { accounts, ledger, db, users };
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('CreditsService.account', () => {
  it('a new seeker gets the free plan grant once, with a one-month period', async () => {
    const { ledger } = fakeDb();
    const acc = await svc.account('u1', day('2026-10-25'));
    expect(acc).toMatchObject({
      plan: 'free',
      balance: 1000,
      period_end: day('2026-11-25'),
    });
    await svc.account('u1', day('2026-10-26'));
    expect(ledger).toEqual([
      expect.objectContaining({
        kind: 'grant',
        amount: 1000,
        balance_after: 1000,
      }),
    ]);
  });

  it('two first requests at once: one account, one grant', async () => {
    const { ledger, accounts } = fakeDb();
    await Promise.all([
      svc.account('u1', day('2026-10-25')),
      svc.account('u1', day('2026-10-25')),
    ]);
    expect(Object.keys(accounts)).toEqual(['u1']);
    expect(ledger.filter((l) => l.kind === 'grant')).toHaveLength(1);
  });

  it('after the period ends the balance resets to the grant (no roll-over), once, into the current period', async () => {
    const { accounts, ledger } = fakeDb();
    await svc.account('u1', day('2026-07-01'));
    accounts.u1.balance = 40;
    const [a, b] = await Promise.all([
      svc.account('u1', day('2026-10-05')),
      svc.account('u1', day('2026-10-05')),
    ]);
    expect(a.balance).toBe(1000);
    expect(b.balance).toBe(1000);
    expect(accounts.u1).toMatchObject({
      period_start: day('2026-10-01'),
      period_end: day('2026-11-01'),
    });
    const resets = ledger.filter(
      (l) => (l.meta as { reason?: string }).reason === 'monthly_reset',
    );
    expect(resets).toHaveLength(1);
    expect(resets[0]).toMatchObject({
      amount: 960,
      balance_after: 1000,
      meta: { previous_balance: 40 },
    });
  });
});

describe('CreditsService.charge', () => {
  it('takes the tokens off the balance and writes one consume line linked to the usage event', async () => {
    const { accounts, ledger } = fakeDb();
    await svc.charge(
      'u1',
      { feature: 'career.chat', model: 'gpt-4.1', cost_usd: 0.0098 },
      'ev1',
    );
    expect(accounts.u1.balance).toBe(990.2);
    expect(ledger.at(-1)).toMatchObject({
      kind: 'consume',
      amount: -9.8,
      balance_after: 990.2,
      feature: 'career.chat',
      usage_event_id: 'ev1',
    });
  });

  it('concurrent charges are all counted', async () => {
    const { accounts } = fakeDb();
    await svc.account('u1');
    await Promise.all(
      Array.from({ length: 5 }, () =>
        svc.charge('u1', { feature: 'resume.write', cost_usd: 0.002 }),
      ),
    );
    expect(accounts.u1.balance).toBe(990);
  });

  it('free usage writes nothing; a database error never throws into the feature', async () => {
    const { ledger, db } = fakeDb();
    await svc.charge('u1', { feature: 'extension.v3.turn', cost_usd: 0.3 });
    expect(ledger).toHaveLength(0);
    db.creditAccount.findUnique.mockRejectedValueOnce(new Error('down'));
    await expect(
      svc.charge('u1', { feature: 'career.chat', cost_usd: 0.01 }),
    ).resolves.toBeUndefined();
  });
});

describe('CreditsService.require', () => {
  it('lets a seeker with tokens through and refuses one with none, with 402 and the refill date', async () => {
    const { accounts } = fakeDb();
    await expect(svc.require('u1')).resolves.toMatchObject({ balance: 1000 });
    accounts.u1.balance = -0.4;
    const err = await svc.require('u1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InsufficientTokensException);
    const ex = err as InsufficientTokensException;
    expect(ex.getStatus()).toBe(402);
    expect(ex.getResponse()).toMatchObject({
      code: 'insufficient_tokens',
      balance: -0.4,
      resetsAt: accounts.u1.period_end,
    });
  });

  it('refuses when the balance cannot cover what the action needs', async () => {
    fakeDb();
    await expect(svc.require('u1', 1500)).rejects.toBeInstanceOf(
      InsufficientTokensException,
    );
  });
});

describe('CreditsService.hold / release', () => {
  it('a hold takes tokens now; releasing gives them back exactly once', async () => {
    const { accounts, ledger } = fakeDb();
    await svc.account('u1');
    const id = (await svc.hold(
      'u1',
      300,
      'career.voice',
      { thread: 't1', minutes: 3 },
      60_000,
    ))!;
    expect(accounts.u1.balance).toBe(700);
    expect(await svc.release('u1', id)).toBe(true);
    expect(await svc.release('u1', id)).toBe(false);
    expect(accounts.u1.balance).toBe(1000);
    expect(ledger.map((l) => l.kind)).toEqual(['grant', 'hold', 'release']);
  });

  it("another seeker cannot release someone's hold", async () => {
    const { accounts } = fakeDb();
    await svc.account('u1');
    const id = (await svc.hold(
      'u1',
      300,
      'career.voice',
      { thread: 't1', minutes: 3 },
      60_000,
    ))!;
    expect(await svc.release('u2', id)).toBe(false);
    expect(accounts.u1.balance).toBe(700);
  });
});

describe('a search never spends more than the balance', () => {
  // Each Apify run reserves its worst case before it starts and is skipped when that
  // does not fit; its charge then settles the reservation to the real cost.
  const board = 'automation-lab~glassdoor-jobs-scraper'; // 0.01 start + 0.005 a result
  const runOnce = async (results: number) => {
    const id = await svc.hold(
      'u1',
      runCeiling(board, 40),
      'discovery.apify',
      { actor: board },
      60_000,
    );
    if (!id) return false;
    await svc.charge('u1', {
      feature: 'discovery.apify',
      model: board,
      meta: { results, hold: id, run: 'r1' },
    });
    return true;
  };

  it('two searches at once with 228 tokens: runs past what the balance covers are skipped, the balance never goes below 0', async () => {
    const { accounts } = fakeDb();
    await svc.account('u1');
    accounts.u1.balance = 228;
    expect(runCeiling(board, 40)).toBe(210);
    // two searches x 8 runs, all at once, each run finding its full 40 results
    const ran = await Promise.all(
      Array.from({ length: 16 }, () => runOnce(40)),
    );
    expect(ran.filter(Boolean)).toHaveLength(1);
    expect(accounts.u1.balance).toBe(18);
  });

  it('a run is charged its real results, never more than it reserved; the reservation nets out of the ledger', async () => {
    const { accounts, ledger } = fakeDb();
    await svc.account('u1');
    await runOnce(4); // 10 + 4 x 5 = 30 tokens
    expect(accounts.u1.balance).toBe(970);
    await runOnce(400); // an actor that ignores its limit: capped at the 210 reserved
    expect(accounts.u1.balance).toBe(760);
    expect(ledger.map((l) => l.kind)).toEqual([
      'grant',
      'hold',
      'release',
      'consume',
      'hold',
      'release',
      'consume',
    ]);
    const sum = ledger.reduce((n, l) => n + (l.amount as number), 0);
    expect(sum).toBe(760);
  });

  it('a run that failed (no results) gives its whole reservation back', async () => {
    const { accounts } = fakeDb();
    await svc.account('u1');
    const id = await svc.hold('u1', 210, 'discovery.apify', {}, 60_000);
    await svc.charge('u1', {
      feature: 'discovery.apify',
      model: board,
      meta: { hold: id },
    });
    expect(accounts.u1.balance).toBe(1000);
  });

  it('a reservation nobody settled is given back after its time, on the next read', async () => {
    const { accounts } = fakeDb();
    await svc.account('u1');
    await svc.hold('u1', 500, 'career.voice', { thread: 't1' }, 60_000);
    expect((await svc.account('u1')).balance).toBe(500);
    const later = new Date(Date.now() + 2 * 60_000);
    expect((await svc.account('u1', later)).balance).toBe(1000);
    expect(accounts.u1.balance).toBe(1000);
  });
});

describe('an unreported voice call (the tab was closed)', () => {
  // 10 minutes reserved at 100 tokens a minute, closed 15 minutes after the start
  const call = async () => {
    const t0 = Date.now();
    const id = (await svc.hold(
      'u1',
      1000,
      'career.voice',
      { thread: 't1', minutes: 10 },
      15 * 60_000,
    ))!;
    return { t0, id, after: new Date(t0 + 16 * 60_000) };
  };

  it('one that connected is billed from connecting to its last heartbeat, per started minute', async () => {
    const { accounts, ledger } = fakeDb();
    await svc.account('u1');
    const { t0, id, after } = await call();
    expect(await svc.markAlive('u1', id, t0 + 1_000)).toBe(true); // connected
    expect(await svc.markAlive('u1', id, t0 + 252_000)).toBe(true); // last heartbeat, then the tab closed
    expect((await svc.account('u1', after)).balance).toBe(500); // 4.2 min -> 5 started minutes
    expect(accounts.u1.balance).toBe(500);
    expect(ledger.at(-1)).toMatchObject({
      kind: 'consume',
      amount: -500,
      feature: 'career.voice',
      meta: { thread: 't1', hold: id, minutes: 5, unreported: true },
    });
  });

  it('never more than reserved, and never billed twice when two closes race', async () => {
    const { accounts, ledger } = fakeDb();
    await svc.account('u1');
    const { t0, id, after } = await call();
    await svc.markAlive('u1', id, t0);
    await svc.markAlive('u1', id, t0 + 14 * 60_000);
    const hold = { ...ledger.find((l) => l.id === id)! };
    await svc.account('u1', after);
    expect(accounts.u1.balance).toBe(0); // capped at the 10 minutes reserved
    // a stale copy of the hold closed again (a retry racing the expiry): nothing more
    expect(await svc.closeHold('u1', hold as never, after.getTime())).toBe(
      false,
    );
    expect(accounts.u1.balance).toBe(0);
  });

  it('one that never connected (the key or the server failed, the mic was refused) is given back in full', async () => {
    const { accounts, ledger } = fakeDb();
    await svc.account('u1');
    const { after } = await call();
    expect((await svc.account('u1', after)).balance).toBe(1000);
    expect(accounts.u1.balance).toBe(1000);
    expect(ledger.some((l) => l.kind === 'consume')).toBe(false);
  });

  it('a heartbeat after the call was settled or its time is over changes nothing', async () => {
    fakeDb();
    await svc.account('u1');
    const { t0, id } = await call();
    expect(await svc.markAlive('u1', id, t0 + 16 * 60_000)).toBe(false);
    await svc.release('u1', id);
    expect(await svc.markAlive('u1', id, t0 + 1_000)).toBe(false);
  });
});

describe('the free grant waits for a confirmed email', () => {
  it('an unverified account gets no grant and a 402 email_unverified; once confirmed, the next read grants it once', async () => {
    const { accounts, ledger, users } = fakeDb(false);
    expect((await svc.account('u1')).balance).toBe(0);
    const err = (await svc.require('u1').catch((e: unknown) => e)) as {
      getResponse(): unknown;
    };
    expect(err).toBeInstanceOf(InsufficientTokensException);
    expect(err.getResponse()).toMatchObject({
      code: 'email_unverified',
      message: 'Confirm your email to get your 1,000 free tokens',
    });
    users.u1.email_verified_at = new Date();
    await Promise.all([svc.account('u1'), svc.account('u1')]);
    expect(accounts.u1).toMatchObject({ balance: 1000, unverified: false });
    expect(ledger.filter((l) => l.kind === 'grant')).toHaveLength(1);
    await expect(svc.require('u1')).resolves.toBeTruthy();
  });
});

describe('CreditsService.overview', () => {
  it('one line per search, named; settled reservations and crumbs under 0.05 left out; totals by kind of work', async () => {
    const { accounts } = fakeDb();
    await svc.account('u1');
    for (let i = 0; i < 95; i++)
      await svc.charge('u1', {
        feature: 'discovery.apify',
        model: 'cirkit~talent-com-jobs-scraper',
        meta: { results: 3, run: 'r1', thread: 'Data analyst search' },
      });
    await svc.charge('u1', { feature: 'career.chat', cost_usd: 0.00002 });
    await svc.charge('u1', { feature: 'quiz.section', cost_usd: 0.01 });
    const voice = await svc.hold(
      'u1',
      100,
      'career.voice',
      { thread: 't1' },
      60_000,
    );
    const settled = await svc.hold(
      'u1',
      50,
      'career.voice',
      { thread: 't2' },
      60_000,
    );
    await svc.release('u1', settled!);
    const o = await svc.overview('u1', 20);
    expect(o.history.map((m) => [m.label, m.amount, m.count])).toEqual([
      ['Reserved for a voice call', -100, 1],
      ['Building a practice quiz', -10, 1],
      ['Searching job boards · Data analyst search', -199.5, 95],
      ['Monthly tokens', 1000, 1],
    ]);
    expect(o.history[0].id).toBe(voice);
    expect(o.spent).toEqual({
      total: 209.5,
      byCategory: { search: 199.5, practice: 10 },
    });
    expect(o.balance).toBe(Math.round(accounts.u1.balance * 10) / 10);
    expect(o.nextBefore).toBeNull();
  });

  it('pages back without counting a line twice', async () => {
    fakeDb();
    await svc.account('u1');
    for (const f of ['resume.write', 'interview.plan', 'career.chat'])
      await svc.charge('u1', { feature: f, cost_usd: 0.002 });
    const first = await svc.overview('u1', 2);
    expect(first.history.map((m) => m.feature)).toEqual([
      'career.chat',
      'interview.plan',
    ]);
    const next = await svc.overview('u1', 2, first.nextBefore!);
    expect(next.history.map((m) => m.kind)).toEqual(['consume', 'grant']);
    expect(next.history[0].feature).toBe('resume.write');
  });
});

describe('affordableResults (deep search never outspends the balance)', () => {
  it('a full balance keeps the wanted budget; a small one shrinks it; none skips the paid boards', () => {
    expect(affordableResults(5000, 300)).toBe(300);
    expect(affordableResults(1000, 300)).toBe(190); // (1000 - 50 reserve) / 5 tokens for the dearest result
    expect(affordableResults(40, 300)).toBe(0);
    expect(affordableResults(-3, 300)).toBe(0);
  });
});

describe('plans and admin adjustments', () => {
  it('moving to a plan starts a fresh period with its full grant, at once', async () => {
    const { accounts, ledger } = fakeDb();
    await svc.account('u1', day('2026-10-01'));
    accounts.u1.balance = 12;
    await svc.setPlan('u1', 'pro', day('2026-10-20'));
    expect(accounts.u1).toMatchObject({
      plan: 'pro',
      balance: 7000,
      period_start: day('2026-10-20'),
      period_end: day('2026-11-20'),
    });
    expect(ledger.at(-1)).toMatchObject({
      kind: 'grant',
      amount: 6988, // balance after minus the balance before
      meta: { reason: 'plan_change', from_plan: 'free', previous_balance: 12 },
    });
    await expect(svc.setPlan('u1', 'platinum')).rejects.toThrow('Unknown plan');
  });

  it('the monthly reset refills to the plan the seeker is on', async () => {
    const { accounts } = fakeDb();
    await svc.account('u1', day('2026-09-01'));
    await svc.setPlan('u1', 'max', day('2026-09-01'), 2);
    accounts.u1.balance = 3;
    expect((await svc.account('u1', day('2026-10-02'))).balance).toBe(25000);
  });

  it('a plan set by hand lapses to Free when its paid months are over, instead of refilling forever', async () => {
    const { accounts, ledger } = fakeDb();
    await svc.account('u1', day('2026-01-31'));
    await svc.setPlan('u1', 'pro', day('2026-01-31'));
    // Jan 31 + 1 month is Feb 28, not Mar 3
    expect(accounts.u1).toMatchObject({
      period_end: day('2026-02-28'),
      paid_until: day('2026-02-28'),
    });
    accounts.u1.balance = 6000;
    const acc = await svc.account('u1', day('2026-03-01'));
    expect(acc).toMatchObject({
      plan: 'free',
      balance: 1000,
      paid_until: null,
    });
    expect(ledger.at(-1)).toMatchObject({
      amount: -5000, // what the balance really moved
      meta: { reason: 'plan_lapsed', from_plan: 'pro' },
    });
  });

  it('an adjustment moves the balance and is in the ledger with its reason', async () => {
    const { accounts, ledger } = fakeDb();
    await svc.adjust('u1', 250, 'refund: board outage');
    expect(accounts.u1.balance).toBe(1250);
    expect(ledger.at(-1)).toMatchObject({
      kind: 'adjust',
      amount: 250,
      balance_after: 1250,
      meta: { reason: 'refund: board outage' },
    });
  });
});

describe('top-ups (bought tokens are spent last and never expire)', () => {
  it('buying adds the pack to the balance and to the bought part, with the payment ref', async () => {
    const { accounts, ledger } = fakeDb();
    await svc.addTopup('u1', 'small', 'pay_123');
    expect(accounts.u1).toMatchObject({ balance: 2000, topup: 1000 });
    expect(ledger.at(-1)).toMatchObject({
      kind: 'topup',
      amount: 1000,
      balance_after: 2000,
      meta: { pack: 'small', ref: 'pay_123' },
    });
    await expect(svc.addTopup('u1', 'huge', 'x')).rejects.toThrow(
      'Unknown top-up',
    );
  });

  it('the monthly reset keeps what is left of the bought tokens', async () => {
    const { accounts } = fakeDb();
    // addTopup checks the account against the real clock: start the period a few days ago
    const t0 = new Date(Date.now() - 5 * 86_400_000);
    const later = (months: number) => {
      const d = new Date(t0);
      d.setUTCMonth(d.getUTCMonth() + months);
      return new Date(d.getTime() + 86_400_000);
    };
    await svc.account('u1', t0);
    await svc.addTopup('u1', 'small', 'p1'); // 1000 monthly + 1000 bought
    accounts.u1.balance = 1800; // spent 200: all from the monthly part
    expect((await svc.account('u1', later(1))).balance).toBe(2000);
    expect(accounts.u1).toMatchObject({ topup: 1000 });
    accounts.u1.balance = 500; // spent 1500: monthly gone, 500 of the bought left
    const acc = await svc.account('u1', later(2));
    expect(acc).toMatchObject({ balance: 1500, topup: 500 });
  });

  it('nothing bought: the reset is the plain grant (no roll-over of monthly tokens)', async () => {
    const { accounts } = fakeDb();
    await svc.account('u1', day('2026-09-01'));
    accounts.u1.balance = 700;
    expect((await svc.account('u1', day('2026-10-02'))).balance).toBe(1000);
  });

  it('a plan change keeps the bought tokens on top of the new grant', async () => {
    const { accounts } = fakeDb();
    await svc.addTopup('u1', 'medium', 'p2'); // 1000 + 3000
    accounts.u1.balance = 3500;
    await svc.setPlan('u1', 'pro');
    expect(accounts.u1).toMatchObject({
      plan: 'pro',
      balance: 10000,
      topup: 3000,
    });
  });
});

describe('CreditsService.checkout', () => {
  const service = (plan = 'free') =>
    new CreditsService({
      creditAccount: {
        findUnique: jest.fn().mockResolvedValue({
          plan,
          balance: 10,
          period_end: new Date('2099-01-01T00:00:00Z'),
        }),
      },
      creditLedger: { findMany: jest.fn().mockResolvedValue([]) },
      usageEvent: { create: requested },
    } as never);
  const requested = jest.fn().mockResolvedValue({});
  beforeEach(() => delete process.env.PAYMENTS_PROVIDER);

  it('refuses the plan the seeker already has, and an unknown pack', async () => {
    await expect(
      service('pro').checkout('u1', { plan: 'pro' }),
    ).rejects.toThrow('already on Pro');
    await expect(service().checkout('u1', { pack: 'huge' })).rejects.toThrow(
      'Unknown top-up',
    );
  });

  it('never upgrades or tops up without a payment: 503 payments_unavailable until a provider is connected', async () => {
    for (const item of [{ plan: 'max' as const }, { pack: 'medium' }]) {
      const err = (await service()
        .checkout('u1', item)
        .catch((e: unknown) => e)) as {
        getStatus(): number;
        getResponse(): unknown;
      };
      expect(err.getStatus()).toBe(503);
      expect(err.getResponse()).toMatchObject({ code: 'payments_unavailable' });
      // recorded, so the admin report lists it and the team can set it up by hand
      const [[last]] = requested.mock.calls.slice(-1) as [[{ data: object }]];
      expect(last.data).toMatchObject({
        feature: 'credits.request',
        user_id: 'u1',
        meta: item,
      });
    }
  });
});

describe('CreditsService.openHold', () => {
  it("finds this conversation's open reservation, not another's", async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'h2', meta: { thread: 't9' } },
      { id: 'h1', meta: { thread: 't1' } },
    ]);
    const svc = new CreditsService({ creditLedger: { findMany } } as never);
    expect((await svc.openHold('u1', 'career.voice', 't1'))?.id).toBe('h1');
    expect(await svc.openHold('u1', 'career.voice', 't5')).toBeNull();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: 'u1',
          kind: 'hold',
          feature: 'career.voice',
          settled_at: null,
        },
      }),
    );
  });
});

describe('CreditsService.resolveUser', () => {
  it('finds a seeker by email (any case) or id; anything else is a 404', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: 'u1' })
      .mockResolvedValue(null);
    const svc = new CreditsService({ user: { findFirst } } as never);
    expect(await svc.resolveUser('Someone@Example.com')).toBe('u1');
    expect((findFirst.mock.calls as [unknown][])[0][0]).toMatchObject({
      where: { email: { equals: 'Someone@Example.com', mode: 'insensitive' } },
    });
    await expect(svc.resolveUser('nobody@example.com')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
