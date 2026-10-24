import {
  buildFacets,
  jobTypeOf,
  levelOf,
  locationFacetValues,
  locationMatches,
} from './match-facets';
import { isFresh } from './discovery-run.helpers';

describe('job type normalisation', () => {
  it('maps the messy source values onto buckets', () => {
    const t = (job_type: string | null, title = 'Dev') =>
      jobTypeOf({ job_type, title });
    expect(t('Full-time')).toBe('full');
    expect(t('FULL_TIME')).toBe('full');
    expect(t('Contractor Full-Time')).toBe('contract');
    expect(t('CONTRACTOR')).toBe('contract');
    expect(t('Internship')).toBe('intern');
    expect(t('FULL_TIME', 'Backend Engineering Intern')).toBe('intern');
    expect(t('Temporary')).toBe('temporary');
    expect(t(null)).toBeNull();
  });
});

describe('level from title', () => {
  it('reads seniority words', () => {
    expect(levelOf('Senior Full-Stack Developer')).toBe('senior');
    expect(levelOf('Junior Engineer — Backend')).toBe('junior');
    expect(levelOf('Full Stack Developer')).toBe('mid');
  });
});

describe('locations', () => {
  it('fans a posting out into country and city|country facets', () => {
    expect(locationFacetValues('Qesm El Maadi, Cairo, Egypt')).toEqual([
      'Egypt',
      'Qesm El Maadi|Egypt',
      'Cairo|Egypt',
    ]);
    expect(locationFacetValues('United States')).toEqual(['United States']);
  });

  it('matches every token, so "Cairo|Egypt" covers the suburbs', () => {
    expect(locationMatches('New Cairo, Cairo, Egypt', 'Cairo|Egypt')).toBe(
      true,
    );
    expect(locationMatches('Giza, Al Jizah, Egypt', 'Cairo|Egypt')).toBe(false);
    expect(locationMatches('Giza, Al Jizah, Egypt', 'Egypt')).toBe(true);
  });
});

describe('buildFacets', () => {
  it('counts consistently with the matchers and drops empty buckets', () => {
    const f = buildFacets([
      {
        title: 'Senior Dev',
        job_type: 'FULL_TIME',
        location: 'Cairo, Cairo, Egypt',
        remote_type: 'HYBRID',
        salary_max: null,
      },
      {
        title: 'Dev',
        job_type: 'Contract',
        location: 'United States',
        remote_type: 'REMOTE',
        salary_max: 60000,
      },
    ]);
    expect(f.total).toBe(2);
    expect(f.jobTypes.map((t) => t.value)).toEqual(['full', 'contract']);
    expect(f.levels.map((l) => `${l.value}:${l.count}`)).toEqual([
      'mid:1',
      'senior:1',
    ]);
    expect(f.remote).toBe(1);
    expect(f.salary.hasSalary).toBe(1);
    expect(f.salary.atLeast.find((s) => s.value === 50000)?.count).toBe(1);
    expect(f.locations.find((l) => l.value === 'Cairo|Egypt')?.count).toBe(1);
  });

  it('buckets posting age cumulatively and ignores undated rows', () => {
    const now = new Date('2026-09-18T00:00:00Z');
    const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
    const base = {
      title: 'Dev',
      job_type: null,
      location: null,
      remote_type: 'UNKNOWN',
      salary_max: null,
    };
    const f = buildFacets(
      [
        { ...base, posted_at: days(0.5) },
        { ...base, posted_at: days(5) },
        { ...base, posted_at: days(20) },
        { ...base, posted_at: null },
      ],
      now,
    );
    expect(f.posted.map((p) => `${p.value}:${p.count}`)).toEqual([
      '1:1',
      '3:1',
      '7:2',
      '14:2',
      '30:3',
    ]);
  });
});

describe('freshness', () => {
  it('treats undated and over-cap postings as stale', () => {
    const now = new Date('2026-09-18T00:00:00Z');
    const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
    expect(isFresh({ posted_at: days(29) }, 30, now)).toBe(true);
    expect(isFresh({ posted_at: days(31) }, 30, now)).toBe(false);
    expect(isFresh({ posted_at: null }, 30, now)).toBe(false);
  });
});
