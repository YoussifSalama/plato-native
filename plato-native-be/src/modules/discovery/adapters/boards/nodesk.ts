import { JobRemoteType, JobSource, Prisma } from '@prisma/client';
import { defineBoard } from './types';
import { annual, normalizeJobType, plain, toDate } from './util';

// Apify actor: parseforge/nodesk-remote-jobs-scraper (limited permissions).
// Remote jobs; no public API, see SOURCES_LEGAL.md. It cannot filter by
// keyword, and posting dates only come with details ($0.021 per job): one
// capped run (15 jobs, about $0.32), then the adapter keeps the matching titles.
// https://apify.com/parseforge/nodesk-remote-jobs-scraper
interface NoDeskItem {
  title?: string;
  company?: string;
  url?: string;
  slug?: string;
  jobType?: string;
  remoteLocation?: string;
  applicantLocation?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
  publishedAt?: string;
  companyWebsite?: string | null;
  description?: string;
}

export const nodesk = defineBoard<NoDeskItem>({
  source: JobSource.NODESK,
  countries: [],
  anywhere: true,
  perTitle: false,
  actorId: 'parseforge~nodesk-remote-jobs-scraper',
  input: ({ limit }) => ({
    category: 'all',
    maxItems: Math.min(Math.max(limit, 10), 15),
    fetchDetails: true,
  }),
  map: (item) => {
    if (!item.title || !item.company || !item.url) return null;
    return {
      source: JobSource.NODESK,
      external_id: item.slug ?? item.url,
      title: item.title,
      company: item.company,
      company_url: item.companyWebsite ?? null,
      location:
        [item.remoteLocation, item.applicantLocation]
          .filter(Boolean)
          .join(', ') || 'Worldwide',
      remote_type: JobRemoteType.REMOTE,
      job_type: normalizeJobType(item.jobType),
      easy_apply: false,
      url: item.url,
      apply_url: item.url,
      description: plain(item.description),
      salary_min: annual(item.salaryMin, item.salaryPeriod),
      salary_max: annual(item.salaryMax, item.salaryPeriod),
      salary_currency: item.salaryMin ? (item.salaryCurrency ?? null) : null,
      posted_at: toDate(item.publishedAt),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
