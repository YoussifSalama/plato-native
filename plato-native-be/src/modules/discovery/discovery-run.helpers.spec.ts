import { JobSource } from '@prisma/client';
import {
  allSourcesFailed,
  applyAtsResult,
  applyBoardsResult,
  applyLinkedInResult,
  initialProgress,
  matchLabel,
  toMatchPercent,
} from './discovery-run.helpers';
import { mergeDiscoveryQuery } from './query-merge';
import { DiscoveryQuery, NormalizedJob } from './adapters/types';

const base: DiscoveryQuery = {
  titles: ['Backend Engineer'],
  locations: ['Cairo, Egypt'],
  countries: ['EG'],
  remoteTypes: ['remote'],
  jobTypes: ['full_time'],
  industries: [],
  yearsExperience: '3-5',
  willingToRelocate: false,
  visaSponsorshipRequired: false,
};

const job = (source: JobSource): NormalizedJob =>
  ({ source, external_id: 'x', title: 't', company: 'c', url: 'u' }) as never;

describe('mergeDiscoveryQuery', () => {
  it('lets chat overrides win and dedupes', () => {
    const q = mergeDiscoveryQuery(base, {
      titles: ['Full Stack Developer', 'Backend Engineer', 'Backend Engineer'],
    });
    expect(q.titles).toEqual(['Full Stack Developer', 'Backend Engineer']);
    expect(q.locations).toEqual(base.locations);
  });

  it('treats empty arrays as not specified', () => {
    expect(mergeDiscoveryQuery(base, { titles: [] }).titles).toEqual(
      base.titles,
    );
  });
});

describe('run progress reducers', () => {
  it('fans the ATS result out into workable + lever counts', () => {
    const p = applyAtsResult(initialProgress(), {
      status: 'fulfilled',
      value: [job('WORKABLE'), job('LEVER'), job('LEVER')],
    });
    expect(p.sources.workable).toEqual({ status: 'DONE', fetched: 1 });
    expect(p.sources.lever).toEqual({ status: 'DONE', fetched: 2 });
    expect(p.sources.linkedin.status).toBe('RUNNING');
  });

  it('records failures and detects total failure', () => {
    let p = applyAtsResult(initialProgress(['INDEED']), {
      status: 'rejected',
      reason: new Error('boom'),
    });
    expect(p.sources.lever).toEqual({
      status: 'FAILED',
      fetched: 0,
      error: 'boom',
    });
    expect(allSourcesFailed(p)).toBe(false);
    p = applyLinkedInResult(p, { status: 'rejected', reason: 'x' });
    expect(allSourcesFailed(p)).toBe(false);
    p = applyBoardsResult(p, { status: 'rejected', reason: 'x' });
    expect(allSourcesFailed(p)).toBe(true);
  });

  it('gives each searched board its own card and skips the rest', () => {
    const p0 = initialProgress(['INDEED', 'DICE']);
    expect(Object.keys(p0.sources)).toEqual(
      expect.arrayContaining(['indeed', 'dice']),
    );
    expect(p0.sources.jobbank).toBeUndefined();
    const p = applyBoardsResult(p0, {
      status: 'fulfilled',
      value: {
        jobs: [job('INDEED'), job('INDEED')],
        failed: { DICE: 'blocked' },
      },
    });
    expect(p.sources.indeed).toEqual({ status: 'DONE', fetched: 2 });
    expect(p.sources.dice).toEqual({
      status: 'FAILED',
      fetched: 0,
      error: 'blocked',
    });
    expect(p.sources.jobbank).toBeUndefined();
  });
});

describe('toMatchPercent / matchLabel', () => {
  it('normalizes to the best score and clamps', () => {
    expect(toMatchPercent(9.5, 10)).toBe(95);
    expect(toMatchPercent(null, 10)).toBe(0);
    expect(toMatchPercent(5, 0)).toBe(0);
    expect(toMatchPercent(12, 10)).toBe(100);
  });

  it('labels tiers', () => {
    expect(matchLabel(95)).toBe('Excellent match');
    expect(matchLabel(80)).toBe('Strong match');
    expect(matchLabel(40)).toBe('Match');
  });
});
