import {
  fromAdzuna,
  fromHimalayas,
  fromJobicy,
  fromJooble,
  fromRemoteOk,
  fromRemotive,
  matchesQuery,
  OpenFeedsAdapter,
} from './open-feeds.adapter';
import { DiscoveryQuery } from './types';

// Fixture payloads shaped like each provider's documented response.
const query = (over: Partial<DiscoveryQuery> = {}): DiscoveryQuery => ({
  titles: ['Frontend Developer'],
  locations: ['Cairo, Egypt'],
  countries: ['EG'],
  remoteTypes: ['remote'],
  jobTypes: [],
  industries: [],
  yearsExperience: null,
  willingToRelocate: false,
  visaSponsorshipRequired: false,
  ...over,
});

it('maps every feed to a normalised job that links to the original listing', () => {
  const r = fromRemotive({
    id: 7,
    url: 'https://remotive.com/remote-jobs/software-dev/fe-7',
    title: 'Frontend Developer',
    company_name: 'Acme',
    publication_date: '2026-10-09T10:00:00',
    candidate_required_location: 'Worldwide',
    salary: '$50k - $70k',
    job_type: 'full_time',
    description: '<p>Build <b>UIs</b></p>',
  });
  expect(r).toMatchObject({
    source: 'REMOTIVE',
    external_id: '7',
    remote_type: 'REMOTE',
    url: 'https://remotive.com/remote-jobs/software-dev/fe-7',
    apply_url: 'https://remotive.com/remote-jobs/software-dev/fe-7',
    salary_min: 50000,
    salary_max: 70000,
    salary_currency: 'USD',
    description: 'Build UIs',
    easy_apply: false,
  });

  expect(
    fromJobicy({
      id: 1,
      url: 'https://jobicy.com/jobs/1',
      jobTitle: 'React Developer',
      companyName: 'Beta',
      jobGeo: 'Europe',
      jobType: ['Full-Time'],
      pubDate: '2026-10-09 08:00:00',
      salaryMin: 60000,
      salaryMax: 80000,
      salaryCurrency: 'EUR',
    }),
  ).toMatchObject({
    source: 'JOBICY',
    salary_currency: 'EUR',
    job_type: 'Full-Time',
  });

  // the first Remote OK item is a legal notice, not a job
  expect(fromRemoteOk({ id: undefined } as never)).toBeNull();
  expect(
    fromRemoteOk({
      id: 9,
      position: 'Dev',
      company: 'Gamma',
      slug: 'dev-gamma-9',
      salary_min: 0,
    }),
  ).toMatchObject({
    source: 'REMOTEOK',
    url: 'https://remoteok.com/remote-jobs/dev-gamma-9',
    salary_min: null,
  });

  expect(
    fromHimalayas({
      guid: 'g1',
      title: 'Engineer',
      companyName: 'Delta',
      applicationLink: 'https://himalayas.app/j/1',
      minSalary: 90000,
      currency: 'USD',
      locationRestrictions: ['Egypt'],
    }),
  ).toMatchObject({
    source: 'HIMALAYAS',
    location: 'Egypt',
    salary_min: 90000,
  });

  expect(
    fromJooble({
      id: 3,
      title: 'Frontend Developer (Remote)',
      company: 'Eps',
      link: 'https://jooble.org/desc/3',
      location: 'Riyadh',
      snippet: 'work from home',
    }),
  ).toMatchObject({ source: 'JOOBLE', remote_type: 'REMOTE' });
  expect(fromJooble({ title: 'x' })).toBeNull();

  expect(
    fromAdzuna(
      {
        id: 5,
        title: 'UI Dev',
        company: { display_name: 'Zed' },
        redirect_url: 'https://adzuna.co.uk/5',
        salary_min: 40000,
        created: '2026-10-01T00:00:00Z',
      },
      'gb',
    ),
  ).toMatchObject({ source: 'ADZUNA', salary_currency: 'GBP' });
});

it('filters a remote feed to the seeker: title match, and not "US only" for Egypt', () => {
  const base = fromRemotive({
    id: 1,
    url: 'u',
    title: 'Senior Frontend Developer',
    company_name: 'A',
    candidate_required_location: 'Worldwide',
  });
  expect(matchesQuery(base, query())).toBe(true);
  expect(
    matchesQuery(
      fromRemotive({ id: 2, url: 'u', title: 'Chef', company_name: 'A' }),
      query(),
    ),
  ).toBe(false);
  const usOnly = fromRemotive({
    id: 3,
    url: 'u',
    title: 'Frontend Developer',
    company_name: 'A',
    candidate_required_location: 'USA Only',
  });
  expect(matchesQuery(usOnly, query())).toBe(false);
  // no country known: nothing to exclude
  expect(matchesQuery(usOnly, query({ countries: [] }))).toBe(true);
});

it('runs the free feeds, survives one failing, and skips remote feeds for on-site seekers', async () => {
  const real = global.fetch;
  global.fetch = jest.fn((url: string) => {
    if (url.includes('remotive'))
      return Promise.resolve(
        Response.json({
          jobs: [
            {
              id: 1,
              url: 'https://remotive.com/1',
              title: 'Frontend Developer',
              company_name: 'A',
              publication_date: '2026-10-09T00:00:00',
              candidate_required_location: 'Worldwide',
            },
          ],
        }),
      );
    if (url.includes('jobicy'))
      return Promise.resolve(new Response('', { status: 500 }));
    if (url.includes('remoteok'))
      return Promise.resolve(
        Response.json([
          { legal: 'terms' },
          {
            id: 2,
            position: 'Frontend Developer',
            company: 'B',
            slug: 'fe-2',
            date: '2026-10-09T00:00:00Z',
          },
        ]),
      );
    return Promise.resolve(Response.json({ jobs: [] }));
  }) as never;
  try {
    const feeds = new OpenFeedsAdapter();
    expect(feeds.sourcesFor(query())).toEqual([
      'REMOTIVE',
      'JOBICY',
      'REMOTEOK',
      'HIMALAYAS',
    ]);
    const out = await feeds.discoverDetailed(query());
    expect(out.jobs.map((j) => j.source).sort()).toEqual([
      'REMOTEOK',
      'REMOTIVE',
    ]);
    expect(Object.keys(out.failed)).toEqual(['JOBICY']);
    expect(feeds.sourcesFor(query({ remoteTypes: ['onsite'] }))).toEqual([]);
  } finally {
    global.fetch = real;
  }
});
