import { JobSource, Prisma } from '@prisma/client';
import { defineBoard } from './types';
import { normalizeJobType, plain, toDate } from './util';
import { JobRemoteType } from '@prisma/client';

// Apify actor: bovi/weworkremotely-scraper (limited permissions); it reads WWR's
// public RSS feeds. WWR's own API terms are stricter than its RSS: see
// SOURCES_LEGAL.md before enabling in production. ~$0.0015 per job.
// https://apify.com/bovi/weworkremotely-scraper
interface WwrItem {
  job_id?: string;
  title?: string;
  company?: string;
  role?: string;
  region?: string;
  location?: string;
  job_type?: string;
  posted_at?: string;
  url?: string;
  description?: string;
}

// Words that name the field of a title, not its level or kind of job.
const GENERIC =
  /^(senior|junior|lead|principal|staff|sr|jr|developer|engineer|manager|specialist|and|the|of|a|an)$/i;

export const weworkremotely = defineBoard<WwrItem>({
  source: JobSource.WEWORKREMOTELY,
  countries: [],
  anywhere: true,
  actorId: 'bovi~weworkremotely-scraper',
  // Only jobs whose title contains one of these words are returned (and charged).
  input: ({ title, limit }) => {
    const words = title
      .split(/[\s/&,-]+/)
      .filter((w) => w.length > 1 && !GENERIC.test(w));
    return {
      keywords: words.length ? words : [title],
      maxItems: Math.max(limit, 20),
      includeDescriptions: true,
    };
  },
  map: (item) => {
    const title = item.role ?? item.title;
    if (!title || !item.company || !item.url) return null;
    return {
      source: JobSource.WEWORKREMOTELY,
      external_id: item.job_id ?? item.url,
      title,
      company: item.company,
      company_url: null,
      location: item.region ?? item.location ?? 'Anywhere',
      remote_type: JobRemoteType.REMOTE,
      job_type: normalizeJobType(item.job_type),
      easy_apply: false,
      url: item.url,
      apply_url: item.url,
      description: plain(item.description),
      posted_at: toDate(item.posted_at),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
