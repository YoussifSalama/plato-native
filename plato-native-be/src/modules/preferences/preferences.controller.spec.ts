// @nestjs/config and @openai/agents ship as ESM, which this Jest setup does not load; neither runs here.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
jest.mock('@openai/agents', () => ({ run: jest.fn() }));
jest.mock('./preferences-suggestion.agent', () => ({
  createPreferenceSuggestionAgent: jest.fn(),
}));

import { BadRequestException } from '@nestjs/common';
import { PreferencesController } from './preferences.controller';

describe('PreferencesController.estimate (onboarding: "Plato sees about N open jobs")', () => {
  function setup(count = 310) {
    const prisma = {
      job: { aggregateRaw: jest.fn(async () => [{ n: count }]) },
    };
    const ctrl = new PreferencesController(
      {
        getByUserId: jest.fn(async () => ({
          id: 's',
          location: { city: 'Cairo', country: 'Egypt' },
        })),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      prisma as never,
    );
    return { ctrl, prisma };
  }
  const req = { userId: 'u' } as never;
  const body = {
    roles: ['ERP Consultant'],
    preferred_locations: ['Cairo'],
    work_setup: ['remote', 'hybrid'],
    salary_max: 4500,
    salary_currency: 'USD',
    salary_period: 'MONTHLY',
  };

  it('counts fresh open postings that fit, and judges the salary for the market', async () => {
    const { ctrl, prisma } = setup();
    const r = await ctrl.estimate(req, body);
    expect(r.openJobs).toBe(310);
    const [{ pipeline }] = prisma.job.aggregateRaw.mock.calls[0] as unknown as [
      { pipeline: Record<string, Record<string, unknown>>[] },
    ];
    expect(pipeline[0].$match.expired_at).toBeNull();
    expect(pipeline[1]).toEqual({ $count: 'n' });
    expect(r.salary).toEqual(
      expect.objectContaining({
        verdict: expect.any(String),
        typical: expect.any(Object),
      }),
    );
  });

  it('no job titles: nothing to count, no query', async () => {
    const { ctrl, prisma } = setup();
    expect((await ctrl.estimate(req, { ...body, roles: [] })).openJobs).toBe(0);
    expect(prisma.job.aggregateRaw).not.toHaveBeenCalled();
  });

  it('rejects a malformed body', async () => {
    await expect(
      setup().ctrl.estimate(req, { roles: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
