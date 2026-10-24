import { JobSource, Prisma } from '@prisma/client';
import { MAX_POSTING_AGE_DAYS } from '../../discovery-run.helpers';
import { defineBoard } from './types';
import { idFromUrl, normalizeJobType, remoteTypeOf, toDate } from './util';

// Apify actor: parsebird/dice-jobs-scraper — US tech jobs. `salary` is
// display text, so pay stays null. `postedDate` is 24h/3d/7d/30d.
// https://apify.com/parsebird/dice-jobs-scraper
const POSTED =
  MAX_POSTING_AGE_DAYS <= 1
    ? '24h'
    : MAX_POSTING_AGE_DAYS <= 3
      ? '3d'
      : MAX_POSTING_AGE_DAYS <= 7
        ? '7d'
        : '30d';

interface DiceItem {
  title?: string;
  company?: string;
  location?: string;
  workSetting?: string;
  employmentType?: string;
  posted?: string;
  description?: string;
  url?: string;
}

export const dice = defineBoard<DiceItem>({
  source: JobSource.DICE,
  countries: ['US'],
  actorId: 'parsebird~dice-jobs-scraper',
  input: ({ title, location, limit, query }) => ({
    keyword: title,
    location: query.remoteTypes.every((t) => t === 'remote')
      ? 'Remote'
      : location,
    postedDate: POSTED,
    maxResults: limit,
  }),
  map: (item) => {
    if (!item.title || !item.company || !item.url) return null;
    return {
      source: JobSource.DICE,
      external_id: idFromUrl(item.url),
      title: item.title,
      company: item.company,
      location: item.location ?? null,
      remote_type: remoteTypeOf(
        false,
        item.workSetting ?? '',
        item.title,
        item.location ?? '',
      ),
      job_type: normalizeJobType(item.employmentType),
      easy_apply: false,
      url: item.url,
      apply_url: item.url,
      description: item.description ?? null,
      posted_at: toDate(item.posted),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
