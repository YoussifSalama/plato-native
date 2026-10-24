import { JobRemoteType, JobSource, Prisma } from '@prisma/client';
import { defineBoard } from './types';
import { normalizeJobType, plain, toDate } from './util';

// Apify actor: automation-lab/jobgether-remote-jobs-scraper (limited
// permissions; same author as the Wuzzuf actor). Remote jobs; no public API,
// see SOURCES_LEGAL.md. Almost free: $0.005 per run + a fraction of a cent per job.
// https://apify.com/automation-lab/jobgether-remote-jobs-scraper
interface JobgetherItem {
  offerId?: string;
  title?: string;
  company?: string;
  companyUrl?: string;
  postedAt?: string;
  // ISO country codes the employer accepts applicants from.
  locations?: string[];
  remoteScope?: string;
  employmentTypes?: string[];
  description?: string;
  canonicalUrl?: string;
}

export const jobgether = defineBoard<JobgetherItem>({
  source: JobSource.JOBGETHER,
  countries: [],
  anywhere: true,
  actorId: 'automation-lab~jobgether-remote-jobs-scraper',
  input: ({ title, limit }) => ({
    keyword: title,
    maxItems: limit,
    includeDetails: true,
    recencyDays: 30,
  }),
  // Jobgether lists the countries a job accepts: use it instead of guessing from text.
  accepts: (item, countries) => {
    const raw = item as unknown as JobgetherItem;
    return (
      !raw.locations?.length ||
      countries.some((c) => raw.locations!.includes(c))
    );
  },
  map: (item) => {
    if (!item.title || !item.company || !item.canonicalUrl) return null;
    return {
      source: JobSource.JOBGETHER,
      external_id: item.offerId ?? item.canonicalUrl,
      title: item.title,
      company: item.company,
      company_url: item.companyUrl ?? null,
      location: item.remoteScope ?? 'Remote',
      remote_type: JobRemoteType.REMOTE,
      job_type: normalizeJobType(item.employmentTypes?.[0]),
      easy_apply: false,
      // The listing itself; applyUrl is Jobgether's own sign-up page.
      url: item.canonicalUrl,
      apply_url: item.canonicalUrl,
      description: plain(item.description),
      posted_at: toDate(item.postedAt),
      raw: item as unknown as Prisma.InputJsonValue,
    };
  },
});
