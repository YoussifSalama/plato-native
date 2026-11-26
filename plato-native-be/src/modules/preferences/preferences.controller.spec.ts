// @nestjs/config and @openai/agents ship as ESM, which this Jest setup does not load; neither runs here.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
jest.mock('@openai/agents', () => ({ run: jest.fn() }));
jest.mock('./preferences-suggestion.agent', () => ({
  createPreferenceSuggestionAgent: jest.fn(),
}));

import { BadRequestException } from '@nestjs/common';
import { PreferencesController } from './preferences.controller';
import { preferenceEditSchema } from './preferences.schema';

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

describe('PreferencesController.getPreferences (first load)', () => {
  const { run } = jest.requireMock('@openai/agents');
  function setup(experiences: object[]) {
    const prefs = {
      get: jest.fn(() => ({ job_seeker_id: 's', roles: [] })),
      upsert: jest.fn(() => ({ id: 'p', roles: ['ERP Consultant'] })),
    };
    const ctrl = new PreferencesController(
      { getByUserId: jest.fn(() => ({ id: 's' })) } as never,
      prefs as never,
      {
        getFullProfile: jest.fn(() => ({
          experiences,
          educations: [],
          skills: [],
        })),
      } as never,
      { get: () => ({ profileExtractionModel: 'm' }) } as never,
      {} as never,
    );
    return { ctrl, prefs };
  }
  const req = { userId: 'u' } as never;
  beforeEach(() => run.mockReset());

  it('no CV read yet: the defaults, no AI run, nothing saved', async () => {
    const { ctrl, prefs } = setup([]);
    expect(await ctrl.getPreferences(req)).toEqual({
      job_seeker_id: 's',
      roles: [],
    });
    expect(run).not.toHaveBeenCalled();
    expect(prefs.upsert).not.toHaveBeenCalled();
  });

  it('an empty suggestion saved before the CV was read is made again', async () => {
    run.mockResolvedValue({
      finalOutput: { roles: ['ERP'] },
      rawResponses: [],
    });
    const { ctrl, prefs } = setup([{ title: 'ERP' }]);
    prefs.get.mockResolvedValueOnce({
      id: 'old',
      source: 'AI_SUGGESTED',
      roles: [],
    } as never);
    await ctrl.getPreferences(req);
    expect(prefs.upsert).toHaveBeenCalledTimes(1);
  });

  it('three parallel first loads: one AI run, one saved row', async () => {
    run.mockResolvedValue({
      finalOutput: { roles: ['ERP Consultant'] },
      rawResponses: [],
    });
    const { ctrl, prefs } = setup([{ title: 'ERP Consultant' }]);
    await Promise.all([1, 2, 3].map(() => ctrl.getPreferences(req)));
    expect(run).toHaveBeenCalledTimes(1);
    expect(prefs.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('preferenceEditSchema: what the extension may paste into forms', () => {
  const base = {
    roles: ['ERP Consultant'],
    preferred_locations: ['Cairo'],
    work_setup: ['remote'],
    preferred_job_types: ['full_time'],
    preferred_industries: [],
    salary_min: 1000,
    salary_max: 2000,
    salary_currency: 'USD',
    things_to_avoid: null,
    seniority: null,
    years_experience: null,
    availability: null,
    employment_status: null,
    willing_to_relocate: false,
    visa_sponsorship_required: false,
    linkedin_url: 'linkedin.com/in/x',
    github_url: '',
    portfolio_url: null,
  };
  it('a bare link gets https://, an empty one clears', () => {
    const r = preferenceEditSchema.parse(base);
    expect(r.linkedin_url).toBe('https://linkedin.com/in/x');
    expect(r.github_url).toBeNull();
  });
  it('refuses other schemes, unknown enums and a minimum above the expected salary', () => {
    for (const bad of [
      { linkedin_url: 'javascript:alert(1)' },
      { portfolio_url: 'ftp://x.com/a' },
      { work_setup: ['moon'] },
      { salary_currency: 'XXX' },
      { salary_min: 3000 },
      { salary_min: -1 },
      { roles: ['x'.repeat(121)] },
    ])
      expect(preferenceEditSchema.safeParse({ ...base, ...bad }).success).toBe(
        false,
      );
  });
});

describe('PreferencesController.savePreferences: only a real Continue confirms', () => {
  const body = {
    roles: ['ERP Consultant'],
    preferred_locations: ['Cairo'],
    work_setup: ['remote'],
    preferred_job_types: ['full_time'],
    preferred_industries: [],
    salary_min: 1000,
    salary_max: 2000,
    salary_currency: 'USD',
    things_to_avoid: null,
    seniority: null,
    years_experience: null,
    availability: null,
    employment_status: null,
    willing_to_relocate: false,
    visa_sponsorship_required: false,
    linkedin_url: null,
    github_url: null,
    portfolio_url: null,
  };
  const setup = () => {
    const upsert = jest.fn(
      async (_id: string, data: Record<string, unknown>) => data,
    );
    const ctrl = new PreferencesController(
      {} as never,
      { upsert, get: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    (
      ctrl as unknown as { requireJobSeekerId: () => Promise<string> }
    ).requireJobSeekerId = async () => 'js';
    return { ctrl, upsert };
  };

  it('a normal save confirms (onboarding Continue)', async () => {
    const { ctrl, upsert } = setup();
    await ctrl.savePreferences({ userId: 'u' } as never, body);
    expect(upsert.mock.calls[0][1]).toMatchObject({ source: 'USER_CONFIRMED' });
  });

  it('confirm: false (Profile links) saves without touching the source', async () => {
    const { ctrl, upsert } = setup();
    await ctrl.savePreferences({ userId: 'u' } as never, {
      ...body,
      confirm: false,
    });
    expect(upsert.mock.calls[0][1]).not.toHaveProperty('source');
    expect(upsert.mock.calls[0][1]).not.toHaveProperty('confirm');
  });
});
