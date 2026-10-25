import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tokensFor, toTokens } from './credit-prices';
import { chargeUsage, creditAccount } from './credits';

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

// A tiny in-memory stand-in for the two collections.
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
          data: { balance: { decrement: number } };
        }) => {
          const a = accounts[where.user_id];
          a.balance =
            Math.round((a.balance - data.balance.decrement) * 1000) / 1000;
          return Promise.resolve({ ...a });
        },
      ),
    },
    creditLedger: {
      create: jest.fn(
        ({ data }: { data: Record<string, unknown> }) => (
          ledger.push(data),
          Promise.resolve(data)
        ),
      ),
    },
  };
  PrismaService.instance = db as never;
  return { accounts, ledger, db };
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('creditAccount', () => {
  it('a new seeker gets the free plan grant once, with a one-month period', async () => {
    const { ledger } = fakeDb();
    const acc = await creditAccount('u1', day('2026-10-25'));
    expect(acc).toMatchObject({
      plan: 'free',
      balance: 1000,
      period_end: day('2026-11-25'),
    });
    await creditAccount('u1', day('2026-10-26'));
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
      creditAccount('u1', day('2026-10-25')),
      creditAccount('u1', day('2026-10-25')),
    ]);
    expect(Object.keys(accounts)).toEqual(['u1']);
    expect(ledger.filter((l) => l.kind === 'grant')).toHaveLength(1);
  });

  it('after the period ends the balance resets to the grant (no roll-over), once, into the current period', async () => {
    const { accounts, ledger } = fakeDb();
    await creditAccount('u1', day('2026-07-01'));
    accounts.u1.balance = 40;
    const [a, b] = await Promise.all([
      creditAccount('u1', day('2026-10-05')),
      creditAccount('u1', day('2026-10-05')),
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

describe('chargeUsage', () => {
  it('takes the tokens off the balance and writes one consume line linked to the usage event', async () => {
    const { accounts, ledger } = fakeDb();
    await chargeUsage(
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
    await creditAccount('u1');
    await Promise.all(
      Array.from({ length: 5 }, () =>
        chargeUsage('u1', { feature: 'resume.write', cost_usd: 0.002 }),
      ),
    );
    expect(accounts.u1.balance).toBe(990);
  });

  it('free usage writes nothing; a database error never throws into the feature', async () => {
    const { ledger, db } = fakeDb();
    await chargeUsage('u1', { feature: 'extension.v3.turn', cost_usd: 0.3 });
    expect(ledger).toHaveLength(0);
    db.creditAccount.findUnique.mockRejectedValueOnce(new Error('down'));
    await expect(
      chargeUsage('u1', { feature: 'career.chat', cost_usd: 0.01 }),
    ).resolves.toBeUndefined();
  });
});
