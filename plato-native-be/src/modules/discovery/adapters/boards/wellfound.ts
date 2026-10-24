import { JobRemoteType, JobSource, Prisma } from '@prisma/client';
import { defineBoard } from './types';
import { normalizeJobType, remoteTypeOf, toDate } from './util';

// Apify actor: igolaizola/wellfound-jobs-scraper (limited permissions). Startup
// jobs. Wellfound has no public API and its terms bar automated access (a
// secondary claim, see SOURCES_LEGAL.md), so this is the riskiest board here:
// turn it off with DISABLED_BOARDS=WELLFOUND. It cannot filter by title, so one
// run fetches recent remote jobs and the title match is done by the adapter.
// ~$0.0005 per job.
// https://apify.com/igolaizola/wellfound-jobs-scraper
interface WellfoundItem {
  id?: string | number;
  title?: string;
  role?: string;
  companyName?: string;
  location?: string;
  remote?: string;
  compensation?: string;
  jobType?: string;
  postedAtIso?: string;
  postedAt?: string;
  jobUrl?: string;
  descriptionText?: string;
}

// "$140k – $190k" or "€60k - €80k": numbers in thousands, currency from the symbol.
function pay(text: string | undefined) {
  const nums = [...(text ?? '').matchAll(/(\d+(?:\.\d+)?)\s*k\b/gi)].map((m) =>
    Math.round(Number(m[1]) * 1000),
  );
  const cur = /€/.test(text ?? '')
    ? 'EUR'
    : /£/.test(text ?? '')
      ? 'GBP'
      : /\$/.test(text ?? '')
        ? 'USD'
        : null;
  return {
    min: nums[0] ?? null,
    max: nums[1] ?? nums[0] ?? null,
    currency: nums.length ? cur : null,
  };
}

export const wellfound = defineBoard<WellfoundItem>({
  source: JobSource.WELLFOUND,
  countries: [],
  anywhere: true,
  perTitle: false,
  actorId: 'igolaizola~wellfound-jobs-scraper',
  input: ({ limit }) => ({
    location: 'remote',
    maxItems: Math.max(limit * 2, 50),
  }),
  map: (item) => {
    const title = item.title ?? item.role;
    if (!title || !item.companyName || !item.jobUrl) return null;
    const p = pay(item.compensation);
    return {
      source: JobSource.WELLFOUND,
      external_id: item.id ? String(item.id) : item.jobUrl,
      title,
      company: item.companyName,
      // The company's Wellfound page is not the employer's own site.
      company_url: null,
      location: item.location ?? null,
      remote_type:
        item.remote === 'remote'
          ? JobRemoteType.REMOTE
          : remoteTypeOf(false, item.remote ?? ''),
      job_type: normalizeJobType(item.jobType),
      easy_apply: false,
      url: item.jobUrl,
      apply_url: item.jobUrl,
      description: item.descriptionText ?? null,
      salary_min: p.min,
      salary_max: p.max,
      salary_currency: p.currency,
      posted_at: toDate(item.postedAtIso ?? item.postedAt),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
