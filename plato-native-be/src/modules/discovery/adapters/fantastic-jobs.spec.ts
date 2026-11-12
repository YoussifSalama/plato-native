import { JobRemoteType, JobSource } from '@prisma/client';
import { fantasticRequests, fromFantastic } from './fantastic-jobs';
import { DiscoveryQuery } from './types';

jest.mock('../../usage/usage', () => ({ recordUsage: jest.fn() }));

const q: DiscoveryQuery = {
  titles: ['Full Stack Developer', 'Node.js Developer (Remote)'],
  locations: [],
  countries: ['AE', 'GB'],
  remoteTypes: ['remote', 'hybrid'],
  jobTypes: ['full_time', 'contract'],
  industries: [],
  yearsExperience: '3-5',
  willingToRelocate: false,
  visaSponsorshipRequired: false,
};

it('one request per planned title, plus worldwide remote, sharing the credits', () => {
  const r = fantasticRequests(q, 100, new Date('2026-11-12T00:00:00Z'));
  expect(r).toHaveLength(3);
  const [a, b, world] = r;
  // Plain words, so word order and hyphens don't matter; syntax characters dropped.
  expect(a.get('title')).toBe('Full Stack Developer');
  expect(b.get('title')).toBe('Node.js Developer Remote');
  expect(a.get('location')).toBe('"United Arab Emirates" OR "United Kingdom"');
  expect(a.get('ai_work_arrangement')).toBe('Remote OK,Remote Solely,Hybrid');
  expect(a.get('ai_employment_type')).toBe('FULL_TIME,CONTRACTOR');
  expect(a.get('date_posted_gte')).toMatch(/^2026-10-/);
  expect(a.has('ai_visa_sponsorship')).toBe(false);
  // A quarter of the budget goes to remote jobs with no location (worldwide).
  expect(world.get('has_no_location')).toBe('true');
  expect(world.has('location')).toBe(false);
  expect(world.get('title')).toBe(
    'Full Stack Developer OR Node.js Developer Remote',
  );
  const spent = r.reduce((n, p) => n + Number(p.get('limit')), 0);
  expect(spent).toBeLessThanOrEqual(100);
  expect(Number(world.get('limit'))).toBe(25);
});

it('on-site only: no worldwide-remote request, setup filter on-site', () => {
  const r = fantasticRequests(
    { ...q, remoteTypes: ['onsite'], visaSponsorshipRequired: true },
    50,
  );
  expect(r).toHaveLength(2);
  expect(r[0].get('ai_work_arrangement')).toBe('On-site');
  expect(r[0].get('ai_visa_sponsorship')).toBe('only');
  expect(r[0].get('limit')).toBe('25');
});

it('every setup or "any": no setup filter', () => {
  const r = fantasticRequests({ ...q, remoteTypes: ['any'] }, 50);
  expect(r[0].has('ai_work_arrangement')).toBe(false);
});

it('normalizes a job and drops one without a link', () => {
  const j = fromFantastic({
    id: 7,
    title: ' Backend Developer ',
    organization: 'Acme',
    url: 'https://boards.greenhouse.io/acme/jobs/1',
    date_posted: '2026-11-10T10:00:00Z',
    source: 'greenhouse',
    locations_derived: ['Dubai, Dubai, United Arab Emirates'],
    ai_work_arrangement: 'Hybrid',
    ai_employment_type: ['FULL_TIME'],
    ai_salary_min_value: 10000,
    ai_salary_max_value: 15000,
    ai_salary_currency: 'AED',
  });
  expect(j).toMatchObject({
    source: JobSource.FANTASTIC_JOBS,
    external_id: '7',
    title: 'Backend Developer',
    location: 'Dubai, Dubai, United Arab Emirates',
    remote_type: JobRemoteType.HYBRID,
    job_type: 'FULL_TIME',
    salary_min: 10000,
    salary_currency: 'AED',
  });
  expect(
    fromFantastic({ id: 8, title: 'x', organization: 'y', url: '' }),
  ).toBeNull();
});
