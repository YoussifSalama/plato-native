import { JobRemoteType, JobSource, Prisma } from '@prisma/client';
import { defineBoard } from './types';
import { annual, normalizeJobType, plain, toDate } from './util';

// Apify actor: rl1987/dynamitejobs-scraper (limited permissions; the other
// Dynamite actor asks for full account access and was not used). Remote jobs;
// no public API, see SOURCES_LEGAL.md. About $0.001 per job.
// https://apify.com/rl1987/dynamitejobs-scraper
interface DynamiteItem {
  url?: string;
  objectId?: string;
  title?: string;
  companyName?: string;
  companyUrl?: string;
  locationSlugs?: string[];
  jobTypeName?: string;
  salaryFrom?: number | null;
  salaryTo?: number | null;
  salaryCurrency?: string;
  salaryPeriod?: string;
  description?: string;
  descriptionHtml?: string;
  publishedAt?: string;
}

export const dynamitejobs = defineBoard<DynamiteItem>({
  source: JobSource.DYNAMITEJOBS,
  countries: [],
  anywhere: true,
  actorId: 'rl1987~dynamitejobs-scraper',
  input: ({ title, limit }) => ({ search: title, maxItems: limit }),
  map: (item) => {
    if (!item.title || !item.companyName || !item.url) return null;
    return {
      source: JobSource.DYNAMITEJOBS,
      external_id: item.objectId ?? item.url,
      title: item.title,
      company: item.companyName,
      company_url: item.companyUrl ?? null,
      location: item.locationSlugs?.length
        ? item.locationSlugs.join(', ')
        : 'Worldwide',
      remote_type: JobRemoteType.REMOTE,
      job_type: normalizeJobType(item.jobTypeName),
      easy_apply: false,
      url: item.url,
      apply_url: item.url,
      description: item.description ?? plain(item.descriptionHtml),
      salary_min: annual(item.salaryFrom, item.salaryPeriod),
      salary_max: annual(item.salaryTo, item.salaryPeriod),
      salary_currency: item.salaryFrom ? (item.salaryCurrency ?? null) : null,
      posted_at: toDate(item.publishedAt),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
