import { JobSource, Prisma } from '@prisma/client';
import { defineBoard } from './types';
import { MAX_POSTING_AGE_DAYS } from '../../discovery-run.helpers';
import {
  annual,
  idFromUrl,
  normalizeJobType,
  remoteTypeOf,
  toDate,
} from './util';

// Apify actor: automation-lab/indeed-scraper — Indeed CA + US, flat items
// with parsed salary. https://apify.com/automation-lab/indeed-scraper
// `datePosted` only offers 1/3/7/14 days: take the smallest that covers our
// cap (14 is the widest; the run's freshness filter does the rest).
const DATE_POSTED =
  MAX_POSTING_AGE_DAYS <= 1
    ? '1'
    : MAX_POSTING_AGE_DAYS <= 3
      ? '3'
      : MAX_POSTING_AGE_DAYS <= 7
        ? '7'
        : '14';

interface IndeedItem {
  title?: string;
  company?: string;
  companyUrl?: string;
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  jobType?: string[];
  datePosted?: string;
  description?: string;
  jobUrl?: string;
  isRemote?: boolean;
}

export const indeed = defineBoard<IndeedItem>({
  source: JobSource.INDEED,
  countries: ['CA', 'US'],
  actorId: 'automation-lab~indeed-scraper',
  input: ({ title, location, country, limit }) => ({
    query: title,
    location,
    country,
    maxItems: limit,
    datePosted: DATE_POSTED,
    includeDescription: true,
  }),
  map: (item) => {
    if (!item.title || !item.company || !item.jobUrl) return null;
    return {
      source: JobSource.INDEED,
      // No id field in the output: Indeed's own `jk` key is in the URL.
      external_id: idFromUrl(item.jobUrl, 'jk'),
      title: item.title,
      company: item.company,
      company_url: item.companyUrl ?? null,
      location: item.location ?? null,
      remote_type: remoteTypeOf(item.isRemote, item.title, item.location ?? ''),
      job_type: normalizeJobType(item.jobType?.[0]),
      easy_apply: false,
      url: item.jobUrl,
      apply_url: item.jobUrl,
      description: item.description ?? null,
      salary_min: annual(item.salaryMin, item.salaryPeriod),
      salary_max: annual(item.salaryMax, item.salaryPeriod),
      salary_currency: item.salaryCurrency ?? null,
      posted_at: toDate(item.datePosted),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
