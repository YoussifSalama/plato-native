import { JobRemoteType } from '@prisma/client';
import {
  fromAshby,
  fromGreenhouse,
  fromLever,
} from '../discovery/adapters/public-boards.adapter';
import type { NormalizedJob } from '../discovery/adapters/types';
import type { CatalogSource, SourceType } from './company-catalog';

// The company crawler's fetchers (FOLLOWING.md 2.2): one public jobs feed per source type, free, no scraping.
// Each returns the company's open jobs, or throws with the reason (the crawler counts failures per source).

const UA =
  'Mozilla/5.0 (compatible; PlatoJobs/1.0; +https://jobs.platohiring.com)';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': UA },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return (await res.json()) as T;
}

// --- SmartRecruiters ---------------------------------------------------------------------------------------------
interface SrPosting {
  id: string;
  name: string;
  releasedDate?: string;
  location?: {
    city?: string;
    country?: string;
    remote?: boolean;
    fullLocation?: string;
  };
  typeOfEmployment?: { label?: string };
  company?: { name?: string };
}
export function fromSmartRecruiters(
  p: SrPosting,
  slug: string,
  company: string,
): NormalizedJob {
  const where =
    p.location?.fullLocation ||
    [p.location?.city, p.location?.country?.toUpperCase()]
      .filter(Boolean)
      .join(', ') ||
    null;
  const url = `https://jobs.smartrecruiters.com/${encodeURIComponent(slug)}/${encodeURIComponent(p.id)}`;
  return {
    source: 'CAREER_SITE',
    external_id: `smartrecruiters:${slug}:${p.id}`,
    title: p.name,
    company: p.company?.name || company,
    location: where,
    remote_type: p.location?.remote
      ? JobRemoteType.REMOTE
      : JobRemoteType.UNKNOWN,
    job_type: p.typeOfEmployment?.label ?? null,
    easy_apply: false,
    url,
    apply_url: url,
    description: null,
    posted_at: p.releasedDate ? new Date(p.releasedDate) : null,
    raw: {
      via: 'company-crawler',
      ats: 'smartrecruiters',
      id: p.id,
    },
  };
}

// --- Workable (an account's own careers page feed) ---------------------------------------------------------------
interface WorkableAccountJob {
  title: string;
  shortcode: string;
  url?: string;
  application_url?: string;
  city?: string;
  state?: string;
  country?: string;
  telecommuting?: boolean;
  published_on?: string;
  employment_type?: string;
  description?: string;
}
export function fromWorkableAccount(
  j: WorkableAccountJob,
  slug: string,
  company: string,
): NormalizedJob {
  const url =
    j.url ||
    `https://apply.workable.com/${encodeURIComponent(slug)}/j/${j.shortcode}/`;
  return {
    source: 'WORKABLE',
    external_id: j.shortcode,
    title: j.title,
    company,
    location: [j.city, j.state, j.country].filter(Boolean).join(', ') || null,
    remote_type: j.telecommuting ? JobRemoteType.REMOTE : JobRemoteType.UNKNOWN,
    job_type: j.employment_type ?? null,
    easy_apply: false,
    url,
    apply_url: j.application_url || url,
    description: j.description ?? null,
    posted_at: j.published_on ? new Date(j.published_on) : null,
    raw: {
      via: 'company-crawler',
      ats: 'workable',
      shortcode: j.shortcode,
    },
  };
}

/** Source types the crawler reads today (free public feeds). Others wait for their fetcher (FOLLOWING.md phase 4-5). */
export const CRAWLABLE: SourceType[] = [
  'greenhouse',
  'lever',
  'ashby',
  'smartrecruiters',
  'workable',
];

/** One source's open jobs, named after the catalogue company so they match its followers. */
export async function fetchSource(
  s: Pick<CatalogSource, 'type' | 'ref'>,
  company: string,
): Promise<NormalizedJob[]> {
  const eu = s.ref.startsWith('eu:');
  const slug = s.ref.replace(/^eu:/, '');
  const enc = encodeURIComponent(slug);
  const named = (jobs: NormalizedJob[]) => jobs.map((j) => ({ ...j, company }));
  switch (s.type) {
    case 'greenhouse': {
      const r = await getJson<{
        jobs?: Parameters<typeof fromGreenhouse>[0][];
      }>(`https://boards-api.greenhouse.io/v1/boards/${enc}/jobs?content=true`);
      return named(
        (r.jobs ?? []).map((j) =>
          fromGreenhouse(j, { source: 'GREENHOUSE', slug, company }),
        ),
      );
    }
    case 'lever': {
      const r = await getJson<Parameters<typeof fromLever>[0][]>(
        `https://${eu ? 'api.eu.lever.co' : 'api.lever.co'}/v0/postings/${enc}?mode=json`,
      );
      return named(
        (Array.isArray(r) ? r : []).map((j) =>
          fromLever(j, { source: 'LEVER', slug, eu, company }),
        ),
      );
    }
    case 'ashby': {
      const r = await getJson<{
        jobs?: (Parameters<typeof fromAshby>[0] & { isListed?: boolean })[];
      }>(`https://api.ashbyhq.com/posting-api/job-board/${enc}`);
      return named(
        (r.jobs ?? [])
          .filter((j) => j.isListed !== false)
          .map((j) => fromAshby(j, { source: 'ASHBY', slug, company })),
      );
    }
    case 'smartrecruiters': {
      // ponytail: first 100 postings; page with offset when a followed company lists more
      const r = await getJson<{ content?: SrPosting[] }>(
        `https://api.smartrecruiters.com/v1/companies/${enc}/postings?limit=100`,
      );
      return (r.content ?? []).map((p) =>
        fromSmartRecruiters(p, slug, company),
      );
    }
    case 'workable': {
      const r = await getJson<{ jobs?: WorkableAccountJob[] }>(
        `https://apply.workable.com/api/v1/widget/accounts/${enc}?details=true`,
      );
      return (r.jobs ?? []).map((j) => fromWorkableAccount(j, slug, company));
    }
    default:
      return [];
  }
}

/** How long a company waits between visits, by tier. */
export const TIER_EVERY_MS: Record<string, number> = {
  hot: 6 * 3_600_000,
  warm: 24 * 3_600_000,
  cold: 7 * 86_400_000,
};

/** A source after a visit: ok resets failures; the 3rd failure in a row marks it broken (listed for us to fix). */
export function afterVisit(
  s: CatalogSource,
  outcome: { ok: true } | { ok: false; error: string },
  now = new Date(),
): CatalogSource {
  if (outcome.ok)
    return {
      ...s,
      status: 'active',
      verified: true,
      fails: 0,
      last_ok_at: now.toISOString(),
      last_error: null,
    };
  const fails = (s.fails ?? 0) + 1;
  return {
    ...s,
    fails,
    last_error: outcome.error.slice(0, 200),
    status: fails >= 3 ? 'broken' : s.status,
  };
}
