import { JobSource, Prisma } from '@prisma/client';
import { defineBoard } from './types';
import { normalizeJobType, remoteTypeOf, toDate } from './util';

// Apify actor: jobsapi/jobillico-jobs-search-scraper — Canada (strong in
// Quebec). No date filter; `datePosted` comes back as "5 day(s)". Its own
// default proxy (residential, CA) is used.
// https://apify.com/jobsapi/jobillico-jobs-search-scraper
interface JobillicoItem {
  jobId?: string | number;
  title?: string;
  company?: string;
  hiringCompany?: string;
  location?: string;
  advertisedLocation?: string;
  employmentType?: string;
  description?: string;
  applyUrl?: string;
  jobUrl?: string;
  salaryCurrency?: string;
  salaryMin?: number;
  salaryMax?: number;
  datePosted?: string;
}

export const jobillico = defineBoard<JobillicoItem>({
  source: JobSource.JOBILLICO,
  countries: ['CA'],
  actorId: 'jobsapi~jobillico-jobs-search-scraper',
  input: ({ title, location, limit }) => ({
    query: title,
    location,
    maxItems: limit,
  }),
  map: (item) => {
    const url = item.jobUrl ?? item.applyUrl;
    const company = item.hiringCompany ?? item.company;
    if (!item.title || !company || !url) return null;
    const location = item.location ?? item.advertisedLocation ?? null;
    return {
      source: JobSource.JOBILLICO,
      external_id: item.jobId ? String(item.jobId) : url,
      title: item.title,
      company,
      location,
      remote_type: remoteTypeOf(false, item.title, location ?? ''),
      job_type: normalizeJobType(item.employmentType),
      easy_apply: false,
      url,
      apply_url: item.applyUrl ?? url,
      description: item.description ?? null,
      // Jobillico quotes yearly ranges ("CAD 67,700 - 133,600 per year").
      salary_min: item.salaryMin ?? null,
      salary_max: item.salaryMax ?? null,
      salary_currency: item.salaryCurrency ?? null,
      posted_at: toDate(item.datePosted),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
