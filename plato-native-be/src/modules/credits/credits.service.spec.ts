import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { affordableResults, tokensFor, toTokens } from './credit-prices';
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

// A tiny in-memory stand-in for the two collections, injected into the service.
let svc: CreditsService;
function fakeDb() {
  const accounts: Record<
    string,
    {
      user_id: string;
      plan: string;
      balance: number;
      period_start: Date;
      period_end: Date;
    }
  > = {};
  const ledger: Record<string, unknown>[] = [];
  const db = {
    creditAccount: {
      findUnique: jest.fn(({ where }: { where: { user_id: string } }) =>
        Promise.resolve(
          accounts[where.user_id] ? { ...accounts[where.user_id] } : null,
        ),
      ),
      findUniqueOrThrow: jest.fn(({ where }: { where: { user_id: string } }) =>
        Promise.resolve({ ...accounts[where.user_id] }),
      ),
      create: jest.fn(({ data }: { data: (typeof accounts)[string] }) => {
        if (accounts[data.user_id])
          return Promise.reject(
            new Prisma.PrismaClientKnownRequestError('dup', {
              code: 'P2002',
              clientVersion: 'x',
            }),
          );
        accounts[data.user_id] = { ...data };
        return Promise.resolve({ ...data });
      }),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { user_id: string; period_end: Date };
          data: Partial<(typeof accounts)[string]>;
        }) => {
          const a = accounts[where.user_id];
          if (!a || a.period_end.getTime() !== where.period_end.getTime())
            return Promise.resolve({ count: 0 });
          Object.assign(a, data);
          return Promise.resolve({ count: 1 });
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { user_id: string };
          data: Record<string, unknown>;
        }) => {
          const a = accounts[where.user_id] as Record<string, unknown>;
          // plain values are set; { increment, decrement } move a number
          for (const [k, v] of Object.entries(data)) {
            if (v && typeof v === 'object' && !(v instanceof Date)) {
              const o = v as { increment?: number; decrement?: number };
              const d = (o.increment ?? 0) - (o.decrement ?? 0);
              a[k] = Math.round((((a[k] as number) ?? 0) + d) * 1000) / 1000;
            } else a[k] = v;
          }
          return Promise.resolve({ ...a });
        },
      ),
    },
    creditLedger: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `l${ledger.length + 1}`, ...data };
        ledger.push(row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn(
        ({ where }: { where: { id: string; user_id: string; kind: string } }) =>
          Promise.resolve(
            ledger.find(
              (l) =>
                l.id === where.id &&
                l.user_id === where.user_id &&
                l.kind === where.kind,
            ) ?? null,
          ),
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { settled_at: Date };
        }) => {
          const l = ledger.find((x) => x.id === where.id);
          if (!l || l.settled_at !== null) return Promise.resolve({ count: 0 });
          l.settled_at = data.settled_at;
          return Promise.resolve({ count: 1 });
        },
      ),
    },
  };
  svc = new CreditsService(db as never);
  return { accounts, ledger, db };
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
      amount: 1000,
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
    const id = await svc.hold('u1', 300, 'career.voice', {
      thread: 't1',
      minutes: 3,
    });
    expect(accounts.u1.balance).toBe(700);
    expect(await svc.release('u1', id)).toBe(true);
    expect(await svc.release('u1', id)).toBe(false);
    expect(accounts.u1.balance).toBe(1000);
    expect(ledger.map((l) => l.kind)).toEqual(['grant', 'hold', 'release']);
  });

  it("another seeker cannot release someone's hold", async () => {
    const { accounts } = fakeDb();
    await svc.account('u1');
    const id = await svc.hold('u1', 300, 'career.voice', {
      thread: 't1',
      minutes: 3,
    });
    expect(await svc.release('u2', id)).toBe(false);
    expect(accounts.u1.balance).toBe(700);
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
      amount: 7000,
      meta: { reason: 'plan_change', from_plan: 'free', previous_balance: 12 },
    });
    await expect(svc.setPlan('u1', 'platinum')).rejects.toThrow('Unknown plan');
  });

  it('the monthly reset refills to the plan the seeker is on', async () => {
    const { accounts } = fakeDb();
    await svc.account('u1', day('2026-09-01'));
    await svc.setPlan('u1', 'max', day('2026-09-01'));
    accounts.u1.balance = 3;
    expect((await svc.account('u1', day('2026-10-02'))).balance).toBe(25000);
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
    } as never);
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
