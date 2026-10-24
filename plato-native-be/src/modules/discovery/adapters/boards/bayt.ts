import { JobSource, Prisma } from '@prisma/client';
import { defineBoard } from './types';
import { annual, plain, remoteTypeOf, toDate } from './util';

// Apify actor: goat255/bayt-scraper (limited permissions). Bayt is the Middle
// East's biggest board; it has no public API, so this is a scraper: see
// SOURCES_LEGAL.md for the terms note. ~$0.002 per job.
// https://apify.com/goat255/bayt-scraper
interface BaytItem {
  id?: string | number;
  title?: string;
  summary?: string;
  company?: string;
  companyUrl?: string;
  city?: string;
  country?: string;
  salaryLabel?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryPeriod?: string | null;
  postedAt?: string;
  postedAgo?: string;
  url?: string;
}

// The actor's `country` options.
const SITE: Record<string, string> = {
  AE: 'uae',
  SA: 'saudi-arabia',
  EG: 'egypt',
  QA: 'qatar',
  KW: 'kuwait',
  BH: 'bahrain',
  OM: 'oman',
  JO: 'jordan',
  LB: 'lebanon',
  MA: 'morocco',
};
const CURRENCY = /\b(AED|SAR|EGP|QAR|KWD|BHD|OMR|JOD|USD|EUR)\b/i;

export const bayt = defineBoard<BaytItem>({
  source: JobSource.BAYT,
  countries: Object.keys(SITE),
  actorId: 'goat255~bayt-scraper',
  input: ({ title, country, limit }) => ({
    searchTerms: [title],
    country: SITE[country],
    sort: 'date',
    maxResultsPerTerm: limit,
  }),
  map: (item) => {
    if (!item.title || !item.company || !item.url) return null;
    return {
      source: JobSource.BAYT,
      external_id: item.id ? String(item.id) : item.url,
      title: item.title,
      company: item.company,
      company_url: null,
      location: [item.city, item.country].filter(Boolean).join(', ') || null,
      remote_type: remoteTypeOf(false, item.title, item.summary ?? ''),
      job_type: null,
      easy_apply: false,
      url: item.url,
      apply_url: item.url,
      description: plain(item.summary),
      salary_min: annual(item.salaryMin, item.salaryPeriod),
      salary_max: annual(item.salaryMax, item.salaryPeriod),
      salary_currency: item.salaryMin
        ? (CURRENCY.exec(item.salaryLabel ?? '')?.[1].toUpperCase() ?? null)
        : null,
      posted_at: toDate(item.postedAt ?? item.postedAgo),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
