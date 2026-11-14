import {
  afterVisit,
  fetchSource,
  fromSmartRecruiters,
  fromWorkableAccount,
} from './company-crawler';

describe('company crawler (FOLLOWING.md 2.2)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('SmartRecruiters and Workable postings become index jobs', () => {
    const sr = fromSmartRecruiters(
      {
        id: '7443',
        name: 'Presales Consultant',
        releasedDate: '2026-11-10T00:00:00Z',
        location: { city: 'Cairo', country: 'eg', remote: false },
      },
      'Valeo',
      'Valeo',
    );
    expect(sr).toMatchObject({
      source: 'CAREER_SITE',
      external_id: 'smartrecruiters:Valeo:7443',
      title: 'Presales Consultant',
      location: 'Cairo, EG',
      url: 'https://jobs.smartrecruiters.com/Valeo/7443',
    });
    const wk = fromWorkableAccount(
      {
        title: 'Backend Engineer',
        shortcode: 'AB12',
        city: 'Cairo',
        country: 'Egypt',
        telecommuting: true,
      },
      'fawry',
      'Fawry',
    );
    expect(wk).toMatchObject({
      source: 'WORKABLE',
      external_id: 'AB12',
      remote_type: 'REMOTE',
      url: 'https://apply.workable.com/fawry/j/AB12/',
    });
  });

  it('jobs carry the catalogue company name (so they match its followers); HTTP errors surface', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobs: [
              {
                id: 1,
                title: 'Data Engineer',
                absolute_url: 'https://boards.greenhouse.io/careem/jobs/1',
                location: { name: 'Dubai' },
                updated_at: '2026-11-12T00:00:00Z',
                content: '',
              },
            ],
          }),
          { status: 200 },
        ),
      );
    const jobs = await fetchSource(
      { type: 'greenhouse', ref: 'careem' },
      'Careem',
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      company: 'Careem',
      title: 'Data Engineer',
    });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('nope', { status: 404 }));
    await expect(
      fetchSource({ type: 'lever', ref: 'gone' }, 'Gone'),
    ).rejects.toThrow('HTTP 404');
  });

  it('health: success resets, the third failure in a row marks the source broken', () => {
    const s = {
      type: 'lever' as const,
      ref: 'acme',
      verified: false,
      status: 'unverified' as const,
    };
    const f1 = afterVisit(s, { ok: false, error: 'HTTP 500' });
    const f3 = afterVisit(afterVisit(f1, { ok: false, error: 'HTTP 500' }), {
      ok: false,
      error: 'HTTP 500',
    });
    expect([f1.status, f1.fails, f3.status, f3.fails]).toEqual([
      'unverified',
      1,
      'broken',
      3,
    ]);
    expect(afterVisit(f1, { ok: true })).toMatchObject({
      status: 'active',
      verified: true,
      fails: 0,
      last_error: null,
    });
  });
});
