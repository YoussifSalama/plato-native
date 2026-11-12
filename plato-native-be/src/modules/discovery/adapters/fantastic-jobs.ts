import { JobRemoteType, JobSource } from '@prisma/client';
import { recordUsage } from '../../usage/usage';
import { MAX_POSTING_AGE_DAYS } from '../discovery-run.helpers';
import { DiscoveryQuery, NormalizedJob } from './types';

// Fantastic.jobs (https://developer.fantastic.jobs): jobs indexed hourly from
// 200k+ companies' own hiring systems (Greenhouse, Lever, Workday, ...), with AI
// enrichments. With USE_FANTASTIC_JOBS=true (and FANTASTIC_JOBS_API_KEY) it is the
// WHOLE discovery: no Apify, no free feeds, no Plato index, so results compare
// cleanly with the usual sources. Billing: 1 credit per job returned; a search
// spends at most FANTASTIC_JOBS_LIMIT. Jobs link to the employer's own form, so
// auto-apply routes them by URL like any Greenhouse / Lever job.
const BASE = 'https://data.fantastic.jobs/v1/active-ats';
const TIMEOUT_MS = 30_000;

export const fantasticEnabled = () =>
  process.env.USE_FANTASTIC_JOBS === 'true' &&
  !!process.env.FANTASTIC_JOBS_API_KEY;

// Jobs per search = credits per search.
export const fantasticLimit = () =>
  Math.min(1000, Math.max(1, Number(process.env.FANTASTIC_JOBS_LIMIT) || 100));

// The API wants full English country names ("United Arab Emirates", not "AE").
const regionName = new Intl.DisplayNames(['en'], { type: 'region' });
const anyOf = (xs: string[]) =>
  xs.map((x) => `"${x.replace(/"/g, '')}"`).join(' OR ');
// A title as plain words (every word must be in the job title, any order), so
// "Full Stack Developer" also finds "Senior Full-Stack Developer (React)".
// Quotes, parentheses and a leading "-" are search syntax there, not words.
const titleWords = (t: string) =>
  t
    .replace(/["()]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^-+/, ''))
    .filter(Boolean)
    .join(' ');

// The seeker's setup in Fantastic's words. No filter when every setup is fine.
const ARRANGEMENT = {
  remote: ['Remote OK', 'Remote Solely'],
  hybrid: ['Hybrid'],
  onsite: ['On-site'],
} as const;
function arrangements(q: DiscoveryQuery): string[] | null {
  if (!q.remoteTypes.length || q.remoteTypes.includes('any')) return null;
  const out = q.remoteTypes.flatMap(
    (t) => ARRANGEMENT[t as keyof typeof ARRANGEMENT] ?? [],
  );
  return out.length && out.length < 4 ? out : null;
}
const wantsRemote = (q: DiscoveryQuery) =>
  !q.remoteTypes.length ||
  q.remoteTypes.includes('remote') ||
  q.remoteTypes.includes('any');

const EMPLOYMENT: Record<string, string> = {
  full_time: 'FULL_TIME',
  part_time: 'PART_TIME',
  contract: 'CONTRACTOR',
  freelance: 'CONTRACTOR',
  internship: 'INTERN',
  temporary: 'TEMPORARY',
};

// What every request shares: freshness, setup, job type, visa.
function baseParams(q: DiscoveryQuery, now: Date): URLSearchParams {
  const p = new URLSearchParams({
    // How far back Fantastic indexed it (1h | 24h | 7d | 6m); date_posted_gte
    // below is the real cap: posted within MAX_POSTING_AGE_DAYS, like every source.
    time_frame: process.env.FANTASTIC_JOBS_TIME_FRAME ?? '6m',
    description_format: 'text',
    date_posted_gte: new Date(
      now.getTime() - MAX_POSTING_AGE_DAYS * 86_400_000,
    ).toISOString(),
  });
  const types = [
    ...new Set(q.jobTypes.map((t) => EMPLOYMENT[t]).filter(Boolean)),
  ];
  if (types.length) p.set('ai_employment_type', types.join(','));
  if (q.visaSponsorshipRequired) p.set('ai_visa_sponsorship', 'only');
  return p;
}

// The requests one search makes, sharing the credit budget:
// - one per planned title, in the target countries, with the seeker's setups;
// - for a seeker open to remote, one more for remote jobs with no location at
//   all (worldwide), which a country filter would never return.
// Experience level is left to ranking: filtering on it drops every job whose
// level Fantastic could not read.
export function fantasticRequests(
  q: DiscoveryQuery,
  limit: number,
  now = new Date(),
): URLSearchParams[] {
  const titles = q.titles.slice(0, 8).map(titleWords).filter(Boolean);
  const worldwide = wantsRemote(q) && q.countries.length > 0;
  const forWorldwide = worldwide ? Math.max(1, Math.floor(limit / 4)) : 0;
  const perTitle = Math.max(
    1,
    Math.floor((limit - forWorldwide) / Math.max(1, titles.length)),
  );
  const setups = arrangements(q);
  const places = q.countries.map((c) => regionName.of(c) ?? c).slice(0, 10);

  const out = (titles.length ? titles : ['']).map((title) => {
    const p = baseParams(q, now);
    p.set('limit', String(perTitle));
    if (title) p.set('title', title);
    if (places.length) p.set('location', anyOf(places));
    if (setups) p.set('ai_work_arrangement', setups.join(','));
    return p;
  });
  if (worldwide && titles.length) {
    const p = baseParams(q, now);
    p.set('limit', String(forWorldwide));
    p.set('title', titles.join(' OR '));
    p.set('has_no_location', 'true');
    p.set('ai_work_arrangement', ARRANGEMENT.remote.join(','));
    out.push(p);
  }
  return out;
}

export interface FantasticJob {
  id: number;
  title: string;
  organization: string | null;
  organization_url?: string | null;
  url: string;
  date_posted?: string | null;
  source?: string | null;
  locations_derived?: string[] | null;
  location_type?: string | null;
  employment_type?: string[] | null;
  description_text?: string | null;
  ai_work_arrangement?: string | null;
  ai_employment_type?: string[] | null;
  ai_experience_level?: string | null;
  ai_salary_min_value?: number | null;
  ai_salary_max_value?: number | null;
  ai_salary_value?: number | null;
  ai_salary_currency?: string | null;
  ai_salary_unit_text?: string | null;
  ai_visa_sponsorship?: boolean | null;
}

function remoteOf(j: FantasticJob): JobRemoteType {
  const a = j.ai_work_arrangement ?? '';
  if (/remote/i.test(a) || j.location_type === 'TELECOMMUTE')
    return JobRemoteType.REMOTE;
  if (/hybrid/i.test(a)) return JobRemoteType.HYBRID;
  if (/on-?site/i.test(a)) return JobRemoteType.ONSITE;
  return JobRemoteType.UNKNOWN;
}

export function fromFantastic(j: FantasticJob): NormalizedJob | null {
  if (!j.id || !j.title || !j.url || !j.organization) return null;
  const posted = j.date_posted ? new Date(j.date_posted) : null;
  return {
    source: JobSource.FANTASTIC_JOBS,
    external_id: String(j.id),
    title: j.title.trim(),
    company: j.organization.trim(),
    company_url: j.organization_url ?? null,
    location: j.locations_derived?.[0] ?? null,
    remote_type: remoteOf(j),
    job_type: j.ai_employment_type?.[0] ?? j.employment_type?.[0] ?? null,
    easy_apply: false,
    url: j.url,
    apply_url: j.url,
    description: j.description_text ?? null,
    salary_min: j.ai_salary_min_value ?? j.ai_salary_value ?? null,
    salary_max: j.ai_salary_max_value ?? j.ai_salary_value ?? null,
    salary_currency: j.ai_salary_currency ?? null,
    posted_at: posted && !isNaN(posted.getTime()) ? posted : null,
    // What the comparison needs: which hiring system it came from, plus the AI fields.
    raw: {
      fantastic_id: j.id,
      ats: j.source ?? null,
      work_arrangement: j.ai_work_arrangement ?? null,
      experience_level: j.ai_experience_level ?? null,
      salary_unit: j.ai_salary_unit_text ?? null,
      visa_sponsorship: j.ai_visa_sponsorship ?? null,
    },
  };
}

async function getPage(params: URLSearchParams) {
  const res = await fetch(`${BASE}?${params}`, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${process.env.FANTASTIC_JOBS_API_KEY}`,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // Their 4xx bodies say what was wrong with the query: keep it in the run's error.
  if (!res.ok)
    throw new Error(
      `Fantastic.jobs HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  const rows = (await res.json()) as FantasticJob[];
  const credits = Number(
    res.headers.get('x-api-jobs-this-request') ?? rows.length,
  );
  return { rows, credits };
}

// The whole search: every request in parallel, one row per Fantastic id. One
// failing title costs that title only; every request failing fails the search.
export async function loadFantastic(
  q: DiscoveryQuery,
): Promise<NormalizedJob[]> {
  const requests = fantasticRequests(q, fantasticLimit());
  const settled = await Promise.allSettled(requests.map(getPage));
  const ok = settled.flatMap((r) =>
    r.status === 'fulfilled' ? [r.value] : [],
  );
  if (!ok.length) throw (settled[0] as PromiseRejectedResult).reason;
  // ponytail: recorded at cost 0, so seekers are not charged while we trial it;
  // credits used are in meta. Price it per credit if it stays.
  recordUsage({
    feature: 'discovery.fantastic',
    model: 'active-ats',
    cost_usd: 0,
    meta: {
      requests: requests.length,
      failed: settled.length - ok.length,
      results: ok.reduce((n, r) => n + r.rows.length, 0),
      credits: ok.reduce((n, r) => n + r.credits, 0),
    },
  });
  const seen = new Set<number>();
  return ok
    .flatMap((r) => r.rows)
    .filter((j) => !seen.has(j.id) && !!seen.add(j.id))
    .map(fromFantastic)
    .filter((j): j is NormalizedJob => !!j);
}
