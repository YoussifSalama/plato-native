import { JobRemoteType, JobSource, Prisma } from '@prisma/client';
import { defineBoard } from './types';
import { plain, toDate } from './util';

// Apify actor: benthepythondev/workingnomads-jobs-scraper (limited permissions);
// reads Working Nomads' public jobs feed. Its terms were not found, see
// SOURCES_LEGAL.md. Fully remote jobs only.
// https://apify.com/benthepythondev/workingnomads-jobs-scraper
interface WorkingNomadsItem {
  id?: string | number;
  title?: string;
  company?: string;
  category?: string;
  location?: string;
  published_date?: string;
  job_url?: string;
  description?: string;
}

export const workingnomads = defineBoard<WorkingNomadsItem>({
  source: JobSource.WORKINGNOMADS,
  countries: [],
  anywhere: true,
  actorId: 'benthepythondev~workingnomads-jobs-scraper',
  input: ({ title, limit }) => ({
    keyword: title,
    maxResults: limit,
    includeDescriptions: true,
  }),
  map: (item) => {
    if (!item.title || !item.company || !item.job_url) return null;
    return {
      source: JobSource.WORKINGNOMADS,
      external_id: item.id ? String(item.id) : item.job_url,
      title: item.title,
      company: item.company,
      company_url: null,
      location: item.location ?? 'Worldwide',
      remote_type: JobRemoteType.REMOTE,
      job_type: null,
      easy_apply: false,
      url: item.job_url,
      apply_url: item.job_url,
      description: plain(item.description),
      posted_at: toDate(item.published_date),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
