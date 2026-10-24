import { JobSource, Prisma } from '@prisma/client';
import { defineBoard } from './types';
import {
  annual,
  idFromUrl,
  locationText,
  normalizeJobType,
  remoteTypeOf,
  toDate,
} from './util';

// Apify actor: agentx/ziprecruiter-jobs-scraper — US + CA markets.
// `posted_since` is free text with no documented format, so it is left
// out; the run's freshness filter handles age.
// https://apify.com/agentx/ziprecruiter-jobs-scraper
interface ZipItem {
  title?: string;
  company_name?: string;
  company_website?: string;
  // Text on some plans, { raw, locality, region, country } on others.
  location?: unknown;
  description?: string;
  is_remote?: boolean;
  work_mode?: string;
  job_type?: string;
  salary_minimum?: number;
  salary_maximum?: number;
  salary_currency?: string;
  salary_period?: string;
  posted_date?: string;
  platform_url?: string;
  official_url?: string;
}

export const ziprecruiter = defineBoard<ZipItem>({
  source: JobSource.ZIPRECRUITER,
  countries: ['CA', 'US'],
  actorId: 'agentx~ziprecruiter-jobs-scraper',
  input: ({ title, location, country, limit, query }) => ({
    max_results: limit,
    keyword: title,
    country: country === 'CA' ? 'Canada' : 'United States',
    location,
    remote_only:
      query.remoteTypes.length > 0 &&
      query.remoteTypes.every((t) => t === 'remote'),
  }),
  map: (item) => {
    const url = item.platform_url || item.official_url;
    if (!item.title || !item.company_name || !url) return null;
    return {
      source: JobSource.ZIPRECRUITER,
      external_id: idFromUrl(url),
      title: item.title,
      company: item.company_name,
      company_url: item.company_website || null,
      location: locationText(item.location),
      remote_type: remoteTypeOf(
        item.is_remote,
        item.work_mode ?? '',
        item.title,
      ),
      job_type: normalizeJobType(item.job_type),
      easy_apply: false,
      url,
      apply_url: item.official_url || url,
      description: item.description ?? null,
      salary_min: annual(item.salary_minimum, item.salary_period),
      salary_max: annual(item.salary_maximum, item.salary_period),
      salary_currency: item.salary_currency || null,
      posted_at: toDate(item.posted_date),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
