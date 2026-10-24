// apify-client is ESM-only; the adapter is built here without calling it.
jest.mock('../apify.service', () => ({ ApifyService: class {} }));

import { BoardsAdapter, BOARDS } from './boards.adapter';
import { arc } from './boards/arc';
import { bayt } from './boards/bayt';
import { dynamitejobs } from './boards/dynamitejobs';
import { jobgether } from './boards/jobgether';
import { nodesk } from './boards/nodesk';
import { gulftalent } from './boards/gulftalent';
import { naukrigulf } from './boards/naukrigulf';
import { wellfound } from './boards/wellfound';
import { weworkremotely } from './boards/weworkremotely';
import { workingnomads } from './boards/workingnomads';
import { DiscoveryQuery } from './types';

// Items shaped like the real actor output (Naukrigulf and Working Nomads were
// captured from live runs; the others follow each actor's documented example).
const q = (over: Partial<DiscoveryQuery> = {}): DiscoveryQuery => ({
  titles: ['Frontend Developer', 'React Developer'],
  locations: ['Dubai, UAE'],
  countries: ['AE'],
  remoteTypes: ['onsite'],
  jobTypes: [],
  industries: [],
  yearsExperience: null,
  willingToRelocate: false,
  visaSponsorshipRequired: false,
  ...over,
});

it('maps the Gulf boards', () => {
  expect(
    naukrigulf.map(
      {
        designation: 'OFFICE & ACCOUNTS ADMINISTRATOR',
        location: 'Dubai - United Arab Emirates (UAE)',
        description: '<ul><li>Manage office</li></ul>',
        company: { name: 'ST LLC', id: '1', url: null },
        job_id: '121026000282',
        jd_url: 'https://www.naukrigulf.com/x-121026000282',
        latest_posted_date: '1791831511',
      } as never,
      'AE',
    ),
  ).toMatchObject({
    source: 'NAUKRIGULF',
    external_id: '121026000282',
    description: 'Manage office',
    url: 'https://www.naukrigulf.com/x-121026000282',
  });
  const posted = naukrigulf.map(
    {
      designation: 'D',
      company: { name: 'C' },
      jd_url: 'u',
      latest_posted_date: '1791831511',
    } as never,
    'AE',
  )!.posted_at!;
  expect(posted.getUTCFullYear()).toBe(2026);

  expect(
    bayt.map(
      {
        id: '5',
        title: 'Civil Engineer',
        company: 'Acme',
        city: 'Dubai',
        country: 'UAE',
        url: 'https://www.bayt.com/en/uae/jobs/x-5/',
        salaryMin: 8000,
        salaryMax: 12000,
        salaryPeriod: 'month',
        salaryLabel: 'AED 8,000 - 12,000',
        postedAt: '2026-10-10T00:00:00Z',
      } as never,
      'AE',
    ),
  ).toMatchObject({
    source: 'BAYT',
    location: 'Dubai, UAE',
    salary_min: 96000,
    salary_currency: 'AED',
  });

  expect(
    gulftalent.map(
      {
        job_id: '9',
        title: 'Office Assistant',
        company: 'X',
        location: 'Dubai, UAE',
        url: 'https://www.gulftalent.com/j/9',
        employmentType: 'FULL_TIME',
        salaryCurrency: 'AED',
        salaryMin: 2000,
        salaryMax: 3000,
        date_posted: '2026-10-10T06:00:00.000Z',
      } as never,
      'AE',
    ),
  ).toMatchObject({
    source: 'GULFTALENT',
    job_type: 'FULL_TIME',
    salary_currency: 'AED',
  });
});

it('maps the remote boards and skips unusable items', () => {
  expect(
    workingnomads.map(
      {
        id: '1925654',
        title: 'Senior Backend Developer',
        company: 'Proxify',
        job_url: 'https://www.workingnomads.com/job/go/1925654/',
        published_date: '2026-10-08T12:54:14-04:00',
        location: 'Time zone: CET',
        description: 'About us',
      } as never,
      'ANY',
    ),
  ).toMatchObject({
    source: 'WORKINGNOMADS',
    remote_type: 'REMOTE',
    external_id: '1925654',
  });
  // WWR titles come as "Company: Role"; the role is the title
  expect(
    weworkremotely.map(
      {
        job_id: 'remote-jobs/1',
        title: 'Acme Inc: Senior Backend Engineer',
        role: 'Senior Backend Engineer',
        company: 'Acme Inc',
        region: 'Anywhere in the World',
        url: 'https://weworkremotely.com/remote-jobs/1',
        posted_at: '2026-10-01T00:00:00Z',
      } as never,
      'ANY',
    ),
  ).toMatchObject({
    title: 'Senior Backend Engineer',
    location: 'Anywhere in the World',
  });
  expect(weworkremotely.map({ title: 'x' } as never, 'ANY')).toBeNull();
  expect(
    wellfound.map(
      {
        id: '4',
        title: 'Frontend Engineer',
        companyName: 'Ataraxis AI',
        remote: 'remote',
        compensation: '$140k – $190k',
        jobType: 'Full-time',
        jobUrl: 'https://wellfound.com/company/a/jobs/x',
        postedAtIso: '2026-10-09T00:00:00Z',
      } as never,
      'ANY',
    ),
  ).toMatchObject({
    source: 'WELLFOUND',
    remote_type: 'REMOTE',
    salary_min: 140000,
    salary_max: 190000,
    salary_currency: 'USD',
    company_url: null,
  });
});

it('plans Gulf boards for Gulf seekers and remote boards only for remote seekers', () => {
  const adapter = new BoardsAdapter({} as never);
  const onsite = adapter.sourcesFor(q());
  expect(onsite).toEqual(
    expect.arrayContaining(['BAYT', 'NAUKRIGULF', 'GULFTALENT']),
  );
  expect(onsite).not.toContain('WEWORKREMOTELY');
  const remote = adapter.sourcesFor(q({ remoteTypes: ['remote'] }));
  expect(remote).toEqual(
    expect.arrayContaining(['WEWORKREMOTELY', 'WORKINGNOMADS', 'WELLFOUND']),
  );
  // the title-blind board runs once, not once per title
  const runs = adapter.plan(q({ remoteTypes: ['remote'] }));
  expect(runs.filter((r) => r.board.source === 'WELLFOUND')).toHaveLength(1);
  expect(runs.filter((r) => r.board.source === 'WORKINGNOMADS')).toHaveLength(
    2,
  );
  expect(BOARDS.length).toBeGreaterThan(11);
});

it('maps Arc, Dynamite Jobs, Jobgether and NoDesk (shapes from live runs)', () => {
  expect(
    arc.map(
      {
        randomKey: 'pq02470r9i',
        title: 'Senior Frontend React Engineer',
        url: 'https://arc.dev/remote-jobs/j/talenthop-pq02470r9i',
        applyUrl: 'https://www.linkedin.com/jobs/view/1',
        companyName: 'TalentHop',
        companyOfficialSiteUrl: 'https://talenthop.com/',
        descriptionText: 'Fully remote',
        jobType: 'permanent',
        requiredCountries: ['US'],
        minAnnualSalary: null,
      } as never,
      'ANY',
    ),
  ).toMatchObject({
    source: 'ARC',
    url: 'https://arc.dev/remote-jobs/j/talenthop-pq02470r9i',
    apply_url: 'https://arc.dev/remote-jobs/j/talenthop-pq02470r9i',
    company_url: 'https://talenthop.com/',
    location: 'US',
  });

  expect(
    dynamitejobs.map(
      {
        url: 'https://dynamitejobs.com/company/IpinfoIo/remote-job/account-manager',
        objectId: '4mq7',
        title: 'Account Manager (SaaS/DaaS)',
        companyName: 'IPinfo',
        companyUrl: 'https://ipinfo.io',
        locationSlugs: ['GB'],
        jobTypeName: 'Full Time',
        salaryFrom: 120000,
        salaryTo: 140000,
        salaryCurrency: 'USD',
        salaryPeriod: 'yearly',
        description: 'About IPInfo',
        publishedAt: '2026-10-11T23:38:06.204000+00:00',
      } as never,
      'ANY',
    ),
  ).toMatchObject({
    source: 'DYNAMITEJOBS',
    salary_min: 120000,
    salary_currency: 'USD',
    job_type: 'FULL_TIME',
  });

  const jg = {
    offerId: '6ac5',
    title: 'Senior Frontend Developer - Freelance',
    company: 'Beyond Sports',
    canonicalUrl: 'https://jobgether.com/offer/6ac5-senior',
    applyUrl: 'https://jobgether.com/auto-apply',
    locations: ['DE', 'EG', 'AE'],
    employmentTypes: ['CONTRACTOR'],
    postedAt: '2026-10-07T04:32:21.000Z',
    description: 'Full remote',
  };
  expect(jobgether.map(jg as never, 'ANY')).toMatchObject({
    source: 'JOBGETHER',
    url: 'https://jobgether.com/offer/6ac5-senior',
    job_type: 'CONTRACTOR',
  });
  // it lists the countries it accepts: an Egypt seeker passes, a Canada seeker does not
  expect(jobgether.accepts!(jg, ['EG'])).toBe(true);
  expect(jobgether.accepts!(jg, ['CA'])).toBe(false);

  expect(
    nodesk.map(
      {
        title: 'Project Manager',
        company: 'Spiralyze',
        url: 'https://nodesk.co/remote-jobs/spiralyze-project-manager/',
        slug: 'spiralyze-project-manager',
        jobType: 'Full-Time',
        remoteLocation: 'Worldwide',
        publishedAt: '2026-10-06T00:00:00.000Z',
        companyWebsite: 'https://www.spiralyze.com/',
      } as never,
      'ANY',
    ),
  ).toMatchObject({
    source: 'NODESK',
    location: 'Worldwide',
    company_url: 'https://www.spiralyze.com/',
  });
});
