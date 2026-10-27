import { Injectable, Logger } from '@nestjs/common';
import { JobRemoteType, JobSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isFresh } from '../discovery-run.helpers';
import { inCountries, searchPlaces } from '../countries';
import { titlePattern } from './local-index.adapter';
import { DiscoveryAdapter, DiscoveryQuery, NormalizedJob } from './types';

// Jobs straight from the ATSs' own public endpoints: free, no Apify.
//   - Workable: a public search across every company (keyword + location).
//   - Greenhouse, Lever, Ashby: public per-company job feeds only; there is
//     no cross-company search. We poll the boards we already know about
//     (every job ever stored carries its board in its URL), so the set grows
//     with every search. New boards are found by the Apify actor.

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TIMEOUT_MS = 10_000;
const MAX_BOARDS = 60;
const CONCURRENCY = 8;
const WORKABLE_TITLES = 4;
const WORKABLE_PAGES = 2; // 20 jobs per page
const MAX_RESULTS = 200;

type BoardSource = 'LEVER' | 'GREENHOUSE' | 'ASHBY';
export interface Board {
  source: BoardSource;
  slug: string;
  // Lever runs a separate EU instance.
  eu?: boolean;
  company: string;
}

// Board slug from a job URL we already stored.
export function boardFromUrl(
  source: JobSource,
  url: string,
): Omit<Board, 'company'> | null {
  if (source === 'LEVER') {
    const m = /jobs\.(eu\.)?lever\.co\/([^/?#]+)/i.exec(url);
    return m ? { source, slug: m[2], eu: !!m[1] } : null;
  }
  if (source === 'GREENHOUSE') {
    const m =
      /greenhouse\.io\/embed\/job_app\?for=([^&#]+)/i.exec(url) ??
      /(?:boards|job-boards)\.greenhouse\.io\/([^/?#]+)/i.exec(url);
    return m && m[1] !== 'embed' ? { source, slug: m[1] } : null;
  }
  if (source === 'ASHBY') {
    const m = /jobs\.ashbyhq\.com\/([^/?#]+)/i.exec(url);
    return m ? { source, slug: decodeURIComponent(m[1]) } : null;
  }
  return null;
}

const text = (html: string | null | undefined) =>
  (html ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const remoteOf = (hint: string | null | undefined): JobRemoteType => {
  const h = (hint ?? '').toLowerCase();
  if (/remote/.test(h)) return JobRemoteType.REMOTE;
  if (/hybrid/.test(h)) return JobRemoteType.HYBRID;
  if (/on-?site|office/.test(h)) return JobRemoteType.ONSITE;
  return JobRemoteType.UNKNOWN;
};

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function inBatches<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

// --- per-ATS mapping ---------------------------------------------------

interface WorkableSearchJob {
  id: string;
  title: string;
  url: string;
  description?: string;
  employmentType?: string;
  workplace?: string;
  locations?: string[];
  location?: { city?: string; subregion?: string; countryName?: string };
  created?: string;
  company?: { title?: string; website?: string };
}

export function fromWorkable(j: WorkableSearchJob): NormalizedJob {
  const loc = j.location
    ? [j.location.city, j.location.subregion, j.location.countryName]
        .filter(Boolean)
        .join(', ')
    : (j.locations?.[0] ?? null);
  return {
    source: JobSource.WORKABLE,
    // Short id from /view/{id}/: the same key the apply adapter uses.
    external_id: /\/view\/([^/?#]+)/.exec(j.url)?.[1] ?? j.id,
    title: j.title,
    company: j.company?.title ?? 'Unknown company',
    company_url: j.company?.website ?? null,
    location: loc || null,
    remote_type: remoteOf(j.workplace),
    job_type: j.employmentType || null,
    easy_apply: true,
    url: j.url,
    apply_url: j.url,
    description: text(j.description),
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    posted_at: j.created ? new Date(j.created) : null,
    raw: { via: 'workable-search', id: j.id },
  };
}

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  updated_at?: string;
  first_published?: string;
  content?: string;
  company_name?: string;
}

export function fromGreenhouse(j: GreenhouseJob, board: Board): NormalizedJob {
  const location = j.location?.name ?? null;
  return {
    source: JobSource.GREENHOUSE,
    external_id: String(j.id),
    title: j.title,
    company: j.company_name ?? board.company,
    company_url: null,
    location,
    remote_type: remoteOf(location),
    job_type: null,
    easy_apply: true,
    url: j.absolute_url,
    // The embeddable form works for every Greenhouse board, including
    // companies that show jobs on their own careers domain.
    apply_url: `https://job-boards.greenhouse.io/embed/job_app?for=${board.slug}&token=${j.id}`,
    description: text(j.content),
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    posted_at: new Date(j.first_published ?? j.updated_at ?? Date.now()),
    raw: {
      via: 'greenhouse-board',
      board: board.slug,
    },
  };
}

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: { location?: string; commitment?: string; team?: string };
  descriptionPlain?: string;
  additionalPlain?: string;
  lists?: { text?: string; content?: string }[];
}

export function fromLever(j: LeverPosting, board: Board): NormalizedJob {
  const lists = (j.lists ?? [])
    .map((l) => `${l.text ?? ''}: ${text(l.content)}`)
    .join(' ');
  return {
    source: JobSource.LEVER,
    external_id: j.id,
    title: j.text,
    company: board.company,
    company_url: null,
    location: j.categories?.location ?? null,
    remote_type: remoteOf(j.workplaceType ?? j.categories?.location),
    job_type: j.categories?.commitment ?? null,
    easy_apply: true,
    url: j.hostedUrl,
    apply_url: j.applyUrl ?? `${j.hostedUrl}/apply`,
    description: [j.descriptionPlain, lists, j.additionalPlain]
      .filter(Boolean)
      .join('\n'),
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    posted_at: j.createdAt ? new Date(j.createdAt) : null,
    raw: { via: 'lever-board', board: board.slug },
  };
}

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  isRemote?: boolean;
  workplaceType?: string;
  employmentType?: string;
  publishedAt?: string;
  jobUrl: string;
  applyUrl?: string;
  descriptionPlain?: string;
  isListed?: boolean;
}

export function fromAshby(j: AshbyJob, board: Board): NormalizedJob {
  return {
    source: JobSource.ASHBY,
    external_id: j.id,
    title: j.title,
    company: board.company,
    company_url: null,
    location: j.location ?? null,
    remote_type: j.isRemote
      ? JobRemoteType.REMOTE
      : remoteOf(j.workplaceType ?? j.location),
    job_type: j.employmentType ?? null,
    easy_apply: true,
    url: j.jobUrl,
    apply_url: j.applyUrl ?? j.jobUrl,
    description: j.descriptionPlain ?? null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    posted_at: j.publishedAt ? new Date(j.publishedAt) : null,
    raw: { via: 'ashby-board', board: board.slug },
  };
}

// Same rules as the other adapters: a searched title, somewhere the seeker
// can work, posted recently.
export function matchesQuery(job: NormalizedJob, query: DiscoveryQuery) {
  if (!isFresh(job)) return false;
  const titled = query.titles.some((t) =>
    new RegExp(titlePattern(t), 'i').test(job.title),
  );
  if (!titled) return false;
  if (
    job.remote_type === JobRemoteType.REMOTE &&
    query.remoteTypes.some((r) => r === 'remote' || r === 'any')
  )
    return true;
  // Country is a hard control, relocating or not.
  if (!inCountries(job.location, query.countries)) return false;
  if (!query.locations.length || query.willingToRelocate) return true;
  const where = (job.location ?? '').toLowerCase();
  return query.locations.some((l) =>
    l
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
      .some((part) => where.includes(part)),
  );
}

@Injectable()
export class PublicBoardsAdapter implements DiscoveryAdapter {
  private readonly logger = new Logger(PublicBoardsAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  async discover(query: DiscoveryQuery): Promise<NormalizedJob[]> {
    if (!query.titles.length) return [];
    const [workable, boards] = await Promise.all([
      this.searchWorkable(query),
      this.pollBoards(query),
    ]);
    const seen = new Set<string>();
    return [...workable, ...boards]
      .filter((j) => {
        const key = `${j.source}|${j.url}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_RESULTS);
  }

  private async searchWorkable(query: DiscoveryQuery) {
    const titles = query.titles.slice(0, WORKABLE_TITLES);
    const near = searchPlaces(query).slice(0, 2);
    const places = near.length ? near : [''];
    const found: NormalizedJob[] = [];
    await inBatches(
      titles.flatMap((t) => places.map((p) => [t, p] as const)),
      CONCURRENCY,
      async ([title, place]) => {
        let token: string | undefined;
        for (let page = 0; page < WORKABLE_PAGES; page++) {
          const params = new URLSearchParams({ query: title });
          if (place) params.set('location', place);
          if (token) params.set('pageToken', token);
          const res = await getJson<{
            jobs?: WorkableSearchJob[];
            nextPageToken?: string;
          }>(`https://jobs.workable.com/api/v1/jobs?${params.toString()}`);
          for (const j of res?.jobs ?? []) found.push(fromWorkable(j));
          token = res?.nextPageToken;
          if (!token) break;
        }
      },
    );
    return found.filter((j) => matchesQuery(j, query));
  }

  // Boards we know, most-used first.
  async knownBoards(limit = MAX_BOARDS): Promise<Board[]> {
    const rows = await this.prisma.job.findMany({
      where: { source: { in: ['LEVER', 'GREENHOUSE', 'ASHBY'] } },
      select: { source: true, url: true, apply_url: true, company: true },
      orderBy: { updated_at: 'desc' },
      take: 5000,
    });
    const boards = new Map<string, Board & { n: number }>();
    for (const r of rows) {
      const b =
        boardFromUrl(r.source, r.apply_url ?? '') ??
        boardFromUrl(r.source, r.url);
      if (!b) continue;
      const key = `${b.source}|${b.slug.toLowerCase()}`;
      const hit = boards.get(key);
      if (hit) hit.n++;
      else
        boards.set(key, {
          ...b,
          company: r.company,
          n: 1,
        });
    }
    return [...boards.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, limit)
      .map((b) => ({
        source: b.source,
        slug: b.slug,
        eu: b.eu,
        company: b.company,
      }));
  }

  private async pollBoards(query: DiscoveryQuery) {
    const boards = await this.knownBoards();
    const batches = await inBatches(boards, CONCURRENCY, (b) =>
      this.fetchBoard(b),
    );
    const jobs = batches.flat();
    this.logger.log(
      `Public boards: polled ${boards.length}, ${jobs.length} open jobs`,
    );
    return jobs.filter((j) => matchesQuery(j, query));
  }

  async fetchBoard(b: Board): Promise<NormalizedJob[]> {
    const slug = encodeURIComponent(b.slug);
    if (b.source === 'GREENHOUSE') {
      const res = await getJson<{ jobs?: GreenhouseJob[] }>(
        `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
      );
      return (res?.jobs ?? []).map((j) => fromGreenhouse(j, b));
    }
    if (b.source === 'LEVER') {
      const host = b.eu ? 'api.eu.lever.co' : 'api.lever.co';
      const res = await getJson<LeverPosting[]>(
        `https://${host}/v0/postings/${slug}?mode=json`,
      );
      return (Array.isArray(res) ? res : []).map((j) => fromLever(j, b));
    }
    const res = await getJson<{ jobs?: AshbyJob[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
    );
    return (res?.jobs ?? [])
      .filter((j) => j.isListed !== false)
      .map((j) => fromAshby(j, b));
  }
}
