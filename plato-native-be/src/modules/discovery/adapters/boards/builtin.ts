import { JobSource, Prisma } from '@prisma/client';
import { defineBoard } from './types';
import { annual, idFromUrl, remoteTypeOf, toDate } from './util';

// Apify actor: benthepythondev/builtin-jobs-scraper — Built In (US tech and
// startup roles). No date filter; `date_posted` / `posted` carry the age.
// https://apify.com/benthepythondev/builtin-jobs-scraper
interface BuiltInItem {
  title?: string;
  company?: string;
  location?: string;
  work_type?: string;
  salary_min?: number;
  salary_max?: number;
  posted?: string;
  date_posted?: string;
  description?: string;
  url?: string;
}

export const builtin = defineBoard<BuiltInItem>({
  source: JobSource.BUILTIN,
  countries: ['US'],
  actorId: 'benthepythondev~builtin-jobs-scraper',
  input: ({ title, location, limit, query }) => ({
    keyword: title,
    location,
    remoteOnly:
      query.remoteTypes.length > 0 &&
      query.remoteTypes.every((t) => t === 'remote'),
    includeDescription: true,
    maxResults: limit,
  }),
  map: (item) => {
    if (!item.title || !item.company || !item.url) return null;
    return {
      source: JobSource.BUILTIN,
      external_id: idFromUrl(item.url),
      title: item.title,
      company: item.company,
      location: item.location ?? null,
      remote_type: remoteTypeOf(
        false,
        item.work_type ?? '',
        item.title,
        item.location ?? '',
      ),
      easy_apply: false,
      url: item.url,
      apply_url: item.url,
      description: item.description ?? null,
      // Built In lists yearly pay.
      salary_min: annual(item.salary_min, 'YEAR'),
      salary_max: annual(item.salary_max, 'YEAR'),
      posted_at: toDate(item.date_posted ?? item.posted),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
