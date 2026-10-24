import { DiscoveryRun } from '@prisma/client';
import { isRecentIdentical, summarizeRun } from './run-status';

const base = (over: Partial<DiscoveryRun>): DiscoveryRun => ({
  id: 'r1',
  job_seeker_id: 's1',
  thread_id: 't1',
  status: 'DONE',
  query: {
    titles: ['Backend Engineer', 'Full Stack Developer'],
    locations: ['Cairo, Egypt'],
  },
  progress: {
    stage: 'done',
    sources: { linkedin: { status: 'DONE', fetched: 40 } },
    merged: 40,
    filtered: 40,
    ranked: 40,
  },
  fetched: 40,
  matched: 40,
  error: null,
  featured: null,
  started_at: new Date('2026-09-16T00:00:00Z'),
  finished_at: new Date('2026-09-16T00:01:00Z'),
  ...over,
});

describe('summarizeRun', () => {
  it('reports stage, elapsed and counts', () => {
    const s = summarizeRun(base({}), new Date('2026-09-16T00:05:00Z'));
    expect(s.stage).toBe('done');
    expect(s.elapsedSeconds).toBe(60);
    expect(s.shortlisted).toBe(40);
    expect(s.titles).toHaveLength(2);
  });

  it('measures elapsed against now while running', () => {
    const s = summarizeRun(
      base({ status: 'RUNNING', finished_at: null, progress: null }),
      new Date('2026-09-16T00:02:30Z'),
    );
    expect(s.elapsedSeconds).toBe(150);
    expect(s.stage).toBe('crawling');
  });
});

describe('isRecentIdentical', () => {
  const now = new Date('2026-09-16T00:10:00Z');
  it('matches same titles regardless of order/case within the window', () => {
    expect(
      isRecentIdentical(
        base({}),
        ['full stack developer', 'Backend Engineer'],
        now,
      ),
    ).toBe(true);
  });
  it('rejects different titles, old runs, or unfinished runs', () => {
    expect(isRecentIdentical(base({}), ['Data Analyst'], now)).toBe(false);
    expect(
      isRecentIdentical(
        base({}),
        ['Backend Engineer', 'Full Stack Developer'],
        new Date('2026-09-16T02:00:00Z'),
      ),
    ).toBe(false);
    expect(
      isRecentIdentical(
        base({ status: 'RUNNING', finished_at: null }),
        ['Backend Engineer', 'Full Stack Developer'],
        now,
      ),
    ).toBe(false);
  });
});
