import { Injectable, Logger } from '@nestjs/common';
import { JobRemoteType, JobSource } from '@prisma/client';
import { excludesCountry } from '../../apply/eligibility';
import { countryName, primaryPlaces } from '../countries';
import { titlePattern } from './local-index.adapter';
import { DiscoveryQuery, NormalizedJob } from './types';
import type { FeedsOutcome } from '../discovery-run.helpers';

// Free, official job feeds (no scraping). Each provider's terms were read in
// SOURCES_LEGAL.md: all ask for a visible link back to the original posting
// and a mention of the source, which the job card's footer provides, and none
// is auto-applied (the listing's own page is where you apply).
//   Remotive, Jobicy, Remote OK, Himalayas: open JSON feeds, no key.
//   Jooble, Adzuna: official APIs that need a key you request; off until set.

const UA = 'Plato/1.0 (+job search for candidates; contact via plato)';
const TIMEOUT_MS = 12_000;
const MAX_PER_FEED = 60;

// One fetch of a whole feed, kept long enough to respect each provider's
// stated limits (Remotive: ~4 a day; Jobicy: hourly; Himalayas: daily).
const HOUR = 3_600_000;
const cache = new Map<string, { at: number; data: Promise<unknown> }>();
function cached<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data as Promise<T>;
  const data = load();
  cache.set(key, { at: Date.now(), data });
  // A failed load must not be remembered.
  data.catch(() => cache.delete(key));
  return data;
}

async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { accept: 'application/json', 'user-agent': UA, ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

const strip = (html: string | null | undefined) =>
  (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const asDate = (v: unknown): Date | null => {
  if (v == null || v === '') return null;
  const d =
    typeof v === 'number'
      ? new Date(v < 1e12 ? v * 1000 : v)
      : new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
};
const num = (v: unknown): number | null => {
  const n =
    typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
// Pay is stored per year, so hourly and monthly figures are scaled to match.
const yearly = (n: number | null, period: unknown): number | null => {
  if (n == null) return null;
  const p = String(period ?? '').toLowerCase();
  return p.startsWith('hour')
    ? n * 2080
    : p.startsWith('month')
      ? n * 12
      : p.startsWith('week')
        ? n * 52
        : n;
};
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : [];

// --- per-feed mapping (pure, tested) ----------------------------------------

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category?: string;
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}
export function fromRemotive(j: RemotiveJob): NormalizedJob {
  // "50000-70000" or "$50k - $70k": first two numbers, as written.
  const nums = (j.salary ?? '').match(/\d[\d,.]*k?/gi) ?? [];
  const money = nums.map((n) =>
    num(/k$/i.test(n) ? Number(n.slice(0, -1)) * 1000 : n),
  );
  return {
    source: JobSource.REMOTIVE,
    external_id: String(j.id),
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location || 'Worldwide',
    remote_type: JobRemoteType.REMOTE,
    job_type: j.job_type || null,
    easy_apply: false,
    // Always the provider's own page: that is where you apply and what we credit.
    url: j.url,
    apply_url: j.url,
    description: strip(j.description),
    salary_min: money[0] ?? null,
    salary_max: money[1] ?? money[0] ?? null,
    salary_currency: money[0] ? 'USD' : null,
    posted_at: asDate(j.publication_date),
    raw: { category: j.category ?? null },
  };
}

interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobIndustry?: unknown;
  jobType?: unknown;
  jobGeo?: string;
  jobLevel?: string;
  jobDescription?: string;
  jobExcerpt?: string;
  pubDate?: string;
  salaryMin?: unknown;
  salaryMax?: unknown;
  salaryCurrency?: string;
  salaryPeriod?: string;
}
export function fromJobicy(j: JobicyJob): NormalizedJob {
  return {
    source: JobSource.JOBICY,
    external_id: String(j.id),
    title: j.jobTitle,
    company: j.companyName,
    location: j.jobGeo || 'Worldwide',
    remote_type: JobRemoteType.REMOTE,
    job_type: list(j.jobType)[0] ?? null,
    easy_apply: false,
    url: j.url,
    apply_url: j.url,
    description: strip(j.jobDescription || j.jobExcerpt),
    salary_min: yearly(num(j.salaryMin), j.salaryPeriod),
    salary_max: yearly(num(j.salaryMax), j.salaryPeriod),
    salary_currency: num(j.salaryMin) ? (j.salaryCurrency ?? null) : null,
    posted_at: asDate(j.pubDate),
    raw: { industry: list(j.jobIndustry), level: j.jobLevel ?? null },
  };
}

interface RemoteOkJob {
  id?: string | number;
  slug?: string;
  position?: string;
  company?: string;
  location?: string;
  tags?: string[];
  description?: string;
  date?: string;
  url?: string;
  apply_url?: string;
  salary_min?: number;
  salary_max?: number;
}
export function fromRemoteOk(j: RemoteOkJob): NormalizedJob | null {
  // The first array item is a legal notice, not a job.
  if (!j.id || !j.position || !j.company) return null;
  const url = j.url?.startsWith('http')
    ? j.url
    : `https://remoteok.com/remote-jobs/${j.slug ?? j.id}`;
  return {
    source: JobSource.REMOTEOK,
    external_id: String(j.id),
    title: j.position,
    company: j.company,
    location: j.location || 'Worldwide',
    remote_type: JobRemoteType.REMOTE,
    job_type: null,
    easy_apply: false,
    // Their terms: link back (followed) to the Remote OK listing, so that is the link we keep.
    url,
    apply_url: url,
    description: strip(j.description),
    salary_min: num(j.salary_min),
    salary_max: num(j.salary_max),
    salary_currency: num(j.salary_min) ? 'USD' : null,
    posted_at: asDate(j.date),
    raw: { tags: j.tags ?? [] },
  };
}

interface HimalayasJob {
  guid?: string;
  title?: string;
  companyName?: string;
  employmentType?: string;
  minSalary?: unknown;
  maxSalary?: unknown;
  salaryPeriod?: string;
  currency?: string;
  locationRestrictions?: unknown;
  categories?: unknown;
  description?: string;
  excerpt?: string;
  pubDate?: unknown;
  applicationLink?: string;
}
export function fromHimalayas(j: HimalayasJob): NormalizedJob | null {
  if (!j.title || !j.companyName || !(j.applicationLink || j.guid)) return null;
  const link = j.applicationLink || j.guid!;
  const where = list(j.locationRestrictions);
  return {
    source: JobSource.HIMALAYAS,
    external_id: j.guid || link,
    title: j.title,
    company: j.companyName,
    location: where.length ? where.join(', ') : 'Worldwide',
    remote_type: JobRemoteType.REMOTE,
    job_type: j.employmentType || null,
    easy_apply: false,
    url: link,
    apply_url: link,
    description: strip(j.description || j.excerpt),
    salary_min: yearly(num(j.minSalary), j.salaryPeriod),
    salary_max: yearly(num(j.maxSalary), j.salaryPeriod),
    salary_currency: num(j.minSalary) ? (j.currency ?? null) : null,
    posted_at: asDate(j.pubDate),
    raw: { categories: list(j.categories) },
  };
}

interface JoobleJob {
  id?: string | number;
  title?: string;
  location?: string;
  snippet?: string;
  salary?: string;
  type?: string;
  link?: string;
  company?: string;
  updated?: string;
}
export function fromJooble(j: JoobleJob): NormalizedJob | null {
  if (!j.link || !j.title || !j.company) return null;
  const text = `${j.title} ${j.snippet ?? ''}`;
  const money = (j.salary ?? '').match(/\d[\d,.]*/g)?.map(num) ?? [];
  return {
    source: JobSource.JOOBLE,
    external_id: String(j.id ?? j.link),
    title: j.title,
    company: j.company,
    location: j.location || null,
    remote_type: /remote|work from home|عن بعد/i.test(text)
      ? JobRemoteType.REMOTE
      : JobRemoteType.UNKNOWN,
    job_type: j.type || null,
    easy_apply: false,
    url: j.link,
    apply_url: j.link,
    description: strip(j.snippet),
    salary_min: money[0] ?? null,
    salary_max: money[1] ?? money[0] ?? null,
    salary_currency: /\$|usd/i.test(j.salary ?? '')
      ? 'USD'
      : /€|eur/i.test(j.salary ?? '')
        ? 'EUR'
        : null,
    posted_at: asDate(j.updated),
    raw: {},
  };
}

// Adzuna country codes it serves, and the currency each country's salaries use.
export const ADZUNA_COUNTRIES: Record<string, string> = {
  gb: 'GBP',
  us: 'USD',
  ca: 'CAD',
  au: 'AUD',
  nz: 'NZD',
  de: 'EUR',
  fr: 'EUR',
  at: 'EUR',
  be: 'EUR',
  nl: 'EUR',
  it: 'EUR',
  es: 'EUR',
  pl: 'PLN',
  in: 'INR',
  br: 'BRL',
  mx: 'MXN',
  sg: 'SGD',
  za: 'ZAR',
  ch: 'CHF',
};
interface AdzunaJob {
  id?: string | number;
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  created?: string;
  redirect_url?: string;
  description?: string;
  contract_time?: string;
}
export function fromAdzuna(j: AdzunaJob, cc: string): NormalizedJob | null {
  if (!j.redirect_url || !j.title) return null;
  return {
    source: JobSource.ADZUNA,
    external_id: String(j.id ?? j.redirect_url),
    title: j.title,
    company: j.company?.display_name ?? 'Unknown company',
    location: j.location?.display_name ?? null,
    remote_type: /remote/i.test(`${j.title} ${j.description ?? ''}`)
      ? JobRemoteType.REMOTE
      : JobRemoteType.UNKNOWN,
    job_type: j.contract_time || null,
    easy_apply: false,
    url: j.redirect_url,
    apply_url: j.redirect_url,
    description: strip(j.description),
    salary_min: num(j.salary_min),
    salary_max: num(j.salary_max),
    salary_currency: num(j.salary_min) ? (ADZUNA_COUNTRIES[cc] ?? null) : null,
    posted_at: asDate(j.created),
    raw: {},
  };
}

// --- matching a feed against one seeker's search -----------------------------

export function matchesQuery(
  job: NormalizedJob,
  query: DiscoveryQuery,
): boolean {
  const patterns = query.titles.map((t) => new RegExp(titlePattern(t), 'i'));
  if (patterns.length && !patterns.some((p) => p.test(job.title))) return false;
  // Remote feeds: drop postings that only take applicants from elsewhere.
  const names = query.countries.map((c) => countryName(c).toLowerCase());
  if (names.length && job.remote_type === JobRemoteType.REMOTE)
    return !excludesCountry(
      {
        title: job.title,
        description: `${job.location ?? ''}. ${job.description ?? ''}`,
      },
      names,
    );
  return true;
}

type Feed = {
  source: JobSource;
  enabled: () => boolean;
  // Whether this seeker's search can use the feed at all.
  relevant: (q: DiscoveryQuery) => boolean;
  load: (q: DiscoveryQuery) => Promise<NormalizedJob[]>;
};

const wantsRemote = (q: DiscoveryQuery) =>
  q.remoteTypes.includes('remote') || q.remoteTypes.includes('any');

// ponytail: keys read from env here (adapters have no ConfigService today).
const keyed =
  (...vars: string[]) =>
  () =>
    vars.every((v) => !!process.env[v]);

const FEEDS: Feed[] = [
  {
    source: JobSource.REMOTIVE,
    enabled: () => true,
    relevant: wantsRemote,
    load: async () => {
      const r = await cached('remotive', 6 * HOUR, () =>
        getJson<{ jobs?: RemotiveJob[] }>(
          'https://remotive.com/api/remote-jobs?limit=500',
        ),
      );
      return (r.jobs ?? []).map(fromRemotive);
    },
  },
  {
    source: JobSource.JOBICY,
    enabled: () => true,
    relevant: wantsRemote,
    load: async () => {
      const r = await cached('jobicy', HOUR, () =>
        getJson<{ jobs?: JobicyJob[] }>(
          'https://jobicy.com/api/v2/remote-jobs?count=200',
        ),
      );
      return (r.jobs ?? []).map(fromJobicy);
    },
  },
  {
    source: JobSource.REMOTEOK,
    enabled: () => true,
    relevant: wantsRemote,
    load: async () => {
      const r = await cached('remoteok', HOUR, () =>
        getJson<RemoteOkJob[]>('https://remoteok.com/api'),
      );
      return (Array.isArray(r) ? r : [])
        .map(fromRemoteOk)
        .filter((j): j is NormalizedJob => !!j);
    },
  },
  {
    source: JobSource.HIMALAYAS,
    enabled: () => true,
    relevant: wantsRemote,
    load: async () => {
      // Their feed is refreshed daily; walk it by cursor, 20 a page.
      const jobs = await cached('himalayas', 24 * HOUR, async () => {
        const out: HimalayasJob[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < 10; page++) {
          const r = await getJson<{
            jobs?: HimalayasJob[];
            nextCursor?: string;
          }>(
            `https://himalayas.app/jobs/api?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
          );
          out.push(...(r.jobs ?? []));
          cursor = r.nextCursor;
          if (!cursor) break;
        }
        return out;
      });
      return jobs.map(fromHimalayas).filter((j): j is NormalizedJob => !!j);
    },
  },
  {
    // Official API; the key comes from Jooble on request. Covers the Gulf and Egypt, where the boards above do not.
    source: JobSource.JOOBLE,
    enabled: keyed('JOOBLE_API_KEY'),
    relevant: (q) => q.countries.length > 0 || q.locations.length > 0,
    load: async (q) => {
      const key = process.env.JOOBLE_API_KEY!;
      const places = primaryPlaces(q, 3);
      const calls = places.flatMap((place) =>
        q.titles.slice(0, 2).map((keywords) => ({ keywords, location: place })),
      );
      const rows = await Promise.all(
        calls.map((body) =>
          getJson<{ jobs?: JoobleJob[] }>(`https://jooble.org/api/${key}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...body, page: 1 }),
          }).then((r) => r.jobs ?? []),
        ),
      );
      return rows
        .flat()
        .map(fromJooble)
        .filter((j): j is NormalizedJob => !!j);
    },
  },
  {
    source: JobSource.ADZUNA,
    enabled: keyed('ADZUNA_APP_ID', 'ADZUNA_APP_KEY'),
    relevant: (q) =>
      q.countries.some((c) => c.toLowerCase() in ADZUNA_COUNTRIES),
    load: async (q) => {
      const ccs = q.countries
        .map((c) => c.toLowerCase())
        .filter((c) => c in ADZUNA_COUNTRIES);
      const calls = ccs.flatMap((cc) =>
        q.titles.slice(0, 2).map((what) => ({ cc, what })),
      );
      const rows = await Promise.all(
        calls.map(({ cc, what }) =>
          getJson<{ results?: AdzunaJob[] }>(
            `https://api.adzuna.com/v1/api/jobs/${cc}/search/1?app_id=${process.env.ADZUNA_APP_ID}&app_key=${process.env.ADZUNA_APP_KEY}&results_per_page=50&max_days_old=30&what=${encodeURIComponent(what)}`,
          ).then((r) => (r.results ?? []).map((j) => fromAdzuna(j, cc))),
        ),
      );
      return rows.flat().filter((j): j is NormalizedJob => !!j);
    },
  },
];

@Injectable()
export class OpenFeedsAdapter {
  private readonly logger = new Logger(OpenFeedsAdapter.name);

  // The feeds that will run for this search (their progress cards).
  sourcesFor(query: DiscoveryQuery): JobSource[] {
    return FEEDS.filter((f) => f.enabled() && f.relevant(query)).map(
      (f) => f.source,
    );
  }

  async discoverDetailed(query: DiscoveryQuery): Promise<FeedsOutcome> {
    const active = FEEDS.filter((f) => f.enabled() && f.relevant(query));
    const settled = await Promise.allSettled(active.map((f) => f.load(query)));
    const jobs: NormalizedJob[] = [];
    const failed: FeedsOutcome['failed'] = {};
    settled.forEach((r, i) => {
      const feed = active[i];
      if (r.status === 'rejected') {
        failed[feed.source] =
          r.reason instanceof Error ? r.reason.message : 'Feed failed';
        this.logger.warn(`${feed.source} failed: ${String(r.reason)}`);
        return;
      }
      jobs.push(
        ...r.value
          .filter((j) => matchesQuery(j, query))
          .sort(
            (a, b) =>
              (b.posted_at?.getTime() ?? 0) - (a.posted_at?.getTime() ?? 0),
          )
          .slice(0, MAX_PER_FEED),
      );
    });
    return { jobs, failed };
  }
}
