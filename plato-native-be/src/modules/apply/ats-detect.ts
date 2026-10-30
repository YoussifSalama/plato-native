import { JobSource } from '@prisma/client';
import { ApplySource } from './apply.types';

// Jobs discovered directly on the ATS itself: no host-sniffing needed.
const DIRECT_ATS: Partial<Record<JobSource, ApplySource>> = {
  [JobSource.LEVER]: 'LEVER',
  [JobSource.WORKABLE]: 'WORKABLE',
  [JobSource.GREENHOUSE]: 'GREENHOUSE',
  [JobSource.ASHBY]: 'ASHBY',
};

// Applying here means using the seeker's own account on that platform
// (LinkedIn Easy Apply, Indeed, Wuzzuf, Handshake — the last is a closed
// platform: a verified school/employer account is required just to view a
// posting). Out of scope for auto-apply no matter what the URL looks like.
const ACCOUNT_GATED = new Set<JobSource>([
  JobSource.LINKEDIN,
  JobSource.INDEED,
  JobSource.WUZZUF,
  JobSource.HANDSHAKE,
  // Feed providers ask that you apply on their own listing page, with a link back.
  JobSource.REMOTIVE,
  JobSource.JOBICY,
  JobSource.REMOTEOK,
  JobSource.HIMALAYAS,
  JobSource.JOOBLE,
  JobSource.ADZUNA,
  JobSource.BAYT,
  JobSource.NAUKRIGULF,
  JobSource.GULFTALENT,
  JobSource.WEWORKREMOTELY,
  JobSource.WORKINGNOMADS,
  JobSource.WELLFOUND,
  JobSource.ARC,
  JobSource.DYNAMITEJOBS,
  JobSource.JOBGETHER,
  JobSource.NODESK,
]);

const HOST_TO_ATS: [RegExp, ApplySource][] = [
  [/(^|\.)workable\.com$/i, 'WORKABLE'],
  [/(^|\.)greenhouse\.io$/i, 'GREENHOUSE'],
  [/(^|\.)lever\.co$/i, 'LEVER'],
  [/(^|\.)ashbyhq\.com$/i, 'ASHBY'],
  [/^jobs\.smartrecruiters\.com$/i, 'SMARTRECRUITERS'],
  [/(^|\.)bamboohr\.com$/i, 'BAMBOOHR'],
  [/(^|\.)recruitee\.com$/i, 'RECRUITEE'],
  [/(^|\.)teamtailor\.com$/i, 'TEAMTAILOR'],
  [/(^|\.)jobs\.personio\.(com|de)$/i, 'PERSONIO'],
  [/(^|\.)applytojob\.com$/i, 'JAZZHR'],
];

// The ATS actually rendering the application form, read off the URL's host.
export function detectAtsHost(
  url: string | null | undefined,
): ApplySource | null {
  if (!url) return null;
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }
  return HOST_TO_ATS.find(([pattern]) => pattern.test(hostname))?.[1] ?? null;
}

// The adapter that should actually handle this job, independent of which
// board discovered it: a Dice/Glassdoor/Google-Jobs listing whose real
// application form lives on Greenhouse is a Greenhouse application.
export function effectiveApplySource(job: {
  source: JobSource;
  apply_url: string | null;
  url: string;
}): ApplySource | null {
  if (ACCOUNT_GATED.has(job.source)) return null;
  const direct = DIRECT_ATS[job.source];
  if (direct) return direct;
  return detectAtsHost(job.apply_url || job.url);
}
