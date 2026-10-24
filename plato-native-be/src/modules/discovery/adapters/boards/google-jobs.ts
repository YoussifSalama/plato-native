import { JobSource, Prisma } from '@prisma/client';
import { MAX_POSTING_AGE_DAYS } from '../../discovery-run.helpers';
import { defineBoard } from './types';
import { idFromUrl, normalizeJobType, remoteTypeOf, toDate } from './util';

// Apify actor: scrapesage/google-jobs-scraper — Google's job panel, which
// itself aggregates LinkedIn/Indeed/ZipRecruiter/career pages. Each search
// page holds 10 listings, so `maxResults` past 10 costs extra pages.
// https://apify.com/scrapesage/google-jobs-scraper
const DATE_POSTED =
  MAX_POSTING_AGE_DAYS <= 1
    ? 'yesterday'
    : MAX_POSTING_AGE_DAYS <= 3
      ? '3days'
      : MAX_POSTING_AGE_DAYS <= 7
        ? 'week'
        : 'month';

interface GoogleJobItem {
  title?: string;
  company?: string;
  location?: string;
  employmentType?: string;
  postedDate?: string;
  description?: string;
  applyUrl?: string;
  googleJobsUrl?: string;
}

export const googleJobs = defineBoard<GoogleJobItem>({
  source: JobSource.GOOGLE_JOBS,
  countries: ['CA', 'US'],
  actorId: 'scrapesage~google-jobs-scraper',
  input: ({ title, location, country, limit, query }) => ({
    queries: [title],
    location,
    countryCode: country.toLowerCase(),
    datePosted: DATE_POSTED,
    remoteOnly:
      query.remoteTypes.length > 0 &&
      query.remoteTypes.every((t) => t === 'remote'),
    maxResults: limit,
  }),
  map: (item) => {
    const url = item.googleJobsUrl ?? item.applyUrl;
    if (!item.title || !item.company || !url) return null;
    return {
      source: JobSource.GOOGLE_JOBS,
      external_id: idFromUrl(url),
      title: item.title,
      company: item.company,
      location: item.location ?? null,
      remote_type: remoteTypeOf(false, item.title, item.location ?? ''),
      job_type: normalizeJobType(item.employmentType),
      easy_apply: false,
      url,
      apply_url: item.applyUrl ?? url,
      description: item.description ?? null,
      posted_at: toDate(item.postedDate),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
