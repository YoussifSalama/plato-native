import { JobSource, Prisma } from '@prisma/client';
import { defineBoard } from './types';
import { normalizeJobType, remoteTypeOf, toDate } from './util';

// Apify actor: parsebird/jobbank-canada-scraper — Canada's government board
// (jobbank.gc.ca). `salary` is display text ("$25.00 hourly"), so pay is
// left null rather than guessed. ponytail: parse it if salary filters need Job Bank.
// https://apify.com/parsebird/jobbank-canada-scraper
interface JobBankItem {
  title?: string;
  employer?: string;
  location?: string;
  description?: string;
  employment_type?: string;
  posted_date?: string;
  url?: string;
}

// Postings live at /jobsearch/jobposting/<numeric id>.
const idOf = (url: string) => url.match(/jobposting\/(\d+)/)?.[1] ?? url;

export const jobbank = defineBoard<JobBankItem>({
  source: JobSource.JOBBANK,
  countries: ['CA'],
  actorId: 'parsebird~jobbank-canada-scraper',
  input: ({ title, location, limit }) => ({
    searchKeyword: title,
    location,
    maxItems: limit,
  }),
  map: (item) => {
    if (!item.title || !item.employer || !item.url) return null;
    return {
      source: JobSource.JOBBANK,
      external_id: idOf(item.url),
      title: item.title,
      company: item.employer,
      location: item.location ?? null,
      remote_type: remoteTypeOf(false, item.title, item.location ?? ''),
      job_type: normalizeJobType(item.employment_type),
      easy_apply: false,
      url: item.url,
      apply_url: item.url,
      description: item.description ?? null,
      posted_at: toDate(item.posted_date),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
