import { JobSource, Prisma } from '@prisma/client';
import { MAX_POSTING_AGE_DAYS } from '../../discovery-run.helpers';
import { defineBoard } from './types';
import { annual, idFromUrl, remoteTypeOf, toDate } from './util';

// Apify actor: automation-lab/glassdoor-jobs-scraper. No country input:
// the market comes from the location string. `datePosted` is 1/3/7/14/30.
// https://apify.com/automation-lab/glassdoor-jobs-scraper
const DATE_POSTED =
  MAX_POSTING_AGE_DAYS <= 1
    ? '1'
    : MAX_POSTING_AGE_DAYS <= 3
      ? '3'
      : MAX_POSTING_AGE_DAYS <= 7
        ? '7'
        : MAX_POSTING_AGE_DAYS <= 14
          ? '14'
          : '30';

interface GlassdoorItem {
  title?: string;
  company?: string;
  jobId?: string | number;
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  isRemote?: boolean;
  postedDate?: string;
  jobUrl?: string;
}

export const glassdoor = defineBoard<GlassdoorItem>({
  source: JobSource.GLASSDOOR,
  countries: ['CA', 'US'],
  actorId: 'automation-lab~glassdoor-jobs-scraper',
  input: ({ title, location, limit, query }) => ({
    query: title,
    location,
    maxResults: limit,
    datePosted: DATE_POSTED,
    remote:
      query.remoteTypes.length > 0 &&
      query.remoteTypes.every((t) => t === 'remote')
        ? 'true'
        : '',
  }),
  map: (item) => {
    if (!item.title || !item.company || !item.jobUrl) return null;
    return {
      source: JobSource.GLASSDOOR,
      external_id: item.jobId ? String(item.jobId) : idFromUrl(item.jobUrl),
      title: item.title,
      company: item.company,
      location: item.location ?? null,
      remote_type: remoteTypeOf(item.isRemote, item.title, item.location ?? ''),
      easy_apply: false,
      url: item.jobUrl,
      apply_url: item.jobUrl,
      salary_min: annual(item.salaryMin),
      salary_max: annual(item.salaryMax),
      salary_currency: item.salaryCurrency ?? null,
      posted_at: toDate(item.postedDate),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
