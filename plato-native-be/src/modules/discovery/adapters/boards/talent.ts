import { JobSource, Prisma } from '@prisma/client';
import { defineBoard } from './types';
import {
  annual,
  idFromUrl,
  normalizeJobType,
  remoteTypeOf,
  toDate,
} from './util';

// Apify actor: cirkit/talent-com-jobs-scraper — 21 markets; `applyUrl` is
// the employer's own ATS link, not a Talent.com redirect.
// https://apify.com/cirkit/talent-com-jobs-scraper
const MAX_PAGES = 3;

interface TalentItem {
  title?: string;
  company?: string;
  jobId?: string | number;
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  jobTypes?: string[];
  isRemote?: boolean;
  datePosted?: string;
  applyUrl?: string;
  jobUrl?: string;
  descriptionText?: string;
}

export const talent = defineBoard<TalentItem>({
  source: JobSource.TALENT,
  countries: ['CA', 'US'],
  actorId: 'cirkit~talent-com-jobs-scraper',
  input: ({ title, location, country, limit }) => ({
    searchQueries: [title],
    locations: [location],
    market: country.toLowerCase(),
    maxItems: limit,
    maxPagesPerQuery: MAX_PAGES,
    fetchFullDescriptions: true,
  }),
  map: (item) => {
    const url = item.jobUrl ?? item.applyUrl;
    if (!item.title || !item.company || !url) return null;
    return {
      source: JobSource.TALENT,
      external_id: item.jobId ? String(item.jobId) : idFromUrl(url),
      title: item.title,
      company: item.company,
      location: item.location ?? null,
      remote_type: remoteTypeOf(item.isRemote, item.title, item.location ?? ''),
      job_type: normalizeJobType(item.jobTypes?.[0]),
      easy_apply: false,
      url,
      apply_url: item.applyUrl ?? url,
      description: item.descriptionText ?? null,
      salary_min: annual(item.salaryMin, item.salaryPeriod),
      salary_max: annual(item.salaryMax, item.salaryPeriod),
      salary_currency: item.salaryCurrency ?? null,
      posted_at: toDate(item.datePosted),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
