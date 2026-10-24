import { JobSource } from '@prisma/client';
import { NormalizedJob } from './adapters/types';

export type RunStage =
  'crawling' | 'merging' | 'filtering' | 'ranking' | 'done' | 'failed';

// Every source's progress key is its JobSource, lower-cased.
export type SourceKey =
  | 'index'
  | 'linkedin'
  | 'workable'
  | 'lever'
  | 'greenhouse'
  | 'ashby'
  | Lowercase<BoardSource>
  | Lowercase<FeedSource>;

// ATS sources and the JobSource each card counts.
export const ATS_SOURCES = [
  ['workable', JobSource.WORKABLE],
  ['lever', JobSource.LEVER],
  ['greenhouse', JobSource.GREENHOUSE],
  ['ashby', JobSource.ASHBY],
] as const;

// Apify job boards; each gets its own card, but only the ones searched
// for this seeker's country appear in a run's progress.
export const BOARD_SOURCES = [
  JobSource.INDEED,
  JobSource.GOOGLE_JOBS,
  JobSource.ZIPRECRUITER,
  JobSource.GLASSDOOR,
  JobSource.TALENT,
  JobSource.JOBBANK,
  JobSource.JOBILLICO,
  JobSource.DICE,
  JobSource.HANDSHAKE,
  JobSource.BUILTIN,
  JobSource.WUZZUF,
  JobSource.BAYT,
  JobSource.NAUKRIGULF,
  JobSource.GULFTALENT,
  JobSource.WEWORKREMOTELY,
  JobSource.WORKINGNOMADS,
  JobSource.WELLFOUND,
  JobSource.ARC,
  JobSource.DYNAMITEJOBS,
  JobSource.JOBGETHER,
  JobSource.NODESK,
] as const;
export type BoardSource = (typeof BOARD_SOURCES)[number];

// Free official feeds and APIs (no Apify cost); a card appears only for the
// ones that ran for this search (Jooble and Adzuna need a key).
export const FEED_SOURCES = [
  JobSource.REMOTIVE,
  JobSource.JOBICY,
  JobSource.REMOTEOK,
  JobSource.HIMALAYAS,
  JobSource.JOOBLE,
  JobSource.ADZUNA,
] as const;
export type FeedSource = (typeof FEED_SOURCES)[number];
export const sourceKey = (s: JobSource) => s.toLowerCase() as SourceKey;

export interface SourceProgress {
  status: 'RUNNING' | 'DONE' | 'FAILED';
  fetched: number;
  error?: string;
}

// Everything the "searching" view animates. Persisted on the run row so a
// refresh (or a late SSE subscriber) starts from the current picture.
export interface RunProgress {
  stage: RunStage;
  sources: Record<SourceKey, SourceProgress>;
  merged: number | null;
  filtered: number | null;
  ranked: number | null;
  error?: string;
}

export function initialProgress(
  boards: readonly BoardSource[] = [],
  feeds: readonly JobSource[] = [],
): RunProgress {
  const running: SourceProgress = { status: 'RUNNING', fetched: 0 };
  const sources = {
    index: { ...running },
    linkedin: { ...running },
    workable: { ...running },
    lever: { ...running },
    greenhouse: { ...running },
    ashby: { ...running },
  } as Record<SourceKey, SourceProgress>;
  for (const b of boards) sources[sourceKey(b)] = { ...running };
  for (const f of feeds) sources[sourceKey(f)] = { ...running };
  return {
    stage: 'crawling',
    sources,
    merged: null,
    filtered: null,
    ranked: null,
  };
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : 'Unknown adapter error';
}

// ATS jobs come from two places (public board endpoints + the Apify actor),
// settled together; one result fans out into a card per ATS.
export function applyAtsResult(
  p: RunProgress,
  result: PromiseSettledResult<NormalizedJob[]>,
): RunProgress {
  const sources = { ...p.sources };
  for (const [key, source] of ATS_SOURCES)
    sources[key] =
      result.status === 'rejected'
        ? { status: 'FAILED', fetched: 0, error: errorMessage(result.reason) }
        : {
            status: 'DONE',
            fetched: result.value.filter((j) => j.source === source).length,
          };
  return { ...p, sources };
}

export function applyIndexResult(
  p: RunProgress,
  result: PromiseSettledResult<NormalizedJob[]>,
): RunProgress {
  const index: SourceProgress =
    result.status === 'fulfilled'
      ? { status: 'DONE', fetched: result.value.length }
      : { status: 'FAILED', fetched: 0, error: errorMessage(result.reason) };
  return { ...p, sources: { ...p.sources, index } };
}

export function applyLinkedInResult(
  p: RunProgress,
  result: PromiseSettledResult<NormalizedJob[]>,
): RunProgress {
  const linkedin: SourceProgress =
    result.status === 'fulfilled'
      ? { status: 'DONE', fetched: result.value.length }
      : { status: 'FAILED', fetched: 0, error: errorMessage(result.reason) };
  return { ...p, sources: { ...p.sources, linkedin } };
}

// What the boards adapter reports: jobs, plus boards whose every run failed.
export interface BoardsOutcome {
  jobs: NormalizedJob[];
  failed: Partial<Record<JobSource, string>>;
}

// Only boards searched for this run (present in p.sources) are touched.
export function applyBoardsResult(
  p: RunProgress,
  result: PromiseSettledResult<BoardsOutcome>,
): RunProgress {
  const sources = { ...p.sources };
  for (const board of BOARD_SOURCES) {
    const key = sourceKey(board);
    if (!sources[key]) continue;
    const error =
      result.status === 'rejected'
        ? errorMessage(result.reason)
        : result.value.failed[board];
    sources[key] =
      error !== undefined
        ? { status: 'FAILED', fetched: 0, error }
        : {
            status: 'DONE',
            fetched: (
              result as PromiseFulfilledResult<BoardsOutcome>
            ).value.jobs.filter((j) => j.source === board).length,
          };
  }
  return { ...p, sources };
}

// What the feeds adapter reports: jobs, plus feeds that failed.
export interface FeedsOutcome {
  jobs: NormalizedJob[];
  failed: Partial<Record<JobSource, string>>;
}

// Only feeds that ran for this search (present in p.sources) are touched.
export function applyFeedsResult(
  p: RunProgress,
  result: PromiseSettledResult<FeedsOutcome>,
): RunProgress {
  const sources = { ...p.sources };
  for (const feed of FEED_SOURCES) {
    const key = sourceKey(feed);
    if (!sources[key]) continue;
    const error =
      result.status === 'rejected'
        ? errorMessage(result.reason)
        : result.value.failed[feed];
    sources[key] =
      error !== undefined
        ? { status: 'FAILED', fetched: 0, error }
        : {
            status: 'DONE',
            fetched: (
              result as PromiseFulfilledResult<FeedsOutcome>
            ).value.jobs.filter((j) => j.source === feed).length,
          };
  }
  return { ...p, sources };
}

// The local index never counts as a "source failure" for the run.
export function allSourcesFailed(p: RunProgress) {
  const keys: SourceKey[] = [
    'linkedin',
    ...ATS_SOURCES.map(([k]) => k),
    ...BOARD_SOURCES.map(sourceKey).filter((k) => p.sources[k]),
    ...FEED_SOURCES.map(sourceKey).filter((k) => p.sources[k]),
  ];
  return keys.every((k) => p.sources[k].status === 'FAILED');
}

// Target pool size per run; what the index already covers is subtracted
// from what we ask Apify for.
export const RUN_TARGET = 300;

export function remainingBudget(indexHits: number, target = RUN_TARGET) {
  return Math.max(0, target - indexHits);
}

// BM25 scores are unbounded; express each match relative to the seeker's
// best score so the UI can show "95% match".
export function toMatchPercent(
  score: number | null | undefined,
  maxScore: number | null | undefined,
): number {
  if (!score || !maxScore || maxScore <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
}

export function matchLabel(
  percent: number,
): 'Excellent match' | 'Strong match' | 'Match' {
  if (percent >= 90) return 'Excellent match';
  if (percent >= 75) return 'Strong match';
  return 'Match';
}

// Freshness policy: postings older than this never enter a run, the local
// index, or the results. Override with MAX_POSTING_AGE_DAYS.
export const MAX_POSTING_AGE_DAYS = Math.max(
  1,
  Number(process.env.MAX_POSTING_AGE_DAYS) || 30,
);

export function postedCutoff(days = MAX_POSTING_AGE_DAYS, now = new Date()) {
  return new Date(now.getTime() - days * 86_400_000);
}

// Unknown dates are treated as stale: a posting we can't date can't be
// promised as "recent".
export function isFresh(
  job: { posted_at?: Date | null },
  days = MAX_POSTING_AGE_DAYS,
  now = new Date(),
) {
  return !!job.posted_at && job.posted_at >= postedCutoff(days, now);
}
