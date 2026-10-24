import { dedupeJobs, dedupeKey } from './dedupe';
import { NormalizedJob } from './adapters/types';

const job = (over: Partial<NormalizedJob>): NormalizedJob =>
  ({
    source: 'INDEED',
    external_id: '1',
    title: 'Backend Engineer',
    company: 'Microsoft Corp.',
    location: 'Cairo, Egypt',
    remote_type: 'ONSITE',
    easy_apply: false,
    url: 'https://indeed.com/1',
    description: 'short',
    raw: {},
    ...over,
  }) as NormalizedJob;

it('one posting from many boards gets one key and one survivor', () => {
  const a = job({});
  const b = job({
    source: 'GREENHOUSE',
    company: 'MICROSOFT CORPORATION',
    location: 'Cairo',
    url: 'https://boards.greenhouse.io/microsoft/jobs/9',
    description: 'a longer description of the role',
  });
  // "Cairo" alone resolves to no country; same company+title+place needs the country
  expect(dedupeKey(a)).toBe('microsoft|backendengineer|EG');
  const b2 = { ...b, location: 'Cairo, Egypt' };
  expect(dedupeKey(b2)).toBe(dedupeKey(a));
  const out = dedupeJobs([a, b2]);
  expect(out).toHaveLength(1);
  // the company's own ATS copy wins
  expect(out[0].source).toBe('GREENHOUSE');
  // a different title or country is a different job
  expect(dedupeKey(job({ title: 'Frontend Engineer' }))).not.toBe(dedupeKey(a));
  expect(dedupeKey(job({ location: 'Dubai, UAE' }))).not.toBe(dedupeKey(a));
  // remote with no country shares a "remote" place
  expect(dedupeKey(job({ location: 'Worldwide', remote_type: 'REMOTE' }))).toBe(
    'microsoft|backendengineer|remote',
  );
});
