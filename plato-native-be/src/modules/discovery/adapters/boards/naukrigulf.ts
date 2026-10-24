import { JobSource, Prisma } from '@prisma/client';
import { defineBoard } from './types';
import { plain, remoteTypeOf } from './util';

// Apify actor: bovi/naukrigulf-jobs-scraper (limited permissions). Gulf board;
// no official API, see SOURCES_LEGAL.md. Pricey: ~$0.009 per job.
// https://apify.com/bovi/naukrigulf-jobs-scraper
interface NaukrigulfItem {
  designation?: string;
  location?: string;
  job_info?: string;
  description?: string;
  company?: { name?: string };
  job_id?: string | number;
  jd_url?: string;
  // Unix seconds, as a string.
  latest_posted_date?: string | number;
}

const CITY: Record<string, string> = {
  AE: 'dubai',
  SA: 'riyadh',
  QA: 'doha',
  KW: 'kuwait city',
  BH: 'manama',
  OM: 'muscat',
};

export const naukrigulf = defineBoard<NaukrigulfItem>({
  source: JobSource.NAUKRIGULF,
  countries: Object.keys(CITY),
  actorId: 'bovi~naukrigulf-jobs-scraper',
  input: ({ title, location, country, limit }) => ({
    searchKeywords: [title],
    // The seeker's own city when they gave one, else the country's main city.
    location: location.split(',')[0].trim().toLowerCase() || CITY[country],
    maxItems: limit,
    maxPages: 2,
  }),
  map: (item) => {
    if (!item.designation || !item.company?.name || !item.jd_url) return null;
    const secs = Number(item.latest_posted_date);
    return {
      source: JobSource.NAUKRIGULF,
      external_id: item.job_id ? String(item.job_id) : item.jd_url,
      title: item.designation,
      company: item.company.name,
      company_url: null,
      location: item.location ?? null,
      remote_type: remoteTypeOf(false, item.designation, item.job_info ?? ''),
      job_type: null,
      easy_apply: false,
      url: item.jd_url,
      apply_url: item.jd_url,
      description: plain(item.description || item.job_info),
      posted_at:
        Number.isFinite(secs) && secs > 0
          ? new Date(secs < 1e12 ? secs * 1000 : secs)
          : null,
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
