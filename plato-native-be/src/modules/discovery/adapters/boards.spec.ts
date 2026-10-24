import { JobRemoteType, JobSource } from '@prisma/client';

// apify-client ships ESM only; the adapter just needs the class token.
jest.mock('../apify.service', () => ({ ApifyService: class {} }));

import { builtin } from './boards/builtin';
import { dice } from './boards/dice';
import { BoardsAdapter } from './boards.adapter';
import { glassdoor } from './boards/glassdoor';
import { googleJobs } from './boards/google-jobs';
import { handshake } from './boards/handshake';
import { indeed } from './boards/indeed';
import { jobbank } from './boards/jobbank';
import { jobillico } from './boards/jobillico';
import { talent } from './boards/talent';
import { wuzzuf } from './boards/wuzzuf';
import { annual, locationText, toDate } from './boards/util';
import { ziprecruiter } from './boards/ziprecruiter';

describe('Indeed board', () => {
  const item = {
    title: 'Senior Software Engineer',
    company: 'Cisco',
    companyUrl: 'https://www.indeed.com/cmp/Cisco',
    location: 'San Francisco, CA 94105',
    salaryMin: 163600,
    salaryMax: 303100,
    salaryCurrency: 'USD',
    jobType: ['Full-time'],
    datePosted: '2026-03-12T10:00:00.000Z',
    description: 'Build things.',
    jobUrl: 'https://www.indeed.com/viewjob?jk=abc123',
    isRemote: false,
  };

  it('maps an item, taking the id from the jk param', () => {
    expect(indeed.map(item, 'US')).toMatchObject({
      source: JobSource.INDEED,
      external_id: 'abc123',
      company: 'Cisco',
      job_type: 'FULL_TIME',
      remote_type: JobRemoteType.UNKNOWN,
      easy_apply: false,
      salary_min: 163600,
      posted_at: new Date('2026-03-12T10:00:00.000Z'),
    });
  });

  it('drops items without a url', () => {
    expect(indeed.map({ ...item, jobUrl: undefined }, 'US')).toBeNull();
  });

  it('asks the actor for the market and the limit', () => {
    expect(
      indeed.input({
        title: 'Engineer',
        location: 'Toronto, ON',
        country: 'CA',
        limit: 25,
        query: {} as never,
      }),
    ).toMatchObject({ country: 'CA', maxItems: 25, location: 'Toronto, ON' });
  });
});

describe('board helpers', () => {
  it('annualises hourly and monthly pay', () => {
    expect(annual(25, 'HOUR')).toBe(52000);
    expect(annual(5000, 'MONTH')).toBe(60000);
    expect(annual(90000, 'YEAR')).toBe(90000);
    expect(annual(40)).toBe(83200); // no period, under 1000 -> hourly
    expect(annual(null, 'YEAR')).toBeNull();
  });

  it('reads relative and ISO dates', () => {
    const now = new Date('2026-09-25T12:00:00Z');
    expect(toDate('3 days ago', now)).toEqual(new Date('2026-09-22T12:00:00Z'));
    expect(toDate('Just posted', now)).toEqual(now);
    expect(toDate('2026-09-01', now)).toEqual(new Date('2026-09-01'));
    expect(toDate('5 day(s)', now)).toEqual(new Date('2026-09-20T12:00:00Z'));
    expect(toDate('nonsense', now)).toBeNull();
  });
});

describe('other boards', () => {
  it('Google Jobs: maps, id from the Google URL, asks for the market', () => {
    const j = googleJobs.map(
      {
        title: 'Data Analyst',
        company: 'Acme',
        location: 'Toronto, ON',
        employmentType: 'Full-time',
        postedDate: '2 days ago',
        applyUrl: 'https://acme.com/apply/1',
        googleJobsUrl: 'https://www.google.com/search?q=x&htidocid=abc',
      },
      'CA',
    );
    expect(j).toMatchObject({
      source: JobSource.GOOGLE_JOBS,
      company: 'Acme',
      job_type: 'FULL_TIME',
      apply_url: 'https://acme.com/apply/1',
    });
    expect(j?.posted_at).toBeInstanceOf(Date);
    expect(
      googleJobs.input({
        title: 'Data Analyst',
        location: 'Toronto, ON',
        country: 'CA',
        limit: 10,
        query: { remoteTypes: ['remote'] } as never,
      }),
    ).toMatchObject({ countryCode: 'ca', remoteOnly: true, maxResults: 10 });
  });

  it('ZipRecruiter: annualises pay, prefers the official apply URL', () => {
    expect(
      ziprecruiter.map(
        {
          title: 'Nurse',
          company_name: 'Clinic',
          salary_minimum: 30,
          salary_maximum: 40,
          salary_period: 'HOUR',
          salary_currency: 'USD',
          platform_url: 'https://www.ziprecruiter.com/c/x/job/1',
          official_url: 'https://clinic.com/jobs/1',
          work_mode: 'Hybrid',
        },
        'US',
      ),
    ).toMatchObject({
      source: JobSource.ZIPRECRUITER,
      salary_min: 62400,
      salary_max: 83200,
      apply_url: 'https://clinic.com/jobs/1',
      remote_type: JobRemoteType.HYBRID,
    });
  });

  it('Glassdoor: uses jobId and sends the market via location', () => {
    expect(
      glassdoor.map(
        { title: 'Dev', company: 'A', jobId: 99, jobUrl: 'https://g.com/j/99' },
        'US',
      ),
    ).toMatchObject({ source: JobSource.GLASSDOOR, external_id: '99' });
  });

  it('Talent.com: maps the direct ATS apply link', () => {
    expect(
      talent.map(
        {
          title: 'PM',
          company: 'B',
          jobId: 'x1',
          jobTypes: ['Contract'],
          applyUrl: 'https://boards.greenhouse.io/b/jobs/1',
          jobUrl: 'https://ca.talent.com/view?id=x1',
        },
        'CA',
      ),
    ).toMatchObject({
      source: JobSource.TALENT,
      job_type: 'CONTRACTOR',
      apply_url: 'https://boards.greenhouse.io/b/jobs/1',
    });
  });

  it('Job Bank: Canada only, id from the posting URL', () => {
    expect(jobbank.countries).toEqual(['CA']);
    expect(
      jobbank.map(
        {
          title: 'Cook',
          employer: 'Diner',
          url: 'https://www.jobbank.gc.ca/jobsearch/jobposting/41234567?source=x',
        },
        'CA',
      ),
    ).toMatchObject({ source: JobSource.JOBBANK, external_id: '41234567' });
  });
});

describe('remaining boards', () => {
  it('Jobillico: Canada only, reads "5 day(s)" and yearly pay', () => {
    expect(jobillico.countries).toEqual(['CA']);
    expect(
      jobillico.map(
        {
          jobId: '17359778',
          title: 'Software Engineer',
          company: 'Microsoft Canada',
          hiringCompany: 'Microsoft Canada',
          location: 'Vancouver, BC',
          employmentType: 'Full time',
          jobUrl: 'https://www.jobillico.com/en/job-offer/x/17359778',
          salaryMin: 67700,
          salaryMax: 133600,
          salaryCurrency: 'CAD',
          datePosted: '5 day(s)',
        },
        'CA',
      ),
    ).toMatchObject({
      source: JobSource.JOBILLICO,
      external_id: '17359778',
      job_type: 'FULL_TIME',
      salary_min: 67700,
    });
  });

  it('Dice: US only, workSetting drives remote type', () => {
    expect(dice.countries).toEqual(['US']);
    expect(
      dice.map(
        {
          title: 'Python Dev',
          company: 'Acme',
          workSetting: 'Remote',
          posted: 'Posted 3 days ago',
          url: 'https://www.dice.com/job-detail/abc-123',
        },
        'US',
      ),
    ).toMatchObject({
      source: JobSource.DICE,
      remote_type: JobRemoteType.REMOTE,
      external_id: 'https://www.dice.com/job-detail/abc-123',
    });
  });

  it('Handshake: annualises pay, keeps the employer site', () => {
    expect(
      handshake.map(
        {
          jobId: 7,
          jobUrl: 'https://app.joinhandshake.com/jobs/7',
          title: 'Intern',
          employerName: 'Corp',
          employerWebsite: 'https://corp.com',
          salaryMin: 20,
          salaryMax: 25,
          salaryPeriod: 'HOUR',
          isRemote: true,
        },
        'US',
      ),
    ).toMatchObject({
      source: JobSource.HANDSHAKE,
      external_id: '7',
      company_url: 'https://corp.com',
      salary_min: 41600,
      remote_type: JobRemoteType.REMOTE,
    });
  });

  it('Built In: yearly pay, ISO date wins over the label', () => {
    const j = builtin.map(
      {
        title: 'Backend Eng',
        company: 'Startup',
        url: 'https://builtin.com/job/backend-eng/123',
        salary_min: 120000,
        salary_max: 160000,
        posted: '2 days ago',
        date_posted: '2026-09-01',
      },
      'US',
    );
    expect(j).toMatchObject({
      source: JobSource.BUILTIN,
      salary_min: 120000,
      posted_at: new Date('2026-09-01'),
    });
  });
});

describe('BoardsAdapter', () => {
  const query = (over: object) =>
    ({
      titles: ['Engineer'],
      locations: ['Toronto, ON'],
      countries: ['CA'],
      remoteTypes: ['onsite'],
      willingToRelocate: false,
      ...over,
    }) as never;

  it('plans only the boards that serve the seeker market', () => {
    const a = new BoardsAdapter({} as never);
    const ca = a.sourcesFor(query({}));
    expect(ca).toContain(JobSource.JOBBANK);
    expect(ca).toContain(JobSource.INDEED);
    expect(ca).not.toContain(JobSource.DICE);
    const us = a.sourcesFor(
      query({ locations: ['Austin, TX'], countries: ['US'] }),
    );
    expect(us).toContain(JobSource.DICE);
    expect(us).not.toContain(JobSource.JOBBANK);
    // Egypt: Wuzzuf, and Bayt (it serves Egypt too)
    expect(a.sourcesFor(query({ countries: ['EG'] }))).toEqual([
      JobSource.WUZZUF,
      JobSource.BAYT,
    ]);
    // no country known: only remote seekers search, in the US and Canada
    expect(a.sourcesFor(query({ countries: [] }))).toEqual([]);
    expect(
      a.sourcesFor(query({ countries: [], remoteTypes: ['remote'] })),
    ).toContain(JobSource.INDEED);
  });

  it('reports a board failed only when all its runs failed', async () => {
    const apify = {
      runActor: jest.fn((actorId: string) =>
        actorId.startsWith('automation-lab~indeed')
          ? Promise.reject(new Error('blocked'))
          : Promise.resolve([]),
      ),
    };
    const out = await new BoardsAdapter(apify as never).discoverDetailed(
      query({}),
    );
    expect(out.failed).toEqual({ [JobSource.INDEED]: 'blocked' });
    expect(out.jobs).toEqual([]);
  });
});

describe('real-world output shapes', () => {
  it('ZipRecruiter: location object becomes one line of text', () => {
    const j = ziprecruiter.map(
      {
        title: 'Business Systems Developer',
        company_name: 'Grantek',
        location: {
          raw: 'Burlington, ON, CA',
          locality: 'Burlington',
          region: 'ON',
          country: 'Canada',
          country_code: 'CA',
        },
        platform_url:
          'https://www.ziprecruiter.com/c/G/Job/B/-in-Burlington,ON',
        official_url: '',
        company_website: '',
        salary_currency: '',
        posted_date: '2026-09-20T01:36:41Z',
      },
      'CA',
    );
    expect(j?.location).toBe('Burlington, ON, CA');
    expect(j?.apply_url).toBe(
      'https://www.ziprecruiter.com/c/G/Job/B/-in-Burlington,ON',
    );
    expect(j?.company_url).toBeNull();
    expect(j?.salary_currency).toBeNull();
  });

  it('locationText copes with text, objects and junk', () => {
    expect(locationText(' Cairo ')).toBe('Cairo');
    expect(locationText({ locality: 'Cairo', country: 'Egypt' })).toBe(
      'Cairo, Egypt',
    );
    expect(locationText(null)).toBeNull();
    expect(locationText(42)).toBeNull();
  });
});

describe('Wuzzuf board', () => {
  it('serves Egypt, searches by city, maps an item', () => {
    expect(wuzzuf.countries).toEqual(['EG']);
    expect(
      wuzzuf.input({
        title: 'Backend Developer',
        location: 'Cairo, Egypt',
        country: 'EG',
        limit: 20,
        query: { remoteTypes: ['remote'] } as never,
      }),
    ).toMatchObject({
      searchQueries: ['Backend Developer'],
      location: 'Cairo',
      workplace: 'Remote',
      maxItems: 20,
    });
    // a bare country is not a Wuzzuf city
    expect(
      wuzzuf.input({
        title: 'x',
        location: 'Egypt',
        country: 'EG',
        limit: 5,
        query: { remoteTypes: [] } as never,
      }),
    ).not.toHaveProperty('location');
    expect(
      wuzzuf.map(
        {
          jobId: 'w1',
          title: 'Backend Dev',
          company: 'Acme',
          location: 'Maadi, Cairo, Egypt',
          jobTypes: ['Full Time'],
          workplace: 'Hybrid',
          postedAt: '2026-09-20',
          url: 'https://wuzzuf.net/jobs/p/w1',
        },
        'EG',
      ),
    ).toMatchObject({
      source: JobSource.WUZZUF,
      external_id: 'w1',
      job_type: 'FULL_TIME',
      remote_type: JobRemoteType.HYBRID,
    });
  });
});
