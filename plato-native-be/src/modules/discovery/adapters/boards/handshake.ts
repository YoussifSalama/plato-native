import { JobSource, Prisma } from '@prisma/client';
import { defineBoard } from './types';
import {
  annual,
  idFromUrl,
  normalizeJobType,
  remoteTypeOf,
  toDate,
} from './util';

// Apify actor: memo23/handshake-jobs-scraper — public Handshake listings
// (early-career and internships skew). Email/payment enrichment is off.
// https://apify.com/memo23/handshake-jobs-scraper
interface HandshakeItem {
  jobId?: string | number;
  jobUrl?: string;
  title?: string;
  employerName?: string;
  employerWebsite?: string;
  description?: string;
  employmentType?: string;
  jobType?: string;
  location?: string;
  isRemote?: boolean;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  datePosted?: string;
}

export const handshake = defineBoard<HandshakeItem>({
  source: JobSource.HANDSHAKE,
  countries: ['US'],
  actorId: 'memo23~handshake-jobs-scraper',
  input: ({ title, location, limit, query }) => ({
    roles: [title],
    locations: [location],
    remoteOnly:
      query.remoteTypes.length > 0 &&
      query.remoteTypes.every((t) => t === 'remote'),
    maxItems: limit,
  }),
  map: (item) => {
    if (!item.title || !item.employerName || !item.jobUrl) return null;
    return {
      source: JobSource.HANDSHAKE,
      external_id: item.jobId ? String(item.jobId) : idFromUrl(item.jobUrl),
      title: item.title,
      company: item.employerName,
      company_url: item.employerWebsite ?? null,
      location: item.location ?? null,
      remote_type: remoteTypeOf(item.isRemote, item.title, item.location ?? ''),
      job_type: normalizeJobType(item.employmentType ?? item.jobType),
      easy_apply: false,
      url: item.jobUrl,
      apply_url: item.jobUrl,
      description: item.description ?? null,
      salary_min: annual(item.salaryMin, item.salaryPeriod),
      salary_max: annual(item.salaryMax, item.salaryPeriod),
      salary_currency: item.salaryCurrency ?? null,
      posted_at: toDate(item.datePosted),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
