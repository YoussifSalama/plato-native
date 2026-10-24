import { JobSource, Prisma } from '@prisma/client';
import { MAX_POSTING_AGE_DAYS } from '../../discovery-run.helpers';
import { countryName } from '../../countries';
import { defineBoard } from './types';
import { normalizeJobType, remoteTypeOf, toDate } from './util';

// Apify actor: automation-lab/wuzzuf-jobs-scraper — Egypt's biggest board.
// `salary` is display text (mostly "Confidential"), so pay stays null.
// https://apify.com/automation-lab/wuzzuf-jobs-scraper
interface WuzzufItem {
  jobId?: string | number;
  title?: string;
  company?: string;
  location?: string;
  jobTypes?: string[];
  workplace?: string;
  postedAt?: string;
  description?: string;
  url?: string;
}

export const wuzzuf = defineBoard<WuzzufItem>({
  source: JobSource.WUZZUF,
  countries: ['EG'],
  actorId: 'automation-lab~wuzzuf-jobs-scraper',
  input: ({ title, location, limit, query }) => {
    // Wuzzuf filters by city ("Cairo"), not country: drop a bare country.
    const city = location.split(',')[0].trim();
    return {
      searchQueries: [title],
      ...(city && city !== countryName('EG') ? { location: city } : {}),
      ...(query.remoteTypes.length > 0 &&
      query.remoteTypes.every((t) => t === 'remote')
        ? { workplace: 'Remote' }
        : {}),
      postedWithinDays: MAX_POSTING_AGE_DAYS,
      maxItems: limit,
    };
  },
  map: (item) => {
    if (!item.title || !item.company || !item.url) return null;
    return {
      source: JobSource.WUZZUF,
      external_id: item.jobId ? String(item.jobId) : item.url,
      title: item.title,
      company: item.company,
      location: item.location ?? null,
      remote_type: remoteTypeOf(
        false,
        item.workplace ?? '',
        item.title,
        item.location ?? '',
      ),
      job_type: normalizeJobType(item.jobTypes?.[0]),
      easy_apply: false,
      url: item.url,
      apply_url: item.url,
      description: item.description ?? null,
      posted_at: toDate(item.postedAt),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
