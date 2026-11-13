import { JobSource } from '@prisma/client';
import { DiscoveryQuery, NormalizedJob } from './adapters/types';
import { excludesCountry } from '../apply/eligibility';
import { countryName, resolveCountry } from './countries';
import { jobTypeOf, type JobTypeKey } from './match-facets';
import { jobMonthlyUsd } from './salary-sanity';

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
  | 'career_site'
  | 'fantastic_jobs'
  | Lowercase<BoardSource>
  | Lowercase<FeedSource>;

// ATS sources and the JobSource each card counts.
export const ATS_SOURCES = [
  ['workable', JobSource.WORKABLE],
  ['lever', JobSource.LEVER],
  ['greenhouse', JobSource.GREENHOUSE],
  ['ashby', JobSource.ASHBY],
  ['career_site', JobSource.CAREER_SITE],
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

// Fantastic.jobs mode: the run has one source card, Fantastic itself.
export function fantasticProgress(): RunProgress {
  return {
    stage: 'crawling',
    sources: {
      fantastic_jobs: { status: 'RUNNING', fetched: 0 },
    } as Record<SourceKey, SourceProgress>,
    merged: null,
    filtered: null,
    ranked: null,
  };
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
    career_site: { ...running },
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

// Location text that places a remote job nowhere in particular.
const ANYWHERE =
  /^\s*$|\b(remote|worldwide|anywhere|global|international|emea|mena|middle east|gcc|gulf|distributed)\b/i;

// A posting that says it will not sponsor a visa.
export const NO_SPONSOR =
  /\b(no|not|unable to|cannot|can't|won't|will not|do not|don't)\b[^.]{0,40}\b(visa )?sponsor(ship)?\b|\bwithout (visa )?sponsorship\b|\bmust (already )?(have|hold|possess) (the )?(right|authori[sz]ation) to work\b/i;

// New search's employment values -> what a posting says (match-facets jobTypeOf).
const EMPLOYMENT: Record<string, JobTypeKey[]> = {
  full_time: ['full'],
  part_time: ['part'],
  contract: ['contract', 'temporary'],
  freelance: ['contract'],
  internship: ['intern'],
  temporary: ['temporary'],
};
// The level a title states (levelOf), and the levels each choice rules out. An unlabelled title is kept.
const LEVEL_OUT: Record<NonNullable<DiscoveryQuery['level']>, RegExp> = {
  entry:
    /\b(senior|sr\.?|lead|principal|staff|head|director|manager|vp|chief)\b/i,
  mid: /\b(intern(ship)?|trainee|graduate|principal|director|head of|vp|chief)\b/i,
  senior: /\b(junior|jr\.?|intern(ship)?|trainee|graduate|entry[ -]level)\b/i,
};
const words = (s: string) => s.toLowerCase();
const has = (text: string, word: string) =>
  new RegExp(
    `(^|[^a-z0-9])${word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`,
    'i',
  ).test(text);

export type SearchMiss =
  | 'place' // work mode or country
  | 'level'
  | 'employment'
  | 'pay'
  | 'visa'
  | 'posted'
  | 'keywords'
  | 'company'
  | 'salary';

type GateJob = Pick<
  NormalizedJob,
  'title' | 'location' | 'remote_type' | 'description'
> &
  Partial<
    Pick<
      NormalizedJob,
      'company' | 'job_type' | 'salary_max' | 'salary_currency' | 'posted_at'
    >
  >;
type GateQuery = Pick<DiscoveryQuery, 'remoteTypes' | 'countries'> &
  Partial<
    Pick<
      DiscoveryQuery,
      | 'jobTypes'
      | 'visaSponsorshipRequired'
      | 'level'
      | 'minMonthlyUsd'
      | 'residenceCountry'
      | 'postedWithinDays'
      | 'includeKeywords'
      | 'excludeKeywords'
      | 'excludeCompanies'
      | 'salaryShownOnly'
      | 'remoteAnywhere'
    >
  >;

// The search's own rules, applied to every job whatever source it came from: adapters search loosely (titles
// across all of Ashby, remote feeds from everywhere), so this is where every New search detail is enforced.
// Returns the first rule the job breaks, or null when it fits.
export function searchMiss(
  job: GateJob,
  query: GateQuery,
  now = Date.now(),
): SearchMiss | null {
  if (!fitsPlace(job, query)) return 'place';
  if (query.level && LEVEL_OUT[query.level].test(job.title)) return 'level';
  const wanted = (query.jobTypes ?? []).flatMap((t) => EMPLOYMENT[t] ?? []);
  // Every kind asked for (or none) is no rule; a posting that does not say its kind is kept.
  if (wanted.length && new Set(wanted).size < 5) {
    const kind = jobTypeOf({
      job_type: job.job_type ?? null,
      title: job.title,
    });
    if (kind && !wanted.includes(kind)) return 'employment';
  }
  const pay = jobMonthlyUsd(job);
  if (query.salaryShownOnly && pay === null) return 'salary';
  if (query.minMonthlyUsd && pay !== null && pay < query.minMonthlyUsd)
    return 'pay';
  if (query.visaSponsorshipRequired && NO_SPONSOR.test(job.description ?? ''))
    return 'visa';
  // ponytail: an undated posting is kept (many boards give no date; the freshness cap already applies).
  if (
    query.postedWithinDays &&
    job.posted_at &&
    now - new Date(job.posted_at).getTime() >
      query.postedWithinDays * 86_400_000
  )
    return 'posted';
  const text = `${job.title}\n${job.description ?? ''}`;
  if (
    query.includeKeywords?.length &&
    !query.includeKeywords.some((k) => has(text, k))
  )
    return 'keywords';
  if (query.excludeKeywords?.some((k) => has(job.title, k))) return 'keywords';
  if (
    query.excludeCompanies?.some((c) =>
      words(job.company ?? '').includes(words(c).trim()),
    )
  )
    return 'company';
  return null;
}

export const fitsSearch = (job: GateJob, query: GateQuery, now?: number) =>
  searchMiss(job, query, now) === null;

function fitsPlace(job: GateJob, query: GateQuery): boolean {
  const modes = query.remoteTypes;
  if (modes.length && !modes.includes('any')) {
    const mode = { REMOTE: 'remote', HYBRID: 'hybrid', ONSITE: 'onsite' }[
      job.remote_type as string
    ] as 'remote' | 'hybrid' | 'onsite' | undefined;
    // Unstated work mode is usually on-site: keep it only when on-site or hybrid is wanted.
    if (mode ? !modes.includes(mode) : !modes.some((m) => m !== 'remote'))
      return false;
  }
  const where = job.location?.trim() ?? '';
  // A remote job that only takes people from elsewhere is out for someone who lives here.
  if (
    job.remote_type === 'REMOTE' &&
    query.residenceCountry &&
    excludesCountry(
      { title: job.title, description: `${where}. ${job.description ?? ''}` },
      [countryName(query.residenceCountry).toLowerCase()],
    )
  )
    return false;
  // Remote abroad: a company anywhere that hires from where the seeker lives. Region-limited ones that leave the
  // seeker out are already gone above (residence); without a residence, the target countries stand in for it.
  if (job.remote_type === 'REMOTE' && query.remoteAnywhere) {
    if (query.residenceCountry) return true;
    if (query.countries.length)
      return !excludesCountry(
        { title: job.title, description: `${where}. ${job.description ?? ''}` },
        query.countries.map((c) => countryName(c).toLowerCase()),
      );
  }
  if (!query.countries.length) return true;
  const country = where ? resolveCountry(where) : null;
  if (country) return query.countries.includes(country);
  // ponytail: an unplaced on-site location (a city we don't list) is kept; the country search put it there.
  if (job.remote_type !== 'REMOTE') return true;
  // Remote and placed nowhere: keep "Remote"/"Worldwide"/"MENA"-style ones
  // unless the text limits them to a region the target countries are not in.
  if (!ANYWHERE.test(where)) return false;
  return !excludesCountry(
    { title: job.title, description: `${where}. ${job.description ?? ''}` },
    query.countries.map((c) => countryName(c).toLowerCase()),
  );
}
