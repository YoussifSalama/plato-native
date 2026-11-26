import { Injectable } from '@nestjs/common';
import { JobRemoteType, JobSource, Prisma } from '@prisma/client';
import { ApifyService } from '../apify.service';
import { DiscoveryAdapter, DiscoveryQuery, NormalizedJob } from './types';
import { MAX_POSTING_AGE_DAYS } from '../discovery-run.helpers';
import { marketScale, primaryPlaces } from '../countries';

// Apify actor: curious_coder/linkedin-jobs-scraper — replays LinkedIn's own
// job-search URL. Every job, Easy Apply or not: large employers mostly post
// "Apply on company website", and an Easy Apply filter hid them all.
// https://apify.com/curious_coder/linkedin-jobs-scraper
const ACTOR_ID = 'curious_coder~linkedin-jobs-scraper';
// Titles are planned from the seeker's background (up to 8). Runs are
// parallel and the per-title limit shrinks with the budget, so more titles
// widen coverage without multiplying cost. Most relevant titles come first.
const MAX_TITLES = 6;
// One run per title × country; cap the total so a two-country search
// doesn't double the bill.
const MAX_RUNS = 8;
// Up to four countries, each its own run; the run cap grows with them (marketScale) so titles are not cut to fit.
const MAX_PLACES = 4;
// Measured: 100 jobs + company scraping ≈ 110s; 40 jobs without ≈ 28s.
// One actor run per title, in parallel, keeps wall time near the single-run cost.
const LIMIT_PER_URL = 40;
// LinkedIn only offers coarse windows; take the smallest one that covers the cap.
const LINKEDIN_WINDOW =
  MAX_POSTING_AGE_DAYS <= 1
    ? 'past24Hours'
    : MAX_POSTING_AGE_DAYS <= 7
      ? 'pastWeek'
      : 'pastMonth';

export interface LinkedInJobItem {
  id: number | string;
  link: string;
  title: string;
  companyName: string;
  companyLinkedinUrl?: string;
  location?: string;
  workplaceTypes?: string[];
  employmentType?: string;
  applyMethod?: string;
  applyUrl?: string;
  descriptionText?: string;
  salary?: string;
  postedAt?: string;
  postedAtTimestamp?: number;
  // The search URL this item came from (echoed by the actor).
  inputUrl?: string;
}

// LinkedIn's "workplace type" filter codes.
const WORKPLACE: Record<string, string> = {
  onsite: '1',
  remote: '2',
  hybrid: '3',
};

function toRemoteType(
  workplaceTypes: string[] | undefined,
  title: string,
  inputUrl?: string,
): JobRemoteType {
  const hints = [...(workplaceTypes ?? []), title];
  if (hints.some((t) => /remote/i.test(t))) return JobRemoteType.REMOTE;
  if (hints.some((t) => /hybrid/i.test(t))) return JobRemoteType.HYBRID;
  if (workplaceTypes?.some((t) => /on-?site/i.test(t)))
    return JobRemoteType.ONSITE;
  // The actor often omits workplaceTypes; a search filtered to one type
  // tells us what every result is.
  const wt = URL.canParse(inputUrl ?? '')
    ? new URL(inputUrl!).searchParams.get('f_WT')
    : null;
  if (wt === WORKPLACE.remote) return JobRemoteType.REMOTE;
  if (wt === WORKPLACE.hybrid) return JobRemoteType.HYBRID;
  if (wt === WORKPLACE.onsite) return JobRemoteType.ONSITE;
  return JobRemoteType.UNKNOWN;
}

// Easy Apply happens on LinkedIn itself. LinkedIn names the methods
// SimpleOnsiteApply / ComplexOnsiteApply (Easy Apply) and OffsiteApply (the
// company's site); without a method, an apply link off LinkedIn means offsite.
export function isEasyApply(
  item: Pick<LinkedInJobItem, 'applyMethod' | 'applyUrl'>,
): boolean {
  if (item.applyMethod) return !/offsite|external/i.test(item.applyMethod);
  if (!item.applyUrl) return false;
  try {
    return /(^|\.)linkedin\.com$/i.test(new URL(item.applyUrl).hostname);
  } catch {
    return false;
  }
}

function buildSearchUrl(
  title: string,
  query: DiscoveryQuery,
  location?: string,
): string {
  const params = new URLSearchParams({ keywords: title });
  if (location) params.set('location', location);
  // Work mode applies with or without a place ("remote jobs in Saudi Arabia").
  const modes = query.remoteTypes.includes('any')
    ? []
    : query.remoteTypes.map((t) => WORKPLACE[t]).filter(Boolean);
  if (!location && query.remoteAnywhere)
    params.set('f_WT', WORKPLACE.remote); // the place-free run is remote only
  else if (modes.length && modes.length < 3)
    params.set('f_WT', modes.join(','));
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

@Injectable()
export class LinkedInAdapter implements DiscoveryAdapter {
  constructor(private readonly apify: ApifyService) {}

  /**
   * `hooks` (optional) report progress as it happens: the runs planned (one per title and place), then each run's
   * count the moment it finishes. The public guest search shows them live.
   */
  async discover(
    query: DiscoveryQuery,
    hooks?: {
      onPlan?: (runs: { title: string; place: string | null }[]) => void;
      onRunDone?: (index: number, count: number) => void;
    },
  ): Promise<NormalizedJob[]> {
    if (!query.titles.length) return [];

    // One place per country the seeker works in; none = no location filter.
    const places: (string | undefined)[] = primaryPlaces(query, MAX_PLACES);
    // Remote abroad (New search): one run with no place, remote only, finds companies anywhere; the gate keeps the
    // ones that hire from where the seeker lives.
    if (
      !places.length ||
      (query.remoteAnywhere && query.remoteTypes.includes('remote'))
    )
      places.push(undefined);
    const maxRuns = Math.round(MAX_RUNS * marketScale(query));
    const titles = query.titles.slice(
      0,
      Math.min(MAX_TITLES, Math.max(1, Math.floor(maxRuns / places.length))),
    );
    // A third of the remaining budget comes from LinkedIn (boards and the ATS actor take the others), split across the runs.
    const perUrl =
      query.budget === undefined
        ? LIMIT_PER_URL
        : Math.min(
            LIMIT_PER_URL,
            Math.max(
              10,
              Math.ceil(query.budget / 3 / (titles.length * places.length)),
            ),
          );
    if (query.budget === 0) return [];

    const plan = titles.flatMap((title) =>
      places.map((place) => ({ title, place })),
    );
    hooks?.onPlan?.(
      plan.map((r) => ({ title: r.title, place: r.place ?? null })),
    );
    const runs = plan.map(({ title, place }, i) =>
      this.apify
        .runActor<LinkedInJobItem>(ACTOR_ID, {
          urls: [buildSearchUrl(title, query, place)],
          limitPerSource: perUrl,
          datePosted: LINKEDIN_WINDOW,
          scrapeCompany: false,
          autoConvertToAiSearch: true,
        })
        .then((items) => {
          hooks?.onRunDone?.(i, items.length);
          return items;
        }),
    );
    const items = (await Promise.all(runs)).flat();

    const seen = new Set<string>();
    return items
      .filter((item) => {
        const key = String(item.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => this.normalize(item));
  }

  private normalize(item: LinkedInJobItem): NormalizedJob {
    return {
      source: JobSource.LINKEDIN,
      external_id: String(item.id),
      title: item.title,
      company: item.companyName,
      company_url: item.companyLinkedinUrl ?? null,
      location: item.location ?? null,
      remote_type: toRemoteType(item.workplaceTypes, item.title, item.inputUrl),
      job_type: item.employmentType ?? null,
      easy_apply: isEasyApply(item),
      url: item.link,
      apply_url: item.applyUrl ?? item.link,
      description: item.descriptionText ?? null,
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      posted_at: item.postedAt
        ? new Date(item.postedAt)
        : item.postedAtTimestamp
          ? new Date(item.postedAtTimestamp)
          : null,
      raw: item as unknown as Prisma.InputJsonValue,
    };
  }
}
