import type { JobSource } from '@prisma/client';
import { detectAtsHost, effectiveApplySource } from '../apply/ats-detect';

// Which job platforms the extension may touch. BLOCKED until the provider's
// terms were reviewed and the decision is recorded in docs/providers/<name>.md.
export type ProviderPolicy = 'FILL_ONLY' | 'BLOCKED';

export const PROVIDER_POLICY: Record<string, ProviderPolicy> = {
  // Owner approvals: greenhouse 2026-10-17 (docs/providers/greenhouse.md); the rest "allow all for
  // now" 2026-10-17 (docs/providers/all-platforms.md). No terms review was done by the developer.
  greenhouse: 'FILL_ONLY',
  lever: 'FILL_ONLY',
  ashby: 'FILL_ONLY',
  workable: 'FILL_ONLY',
  linkedin: 'FILL_ONLY',
  indeed: 'FILL_ONLY',
  wuzzuf: 'FILL_ONLY',
  // Six guest-form ATSs added 2026-10-23 (owner: "10 platforms"); docs/providers/six-ats-2026-10-23.md
  smartrecruiters: 'FILL_ONLY',
  bamboohr: 'FILL_ONLY',
  recruitee: 'FILL_ONLY',
  teamtailor: 'FILL_ONLY',
  personio: 'FILL_ONLY',
  jazzhr: 'FILL_ONLY',
};

// Static content-script match patterns for FILL_ONLY providers (the extension manifest must equal
// exactly these).
export const PROVIDER_MATCHES: Record<string, string[]> = {
  greenhouse: [
    'https://boards.greenhouse.io/*',
    'https://job-boards.greenhouse.io/*',
    'https://boards.eu.greenhouse.io/*',
    'https://job-boards.eu.greenhouse.io/*',
  ],
  lever: ['https://jobs.lever.co/*'],
  ashby: ['https://jobs.ashbyhq.com/*'],
  workable: ['https://jobs.workable.com/view/*', 'https://apply.workable.com/*'],
  linkedin: ['https://www.linkedin.com/jobs/*'],
  indeed: ['https://*.indeed.com/viewjob*'],
  wuzzuf: ['https://wuzzuf.net/jobs/p/*'],
  smartrecruiters: ['https://jobs.smartrecruiters.com/*'],
  bamboohr: ['https://*.bamboohr.com/careers/*'],
  recruitee: ['https://*.recruitee.com/o/*'],
  teamtailor: ['https://*.teamtailor.com/jobs/*'],
  personio: ['https://*.jobs.personio.com/job/*', 'https://*.jobs.personio.de/job/*'],
  jazzhr: ['https://*.applytojob.com/apply/*'],
};

// Providers where the extension may press Submit itself (after the seeker opted in for the run).
// LinkedIn: Easy Apply is stepped through in the seeker's own login (owner decision 2026-10-17).
// Indeed / Wuzzuf have no step-through yet: not auto-submitted.
export const AUTO_SUBMIT: string[] = ['greenhouse', 'lever', 'ashby', 'workable', 'linkedin', 'smartrecruiters', 'bamboohr', 'recruitee', 'teamtailor', 'personio', 'jazzhr'];
export const autoSubmitProviders = () =>
  AUTO_SUBMIT.filter((p) => policyFor(p) === 'FILL_ONLY');

/**
 * Which provider's page a job is applied on, for the extension. The seeker's own browser is
 * logged in to LinkedIn / Indeed / Wuzzuf, so (unlike the old server-side engine) those sources
 * count; everything else is found from the apply link's host (Greenhouse, Lever, ...).
 */
export const BOARD_SOURCES: Record<string, string> = { LINKEDIN: 'linkedin', INDEED: 'indeed', WUZZUF: 'wuzzuf' };
export const extensionProvider = (job: { source: JobSource; apply_url: string | null; url: string }): string | null =>
  // A board listing whose apply link lands on a known ATS (Indeed -> JazzHR) is that ATS's form: route by the link first.
  detectAtsHost(job.apply_url)?.toLowerCase() ?? BOARD_SOURCES[job.source] ?? effectiveApplySource(job)?.toLowerCase() ?? null;

export const enabledMatches = () =>
  Object.entries(PROVIDER_POLICY)
    .filter(([, p]) => p === 'FILL_ONLY')
    .flatMap(([name]) => PROVIDER_MATCHES[name] ?? []);

export const policyFor = (provider: string): ProviderPolicy =>
  PROVIDER_POLICY[provider] ?? 'BLOCKED'; // unknown = blocked
