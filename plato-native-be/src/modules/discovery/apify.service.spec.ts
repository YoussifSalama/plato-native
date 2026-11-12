import { ApifyService } from './apify.service';

jest.mock('../usage/usage', () => ({ recordUsage: jest.fn() }));
jest.mock('apify-client', () => ({ ApifyClient: jest.fn() }));
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

it('never runs more than 3 Apify actors at once', async () => {
  const svc = new ApifyService({
    get: () => ({ apifyToken: 'x' }),
  } as never);
  let now = 0;
  let peak = 0;
  (svc as unknown as { client: unknown }).client = {
    actor: () => ({
      call: async () => {
        peak = Math.max(peak, ++now);
        await new Promise((r) => setTimeout(r, 5));
        now--;
        return { defaultDatasetId: 'd', usageTotalUsd: 0 };
      },
    }),
    dataset: () => ({ listItems: async () => ({ items: [1] }) }),
  };
  const out = await Promise.all(
    Array.from({ length: 10 }, () => svc.runActor('a', {})),
  );
  expect(out).toHaveLength(10);
  expect(peak).toBe(3);
});
