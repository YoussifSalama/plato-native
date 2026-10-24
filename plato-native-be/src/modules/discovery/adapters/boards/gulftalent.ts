import { JobSource, Prisma } from '@prisma/client';
import { MAX_POSTING_AGE_DAYS } from '../../discovery-run.helpers';
import { defineBoard } from './types';
import { normalizeJobType, remoteTypeOf, toDate } from './util';

// Apify actor: shahidirfan/GulfTalent-Job-Scraper (limited permissions). Gulf
// board; no official API, see SOURCES_LEGAL.md. ~$0.001 per job + $0.005 start.
// https://apify.com/shahidirfan/GulfTalent-Job-Scraper
interface GulfTalentItem {
  job_id?: string | number;
  title?: string;
  company?: string;
  location?: string;
  date_posted?: string;
  url?: string;
  description_text?: string;
  employmentType?: string;
  is_remote?: boolean;
  salaryCurrency?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
}

export const gulftalent = defineBoard<GulfTalentItem>({
  source: JobSource.GULFTALENT,
  countries: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'],
  actorId: 'shahidirfan~GulfTalent-Job-Scraper',
  input: ({ title, location, limit }) => ({
    keyword: title,
    location: location.split(',')[0].trim(),
    posted_date: MAX_POSTING_AGE_DAYS <= 7 ? '7d' : '30d',
    maxJobs: limit,
    maxPages: 2,
  }),
  map: (item) => {
    if (!item.title || !item.company || !item.url) return null;
    return {
      source: JobSource.GULFTALENT,
      external_id: item.job_id ? String(item.job_id) : item.url,
      title: item.title,
      company: item.company,
      company_url: null,
      location: item.location ?? null,
      remote_type: remoteTypeOf(item.is_remote, item.title),
      job_type: normalizeJobType(item.employmentType),
      easy_apply: false,
      url: item.url,
      apply_url: item.url,
      description: item.description_text ?? null,
      salary_min: item.salaryMin || null,
      salary_max: item.salaryMax || null,
      salary_currency: item.salaryMin ? (item.salaryCurrency ?? null) : null,
      posted_at: toDate(item.date_posted),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
