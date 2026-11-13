import { previewSearch, PreviewJob } from './search-preview';

const job = (over: Partial<PreviewJob>): PreviewJob => ({
  id: Math.random().toString(36),
  title: 'Presales Consultant',
  company: 'Mozn',
  location: 'Riyadh, Saudi Arabia',
  remote_type: 'REMOTE',
  job_type: null,
  salary_max: null,
  salary_currency: null,
  description: null,
  posted_at: new Date(),
  ...over,
});
const q = {
  titles: ['Presales'],
  countries: ['SA', 'AE'],
  remoteTypes: ['remote' as const, 'hybrid' as const],
  visaSponsorshipRequired: true,
  minMonthlyUsd: 3000,
};

describe('New search live preview: the search gate, counted per rule', () => {
  it('counts what each rule removes and what is left to take', () => {
    const p = previewSearch(
      [
        job({}),
        job({ location: 'Berlin, Germany' }), // relocate
        job({ remote_type: 'ONSITE', location: 'Dubai, UAE' }), // on-site, not asked
        job({ salary_max: 24_000, salary_currency: 'USD' }), // 2,000 a month < 3,000
        job({
          description: 'We are unable to offer visa sponsorship for this role.',
        }),
        job({
          title: 'Solutions Consultant',
          company: 'Nahr Pay',
          salary_max: 60_000,
          salary_currency: 'USD',
        }),
      ],
      q,
    );
    expect(p).toMatchObject({
      found: 6,
      relocate: 2,
      payBelow: 1,
      noVisa: 1,
      other: 0,
      canTake: 2,
    });
    expect(p.top[0].title).toBe('Presales Consultant'); // closest to what was asked first
  });
  it('advanced rules land in "other"', () => {
    const p = previewSearch(
      [
        job({}),
        job({ title: 'Senior Presales Lead' }),
        job({ company: 'Acme Corp' }),
      ],
      { ...q, level: 'entry', excludeCompanies: ['acme'] },
    );
    expect(p).toMatchObject({ other: 2, canTake: 1 });
  });
  it('no titles: nothing to count', () => {
    expect(previewSearch([], { ...q, titles: [] })).toMatchObject({
      found: 0,
      canTake: 0,
      top: [],
    });
  });
});
