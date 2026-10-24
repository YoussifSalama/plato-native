import { boardAdapter, formAdapter } from './generic';
import type { ProviderDefinition } from './types';

// ARCHITECTURAL REGISTRATIONS ONLY. Every provider below is BLOCKED and has no
// adapter. To activate one, all of docs/PROVIDER_ACTIVATION.md must be done.
// URL classification here uses the URL alone; nothing opens or reads a page.

const none = (provider: string) => ({ provider, page: 'other' as const, applyVia: 'none' as const });

export const workable: ProviderDefinition = {
  id: 'workable',
  hosts: ['workable.com'],
  label: 'Workable',
  policy: 'FILL_ONLY', // owner: "allow all for now", 2026-10-17: plato-native-be/docs/providers/all-platforms.md
  urlPatterns: ['https://jobs.workable.com/view/*', 'https://apply.workable.com/*'],
  capabilities: { fillForms: true, detectsOutcome: true, accountRequired: false, externalRedirects: false },
  classify: (u) =>
    (u.hostname === 'jobs.workable.com' && /^\/view\//.test(u.pathname)) || (u.hostname === 'apply.workable.com' && /^\/[^/]+\/j\/[^/]+/.test(u.pathname))
      ? { provider: 'workable', page: 'apply-form', applyVia: 'internal-form' }
      : none('workable'),
  adapter: async () => formAdapter,
};

export const linkedin: ProviderDefinition = {
  id: 'linkedin',
  hosts: ['linkedin.com'],
  label: 'LinkedIn',
  policy: 'FILL_ONLY', // owner: "allow all for now", 2026-10-17 (the seeker's own login; not auto-submitted)
  urlPatterns: ['https://www.linkedin.com/jobs/*'],
  capabilities: { fillForms: true, detectsOutcome: true, accountRequired: true, externalRedirects: true },
  classify: (u) =>
    u.hostname === 'www.linkedin.com' && /^\/jobs\/view\//.test(u.pathname)
      ? { provider: 'linkedin', page: 'job-listing', applyVia: 'unknown' } // Easy Apply vs company site
      : none('linkedin'),
  adapter: async () => boardAdapter, // Easy Apply is just a dialog: the generic AI loop reads and drives it
};

export const indeed: ProviderDefinition = {
  id: 'indeed',
  hosts: ['indeed.com'],
  label: 'Indeed',
  policy: 'FILL_ONLY', // owner: "allow all for now", 2026-10-17 (the seeker's own login; not auto-submitted)
  urlPatterns: ['https://*.indeed.com/viewjob*'],
  capabilities: { fillForms: true, detectsOutcome: true, accountRequired: true, externalRedirects: true },
  classify: (u) =>
    /(^|\.)indeed\.com$/.test(u.hostname) && u.pathname === '/viewjob'
      ? { provider: 'indeed', page: 'job-listing', applyVia: 'unknown' } // Indeed Apply vs company site
      : none('indeed'),
  adapter: async () => boardAdapter,
};

export const wuzzuf: ProviderDefinition = {
  id: 'wuzzuf',
  hosts: ['wuzzuf.net'],
  label: 'Wuzzuf',
  policy: 'FILL_ONLY', // owner: "allow all for now", 2026-10-17 (the seeker's own login; not auto-submitted)
  urlPatterns: ['https://wuzzuf.net/jobs/p/*'],
  // A Wuzzuf listing may use Wuzzuf's own form OR send the applicant to the
  // company's site / an ATS. Only inspecting the page can tell, so the URL
  // says 'unknown'. An external destination is routed by its own host.
  capabilities: { fillForms: true, detectsOutcome: true, accountRequired: true, externalRedirects: true },
  classify: (u) =>
    /(^|\.)wuzzuf\.net$/.test(u.hostname) && /^\/jobs\/p\//.test(u.pathname)
      ? { provider: 'wuzzuf', page: 'job-listing', applyVia: 'unknown' }
      : none('wuzzuf'),
  adapter: async () => boardAdapter,
};

// ACTIVE: owner approval 2026-10-17, see plato-native-be/docs/providers/greenhouse.md.
// Company boards on Greenhouse: the application form is on the job page, no account needed.
const GREENHOUSE_HOST = /^(boards|job-boards)(\.eu)?\.greenhouse\.io$/;
export const greenhouse: ProviderDefinition = {
  id: 'greenhouse',
  hosts: ['greenhouse.io'],
  label: 'Greenhouse',
  policy: 'FILL_ONLY',
  urlPatterns: ['https://boards.greenhouse.io/*', 'https://job-boards.greenhouse.io/*', 'https://boards.eu.greenhouse.io/*', 'https://job-boards.eu.greenhouse.io/*'],
  capabilities: { fillForms: true, detectsOutcome: true, accountRequired: false, externalRedirects: false },
  classify: (u) =>
    GREENHOUSE_HOST.test(u.hostname) && (/^\/[^/]+\/jobs\/\d+/.test(u.pathname) || u.pathname === '/embed/job_app')
      ? { provider: 'greenhouse', page: 'apply-form', applyVia: 'internal-form' }
      : none('greenhouse'),
  adapter: async () => formAdapter,
};

// Guest-form ATSs. Owner: "allow all for now", 2026-10-17: plato-native-be/docs/providers/all-platforms.md
export const lever: ProviderDefinition = {
  id: 'lever',
  hosts: ['lever.co'],
  label: 'Lever',
  policy: 'FILL_ONLY',
  urlPatterns: ['https://jobs.lever.co/*'],
  capabilities: { fillForms: true, detectsOutcome: true, accountRequired: false, externalRedirects: false },
  classify: (u) => (u.hostname === 'jobs.lever.co' && /^\/[^/]+\/[0-9a-f-]{8,}/.test(u.pathname) ? { provider: 'lever', page: 'apply-form', applyVia: 'internal-form' } : none('lever')),
  adapter: async () => formAdapter,
};

export const ashby: ProviderDefinition = {
  id: 'ashby',
  hosts: ['ashbyhq.com'],
  label: 'Ashby',
  policy: 'FILL_ONLY',
  urlPatterns: ['https://jobs.ashbyhq.com/*'],
  capabilities: { fillForms: true, detectsOutcome: true, accountRequired: false, externalRedirects: false },
  classify: (u) => (u.hostname === 'jobs.ashbyhq.com' && /^\/[^/]+\/[0-9a-f-]{8,}/.test(u.pathname) ? { provider: 'ashby', page: 'apply-form', applyVia: 'internal-form' } : none('ashby')),
  adapter: async () => formAdapter,
};

// Six more guest-form ATSs, owner request 2026-10-23 ("10 platforms"): plato-native-be/docs/providers/six-ats-2026-10-23.md.
// Each is classified by URL only; the same generic form loop drives every one of them.
const guest = (id: string, label: string, hosts: string[], urlPatterns: string[], isApply: (u: URL) => boolean): ProviderDefinition => ({
  id,
  hosts,
  label,
  policy: 'FILL_ONLY',
  urlPatterns,
  capabilities: { fillForms: true, detectsOutcome: true, accountRequired: false, externalRedirects: false },
  classify: (u) => (isApply(u) ? { provider: id, page: 'apply-form', applyVia: 'internal-form' } : none(id)),
  adapter: async () => formAdapter,
});
const sub = (domain: string) => (u: URL) => u.hostname.endsWith(`.${domain}`) && u.hostname !== domain;

// jobs.smartrecruiters.com/<Company>/<id>-<slug> (listing with Apply) and /oneclick-ui/company/<Company>/publication/<id> (form)
export const smartrecruiters = guest('smartrecruiters', 'SmartRecruiters', ['smartrecruiters.com'], ['https://jobs.smartrecruiters.com/*'], (u) => u.hostname === 'jobs.smartrecruiters.com' && (/^\/[^/]+\/\d{6,}/.test(u.pathname) || /^\/oneclick-ui\//.test(u.pathname)));
// <company>.bamboohr.com/careers/<id> and /careers/<id>/apply
export const bamboohr = guest('bamboohr', 'BambooHR', ['bamboohr.com'], ['https://*.bamboohr.com/careers/*'], (u) => sub('bamboohr.com')(u) && /^\/careers\/\d+/.test(u.pathname));
// <company>.recruitee.com/o/<slug> and /o/<slug>/c/new
export const recruitee = guest('recruitee', 'Recruitee', ['recruitee.com'], ['https://*.recruitee.com/o/*'], (u) => sub('recruitee.com')(u) && /^\/o\/[^/]+/.test(u.pathname));
// <company>.teamtailor.com/jobs/<id>-<slug> and /jobs/<id>-<slug>/applications/new
export const teamtailor = guest('teamtailor', 'Teamtailor', ['teamtailor.com'], ['https://*.teamtailor.com/jobs/*'], (u) => sub('teamtailor.com')(u) && /^\/jobs\/\d+/.test(u.pathname));
// <company>.jobs.personio.com|de/job/<id>
export const personio = guest('personio', 'Personio', ['jobs.personio.com', 'jobs.personio.de'], ['https://*.jobs.personio.com/job/*', 'https://*.jobs.personio.de/job/*'], (u) => /\.jobs\.personio\.(com|de)$/.test(u.hostname) && /^\/job\/\d+/.test(u.pathname));
// <company>.applytojob.com/apply/<id>/<slug>
export const jazzhr = guest('jazzhr', 'JazzHR', ['applytojob.com'], ['https://*.applytojob.com/apply/*'], (u) => sub('applytojob.com')(u) && /^\/apply\/[A-Za-z0-9]+/.test(u.pathname));

export const DEFINITIONS: ProviderDefinition[] = [workable, linkedin, indeed, wuzzuf, greenhouse, lever, ashby, smartrecruiters, bamboohr, recruitee, teamtailor, personio, jazzhr];
