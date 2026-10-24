import { JobRemoteType, JobSource, Prisma } from '@prisma/client';
import { defineBoard } from './types';
import { normalizeJobType, plain, toDate } from './util';

// Apify actor: parseforge/arc-dev-jobs-scraper (limited permissions). Remote
// engineering jobs; no public API, see SOURCES_LEGAL.md. PRICEY: $0.025 per job,
// so each run is capped at 10 jobs (about $0.25).
// https://apify.com/parseforge/arc-dev-jobs-scraper
interface ArcItem {
  randomKey?: string;
  title?: string;
  url?: string;
  companyName?: string;
  companyOfficialSiteUrl?: string | null;
  descriptionText?: string;
  description?: string;
  jobType?: string;
  requiredCountries?: string[];
  requiredLocations?: string[];
  minAnnualSalary?: number | null;
  maxAnnualSalary?: number | null;
  postedAt?: string;
  createdAt?: string;
  publishedAt?: string;
}

const MAX_JOBS = 10;

export const arc = defineBoard<ArcItem>({
  source: JobSource.ARC,
  countries: [],
  anywhere: true,
  actorId: 'parseforge~arc-dev-jobs-scraper',
  input: ({ title, limit }) => ({
    keyword: title,
    maxItems: Math.min(limit, MAX_JOBS),
  }),
  map: (item) => {
    if (!item.title || !item.companyName || !item.url) return null;
    const where = [
      ...(item.requiredCountries ?? []),
      ...(item.requiredLocations ?? []),
    ];
    return {
      source: JobSource.ARC,
      external_id: item.randomKey ?? item.url,
      title: item.title,
      company: item.companyName,
      company_url: item.companyOfficialSiteUrl ?? null,
      location: where.length ? where.join(', ') : 'Worldwide',
      remote_type: JobRemoteType.REMOTE,
      job_type: normalizeJobType(item.jobType),
      easy_apply: false,
      // Arc's own listing: the posting's applyUrl can point at LinkedIn, so it is not used.
      url: item.url,
      apply_url: item.url,
      description: item.descriptionText ?? plain(item.description),
      salary_min: item.minAnnualSalary || null,
      salary_max: item.maxAnnualSalary || null,
      salary_currency: item.minAnnualSalary ? 'USD' : null,
      posted_at: toDate(item.postedAt ?? item.publishedAt ?? item.createdAt),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
