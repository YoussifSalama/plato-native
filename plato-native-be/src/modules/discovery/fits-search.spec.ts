import { fitsSearch, searchMiss } from './discovery-run.helpers';
import { crossFacets } from './match-facets';

// Locations that leaked into a "remote, Saudi Arabia + UAE" search (2026-11-13).
const remoteGulf = {
  remoteTypes: ['remote' as const],
  countries: ['SA', 'AE'],
};
const job = (location: string | null, remote_type = 'REMOTE') => ({
  title: 'Full Stack Developer',
  description: null,
  location,
  remote_type: remote_type as 'REMOTE',
});

describe('fitsSearch', () => {
  it.each([
    'United States',
    'Brazil',
    'Remote Canada',
    'Remote US',
    'Seoul, Korea',
    'Hong Kong',
    'Taipei, Taiwan',
    'Remote, Canada; Remote, United States',
    'Buenos Aires',
  ])('drops remote jobs placed elsewhere: %s', (loc) => {
    expect(fitsSearch(job(loc), remoteGulf)).toBe(false);
  });

  it.each([
    'Riyadh, Riyadh, Saudi Arabia',
    'Dubai - United Arab Emirates (UAE)',
    'Abu Dhabi, UAE',
    'Worldwide',
    'Remote',
    null,
  ])('keeps remote jobs in the target countries or anywhere: %s', (loc) => {
    expect(fitsSearch(job(loc), remoteGulf)).toBe(true);
  });

  it('remote-only drops hybrid, on-site and unstated work mode', () => {
    for (const t of ['HYBRID', 'ONSITE', 'UNKNOWN'])
      expect(fitsSearch(job('Dubai, UAE', t), remoteGulf)).toBe(false);
  });

  it('on-site searches keep unstated work mode and unknown cities', () => {
    const q = { remoteTypes: ['onsite' as const], countries: ['SA'] };
    expect(fitsSearch(job('Riyadh, Saudi Arabia', 'UNKNOWN'), q)).toBe(true);
    expect(fitsSearch(job('Khobar', 'ONSITE'), q)).toBe(true);
    expect(fitsSearch(job('Cairo, Egypt', 'ONSITE'), q)).toBe(false);
  });

  it('no work mode or countries asked: everything passes', () => {
    expect(
      fitsSearch(job('Brazil', 'HYBRID'), { remoteTypes: [], countries: [] }),
    ).toBe(true);
  });
});

describe('crossFacets', () => {
  const j = (location: string, remote_type: string) => ({
    title: 'Dev',
    job_type: null,
    location,
    remote_type,
    salary_max: null,
    source: 'BAYT',
  });
  const jobs = [
    j('Dubai, United Arab Emirates', 'REMOTE'),
    j('Dubai, United Arab Emirates', 'UNKNOWN'),
    j('Dubai, United Arab Emirates', 'HYBRID'),
    j('Riyadh, Saudi Arabia', 'REMOTE'),
  ];

  it('each count is what picking it returns under the other filters', () => {
    const f = crossFacets(jobs, { remoteType: 'REMOTE' });
    const uae = f.locations.find((l) => l.value === 'United Arab Emirates');
    expect(uae?.count).toBe(1);
    expect(f.total).toBe(2);
    // The remote toggle's own count ignores itself but honours location.
    expect(crossFacets(jobs, { location: 'United Arab Emirates' }).remote).toBe(
      1,
    );
    expect(
      crossFacets(jobs, { location: 'United Arab Emirates' }).sources,
    ).toEqual([{ value: 'BAYT', count: 3 }]);
  });
});

describe('every New search detail is a hard rule (2026-11-13)', () => {
  const base = {
    remoteTypes: [] as ('remote' | 'onsite')[],
    countries: [] as string[],
  };
  const j = (over: Record<string, unknown> = {}) => ({
    title: 'Backend Engineer',
    location: 'Riyadh, Saudi Arabia',
    remote_type: 'ONSITE' as const,
    description: null as string | null,
    company: 'Acme',
    job_type: null as string | null,
    salary_max: null as number | null,
    salary_currency: null as string | null,
    posted_at: new Date() as Date | null,
    ...over,
  });
  const now = Date.now();
  it('level: entry drops senior titles, senior drops junior ones, unlabelled stays', () => {
    expect(
      searchMiss(j({ title: 'Senior Backend Engineer' }), {
        ...base,
        level: 'entry',
      }),
    ).toBe('level');
    expect(
      searchMiss(j({ title: 'Junior Backend Engineer' }), {
        ...base,
        level: 'senior',
      }),
    ).toBe('level');
    expect(searchMiss(j(), { ...base, level: 'senior' })).toBeNull();
  });
  it('employment: a stated kind outside the choice is dropped; unstated stays; every kind = no rule', () => {
    expect(
      searchMiss(j({ job_type: 'Contract' }), {
        ...base,
        jobTypes: ['full_time'],
      }),
    ).toBe('employment');
    expect(
      searchMiss(j({ job_type: 'Full-time' }), {
        ...base,
        jobTypes: ['full_time'],
      }),
    ).toBeNull();
    expect(searchMiss(j(), { ...base, jobTypes: ['full_time'] })).toBeNull();
    expect(
      searchMiss(j({ job_type: 'Contract' }), {
        ...base,
        jobTypes: [
          'full_time',
          'part_time',
          'contract',
          'internship',
          'temporary',
        ],
      }),
    ).toBeNull();
  });
  it('minimum pay: stated lower pay is dropped (yearly or monthly), unstated pay stays', () => {
    expect(
      searchMiss(j({ salary_max: 24_000, salary_currency: 'USD' }), {
        ...base,
        minMonthlyUsd: 3000,
      }),
    ).toBe('pay');
    expect(
      searchMiss(j({ salary_max: 4_000, salary_currency: 'USD' }), {
        ...base,
        minMonthlyUsd: 3000,
      }),
    ).toBeNull();
    expect(searchMiss(j(), { ...base, minMonthlyUsd: 3000 })).toBeNull();
  });
  it('salary shown only: a posting without pay is dropped', () => {
    expect(searchMiss(j(), { ...base, salaryShownOnly: true })).toBe('salary');
  });
  it('visa: "no sponsorship" postings are dropped when sponsorship is needed', () => {
    const noVisa = j({
      description: 'Note: we cannot offer visa sponsorship.',
    });
    expect(searchMiss(noVisa, { ...base, visaSponsorshipRequired: true })).toBe(
      'visa',
    );
    expect(
      searchMiss(noVisa, { ...base, visaSponsorshipRequired: false }),
    ).toBeNull();
  });
  it('posted within N days; undated stays', () => {
    expect(
      searchMiss(
        j({ posted_at: new Date(now - 10 * 86_400_000) }),
        { ...base, postedWithinDays: 7 },
        now,
      ),
    ).toBe('posted');
    expect(
      searchMiss(j({ posted_at: null }), { ...base, postedWithinDays: 7 }, now),
    ).toBeNull();
  });
  it('keywords: must include one (title or description), title must not contain an excluded one', () => {
    expect(
      searchMiss(j({ description: 'We use NestJS and Postgres' }), {
        ...base,
        includeKeywords: ['nestjs'],
      }),
    ).toBeNull();
    expect(searchMiss(j(), { ...base, includeKeywords: ['golang'] })).toBe(
      'keywords',
    );
    expect(
      searchMiss(j({ title: 'PHP Backend Engineer' }), {
        ...base,
        excludeKeywords: ['php'],
      }),
    ).toBe('keywords');
    expect(
      searchMiss(j({ description: 'PHP is a plus' }), {
        ...base,
        excludeKeywords: ['php'],
      }),
    ).toBeNull();
  });
  it('excluded companies', () => {
    expect(
      searchMiss(j({ company: 'Acme Holdings' }), {
        ...base,
        excludeCompanies: ['acme'],
      }),
    ).toBe('company');
  });
  it('live in: a remote job open only to another region is dropped for someone living elsewhere', () => {
    const usOnly = j({
      remote_type: 'REMOTE',
      location: 'Remote',
      description: 'This role is open to US residents only.',
    });
    expect(searchMiss(usOnly, { ...base, residenceCountry: 'EG' })).toBe(
      'place',
    );
    expect(searchMiss(usOnly, { ...base, residenceCountry: 'US' })).toBeNull();
  });
});

describe('the start request carries every rule to the query the search gate reads', () => {
  it('overrides -> query', () => {
    const { mergeDiscoveryQuery } =
      jest.requireActual<typeof import('./query-merge')>('./query-merge');
    const q = mergeDiscoveryQuery(
      {
        titles: ['x'],
        locations: [],
        countries: [],
        remoteTypes: ['any'],
        jobTypes: [],
        industries: [],
        yearsExperience: null,
        willingToRelocate: false,
        visaSponsorshipRequired: false,
      },
      {
        level: 'senior',
        minMonthlyUsd: 3000,
        residenceCountry: 'EG',
        postedWithinDays: 7,
        includeKeywords: ['nestjs'],
        excludeKeywords: ['php'],
        excludeCompanies: ['acme'],
        salaryShownOnly: true,
        willingToRelocate: true,
        visaSponsorshipRequired: true,
        jobTypes: ['full_time'],
      },
    );
    expect(q).toMatchObject({
      level: 'senior',
      minMonthlyUsd: 3000,
      residenceCountry: 'EG',
      postedWithinDays: 7,
      includeKeywords: ['nestjs'],
      excludeKeywords: ['php'],
      excludeCompanies: ['acme'],
      salaryShownOnly: true,
      willingToRelocate: true,
      visaSponsorshipRequired: true,
      jobTypes: ['full_time'],
    });
  });
});

describe('the index searches where the search asks (2026-11-13)', () => {
  it("countries win over the seeker's own places, with every name a posting may use", () => {
    const { indexFilter } = jest.requireActual<
      typeof import('./adapters/local-index.adapter')
    >('./adapters/local-index.adapter');
    const f = indexFilter({
      titles: ['Backend Developer'],
      locations: ['Cairo, Egypt'],
      remoteTypes: ['remote'],
      willingToRelocate: false,
      countries: ['SA', 'AE'],
    }) as { $and: { $or: Record<string, unknown>[] }[] };
    const text = JSON.stringify(f.$and[0].$or);
    expect(text).toContain('Saudi Arabia');
    expect(text).toContain('United Arab Emirates');
    expect(text).not.toContain('Cairo');
    expect(text).toContain('REMOTE');
  });
});

describe('remote jobs abroad that hire from where the seeker lives', () => {
  const q = {
    remoteTypes: ['remote' as const],
    countries: ['SA', 'AE'],
    residenceCountry: 'EG',
    remoteAnywhere: true,
  };
  const remote = (location: string, description: string | null = null) => ({
    title: 'Backend Engineer',
    location,
    remote_type: 'REMOTE' as const,
    description,
  });
  it('a remote job based abroad, open to anyone, is kept', () => {
    expect(fitsSearch(remote('United States'), q)).toBe(true);
    expect(
      fitsSearch(
        remote('Berlin, Germany', 'Fully remote, we hire worldwide.'),
        q,
      ),
    ).toBe(true);
  });
  it('one limited to a region that leaves Egypt out is dropped', () => {
    expect(
      fitsSearch(
        remote('Remote', 'This role is open to US residents only.'),
        q,
      ),
    ).toBe(false);
  });
  it('off: remote jobs must be in the chosen countries, as before', () => {
    expect(
      fitsSearch(remote('United States'), { ...q, remoteAnywhere: false }),
    ).toBe(false);
  });
});
