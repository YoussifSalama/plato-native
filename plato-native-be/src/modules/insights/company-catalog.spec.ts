import {
  entriesFromJobs,
  entriesFromSheet,
  mergeSources,
  parseCsv,
  sourceFromJob,
  tierOf,
} from './company-catalog';

describe('company catalogue (FOLLOWING.md 2.1)', () => {
  it('reads the sheet: quoted fields, commas inside quotes, CRLF', () => {
    const rows = parseCsv(
      'name,aliases,countries,website,source_type,source_ref,verified,notes\r\n"PwC Middle East","PwC;PricewaterhouseCoopers",EG;AE,https://www.pwc.com/m1,workday,https://pwc.wd3.myworkdayjobs.com/Global,yes,"Egypt roles, under \'\'Egypt\'\'"\r\n',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'PwC Middle East',
      aliases: 'PwC;PricewaterhouseCoopers',
      source_type: 'workday',
      verified: 'yes',
    });
  });

  it('one entry per company, several sources merged, website cleaned, unknown types skipped', () => {
    const [e, ...rest] = entriesFromSheet([
      {
        name: 'Vodafone Egypt',
        aliases: 'Vodafone',
        countries: 'eg',
        website: 'https://www.vodafone.com.eg/careers',
        source_type: 'successfactors',
        source_ref: 'https://careers.vodafone.com',
        verified: 'yes',
      },
      {
        name: 'Vodafone Egypt',
        aliases: '',
        countries: '',
        website: '',
        source_type: 'wuzzuf',
        source_ref: 'https://wuzzuf.net/jobs/careers/Vodafone-Egypt',
        verified: 'no',
      },
      {
        name: 'Vodafone Egypt',
        aliases: '',
        countries: '',
        website: '',
        source_type: 'myspace',
        source_ref: 'x',
        verified: 'yes',
      },
    ]);
    expect(rest).toHaveLength(0);
    expect(e).toMatchObject({
      name: 'Vodafone Egypt',
      countries: ['EG'],
      website: 'vodafone.com.eg',
    });
    expect(e.sources.map((s) => [s.type, s.status])).toEqual([
      ['successfactors', 'active'],
      ['wuzzuf', 'unverified'],
    ]);
  });

  it('merging keeps crawl state, never duplicates, and a verified row upgrades an unverified one', () => {
    const old = [
      {
        type: 'greenhouse' as const,
        ref: 'careem',
        verified: false,
        status: 'unverified' as const,
        fails: 2,
      },
    ];
    const merged = mergeSources(old, [
      { type: 'greenhouse', ref: 'Careem/', verified: true, status: 'active' },
      { type: 'lever', ref: 'talabat', verified: false, status: 'unverified' },
    ]);
    expect(merged).toEqual([
      {
        type: 'greenhouse',
        ref: 'careem',
        verified: true,
        status: 'active',
        fails: 2,
      },
      { type: 'lever', ref: 'talabat', verified: false, status: 'unverified' },
    ]);
  });

  it('boards from jobs our searches found (Greenhouse, Lever EU, Ashby, Workable); a job board listing is no source', () => {
    expect(
      sourceFromJob({
        source: 'GREENHOUSE',
        url: 'https://job-boards.greenhouse.io/careem/jobs/1',
        apply_url: null,
        company: 'Careem',
      }),
    ).toMatchObject({ type: 'greenhouse', ref: 'careem' });
    expect(
      sourceFromJob({
        source: 'LEVER',
        url: 'https://jobs.eu.lever.co/acme/123',
        apply_url: null,
        company: 'Acme',
      }),
    ).toMatchObject({ type: 'lever', ref: 'eu:acme' });
    expect(
      sourceFromJob({
        source: 'WORKABLE',
        url: 'https://jobs.workable.com/view/abc',
        apply_url: 'https://apply.workable.com/fawry/j/ABC123/',
        company: 'Fawry',
      }),
    ).toMatchObject({ type: 'workable', ref: 'fawry' });
    expect(
      sourceFromJob({
        source: 'LINKEDIN',
        url: 'https://www.linkedin.com/jobs/view/1',
        apply_url: null,
        company: 'IBM',
      }),
    ).toBeNull();
    const entries = entriesFromJobs([
      {
        source: 'ASHBY',
        url: 'https://jobs.ashbyhq.com/tamara/1',
        apply_url: null,
        company: 'Tamara',
        company_url: 'https://tamara.co',
      },
      {
        source: 'ASHBY',
        url: 'https://jobs.ashbyhq.com/tamara/2',
        apply_url: null,
        company: 'Tamara',
      },
    ]);
    expect(entries).toEqual([
      expect.objectContaining({
        name: 'Tamara',
        website: 'tamara.co',
        sources: [expect.objectContaining({ type: 'ashby', ref: 'tamara' })],
      }),
    ]);
  });

  it('crawl tiers: hot with 10+ followers or recent new jobs, warm when followed, cold otherwise', () => {
    const now = Date.now();
    expect(tierOf(12, null, now)).toBe('hot');
    expect(tierOf(2, new Date(now - 2 * 86_400_000), now)).toBe('hot');
    expect(tierOf(2, null, now)).toBe('warm');
    expect(tierOf(0, new Date(now), now)).toBe('cold');
  });
});
