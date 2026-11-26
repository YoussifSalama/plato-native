import { ApifyService, resultLimit, searchRun } from './apify.service';
import { meteredUser, recordUsage } from '../usage/usage';

jest.mock('../usage/usage', () => ({
  recordUsage: jest.fn(),
  meteredUser: jest.fn(),
}));
jest.mock('apify-client', () => ({ ApifyClient: jest.fn() }));
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

const fakeClient = (onCall = async () => {}) => ({
  actor: () => ({
    call: async () => {
      await onCall();
      return { defaultDatasetId: 'd', usageTotalUsd: 0 };
    },
  }),
  dataset: () => ({ listItems: () => Promise.resolve({ items: [1] }) }),
});
const service = (credits?: unknown) => {
  const svc = new ApifyService(
    { get: () => ({ apifyToken: 'x' }) } as never,
    credits as never,
  );
  return svc;
};

beforeEach(() => jest.clearAllMocks());

it('never runs more than 5 Apify actors at once', async () => {
  const svc = service();
  let now = 0;
  let peak = 0;
  (svc as unknown as { client: unknown }).client = fakeClient(async () => {
    peak = Math.max(peak, ++now);
    await new Promise((r) => setTimeout(r, 5));
    now--;
  });
  const out = await Promise.all(
    Array.from({ length: 10 }, () => svc.runActor('a', {})),
  );
  expect(out).toHaveLength(10);
  expect(peak).toBe(5);
});

describe('a paid run reserves its worst case first', () => {
  const board = 'automation-lab~glassdoor-jobs-scraper'; // 0.01 start + 0.005 a result
  it('reserves start fee + price x the limit it asks for, and names its search on the charge', async () => {
    (meteredUser as jest.Mock).mockReturnValue('u1');
    const credits = { hold: jest.fn().mockResolvedValue('h1') };
    const svc = service(credits);
    (svc as unknown as { client: unknown }).client = fakeClient();
    const ctx = {
      runId: 'r1',
      label: 'Data analyst search',
      ran: new Set<string>(),
      skipped: new Set<string>(),
    };
    await searchRun.run(ctx, () =>
      svc.runActor(board, { maxResults: 40, maxPages: 3 }),
    );
    expect(credits.hold).toHaveBeenCalledWith(
      'u1',
      210,
      'discovery.apify',
      { actor: board, run: 'r1' },
      expect.any(Number),
    );
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: {
          results: 1,
          hold: 'h1',
          run: 'r1',
          thread: 'Data analyst search',
        },
      }),
    );
    expect([...ctx.ran]).toEqual([board]);
  });

  it('a run the tokens do not cover is skipped: Apify is never called and the search learns it', async () => {
    (meteredUser as jest.Mock).mockReturnValue('u1');
    const svc = service({ hold: jest.fn().mockResolvedValue(null) });
    const call = jest.fn();
    (svc as unknown as { client: unknown }).client = {
      actor: () => ({ call }),
    };
    const ctx = {
      runId: 'r1',
      label: 'x',
      ran: new Set<string>(),
      skipped: new Set<string>(),
    };
    expect(
      await searchRun.run(ctx, () => svc.runActor(board, { limit: 10 })),
    ).toEqual([]);
    expect(call).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
    expect([...ctx.skipped]).toEqual([board]);
  });

  it('reads the limit under any of the boards’ names, not page counts', () => {
    expect(resultLimit({ limitPerSource: 25, maxPages: 9 })).toBe(25);
    expect(resultLimit({ maxResultsPerTerm: 30 })).toBe(30);
    expect(resultLimit({ max_results: 12, maxJobs: 15 })).toBe(15);
    expect(resultLimit({ query: 'x' })).toBe(100);
  });
});
