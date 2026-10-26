import { CreditsService } from './credits.service';
import { buildEstimates, nice, TOKENS_RULES } from './estimates';
import { CreditsEstimatesService } from './estimates.service';

describe('nice (coarse figures, so exact rates cannot be read back)', () => {
  it('rounds up to 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 x 10^n', () => {
    expect(
      [0.3, 1, 1.1, 9.8, 16.5, 23, 41, 99, 333, 1500, 7001].map(nice),
    ).toEqual([1, 1, 2, 10, 20, 25, 50, 100, 400, 1500, 8000]);
  });
});

describe('buildEstimates', () => {
  it('uses the starting figures until there is real data, then real averages', () => {
    const cold = buildEstimates(new Map());
    expect(cold.find((e) => e.action === 'career_message')).toMatchObject({
      about: 10,
      upTo: 20,
    });
    const warm = buildEstimates(new Map([['career.chat', 6.2]]));
    expect(warm.find((e) => e.action === 'career_message')).toMatchObject({
      about: 8,
      upTo: 15,
    });
  });

  it('an action made of several steps adds them up (only when every step has data)', () => {
    const avg = new Map([
      ['interview.plan', 3],
      ['interview.followup', 2],
      ['interview.score', 5],
    ]);
    expect(
      buildEstimates(avg).find((e) => e.action === 'mock_interview'),
    ).toMatchObject({ about: 20, upTo: 40 }); // 3 + 6x2 + 5 = 20
    avg.delete('interview.score');
    expect(
      buildEstimates(avg).find((e) => e.action === 'mock_interview')?.about,
    ).toBe(30); // falls back
  });

  it('voice is per minute; a new search has a range and says why it is often less', () => {
    const all = buildEstimates(new Map());
    expect(all.find((e) => e.action === 'voice_minute')).toMatchObject({
      about: 100,
      upTo: 100,
    });
    const search = all.find((e) => e.action === 'deep_search')!;
    expect(search.upTo).toBe(1500);
    expect(search.about).toBeLessThan(search.upTo);
    expect(search.note).toMatch(/already has matching jobs/);
  });
});

describe('CreditsEstimatesService.summary (what the API and the assistants get)', () => {
  let estimates: CreditsEstimatesService;
  beforeEach(() => {
    const prisma = {
      creditAccount: {
        findUnique: jest.fn().mockResolvedValue({
          plan: 'free',
          balance: 612.7,
          topup: 0,
          period_start: new Date('2026-10-01T00:00:00Z'),
          period_end: new Date('2099-11-01T00:00:00Z'),
        }),
      },
      creditLedger: {
        groupBy: jest.fn().mockResolvedValue([
          {
            feature: 'career.chat',
            _avg: { amount: -9.83 },
            _count: { _all: 40 },
          },
        ]),
      },
    };
    estimates = new CreditsEstimatesService(
      prisma as never,
      new CreditsService(prisma as never),
    );
  });

  it('balance, refill date, public plans and rounded estimates', async () => {
    const s = await estimates.summary('u1');
    expect(s).toMatchObject({
      plan: 'Free',
      balance: 612,
      monthly: 1000,
      refillsOn: '2099-11-01',
    });
    expect(s.plans.map((p) => p.name)).toEqual(['Free', 'Pro', 'Max']);
    expect(
      s.estimates.find((e) => e.action === 'career_message'),
    ).toMatchObject({ about: 10 });
  });

  it('holds nothing that reveals what Plato pays or how tokens are made', async () => {
    const json = JSON.stringify(await estimates.summary('u1'));
    for (const leak of [
      /cost/i,
      /margin/i,
      /apify/i,
      /gpt|claude|openai|anthropic/i,
      /perResult|perRun|usd_per|USD_PER/,
      /9\.83/,
      /0\.001/,
      /scraper/i,
    ])
      expect(json).not.toMatch(leak);
    // the only money in it is the public plan and top-up prices
    expect(json.match(/usd/gi)?.length).toBe(6);
  });

  it('the assistants are told never to state or guess pricing internals', () => {
    expect(TOKENS_RULES).toMatch(
      /Never state or guess what anything costs Plato/,
    );
    expect(TOKENS_RULES).toMatch(/profit or margins/);
    expect(TOKENS_RULES).toMatch(/call get_plato_tokens/);
  });
});
