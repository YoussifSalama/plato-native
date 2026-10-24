import type { Evidence, ProviderPolicy } from '../core/types';

export type { ProviderPolicy };
export type PageKind = 'job-listing' | 'apply-form' | 'other';
/**
 * Where the application is actually submitted. A listing on a job board may
 * use the board's own form OR redirect to a company/ATS site; URL alone often
 * can't tell, so that stays 'unknown' until a reviewed adapter inspects the page.
 */
export type ApplyVia = 'internal-form' | 'external-ats' | 'unknown' | 'none';

export interface PageClassification {
  provider: string;
  page: PageKind;
  applyVia: ApplyVia;
}

export interface ProviderCapabilities {
  fillForms: boolean;
  detectsOutcome: boolean;
  /** The seeker's own logged-in account on that site is needed. */
  accountRequired: boolean;
  /** Listings may send the applicant to another site (an ATS). */
  externalRedirects: boolean;
}

export type PrepareResult =
  | { kind: 'ready' }
  | { kind: 'needs-user'; reason: 'login' | 'mfa' | 'captcha' | 'questions'; detail?: string }
  | { kind: 'skip'; reason: 'closed' | 'already_applied'; message: string } // nothing to do on this job: SKIPPED, not a failure
  | { kind: 'unsupported'; message: string };

/**
 * What a provider adapter may do. By design there is NO submit method: the
 * person presses Submit on the site. `inspectOutcome` is read-only.
 */
export interface ProviderAdapter {
  prepare(ctx: { tabId: number; jobUrl: string }): Promise<PrepareResult>;
  inspectOutcome(tabId: number): Promise<Evidence>;
}

export interface ProviderDefinition {
  id: string;
  label: string;
  /** Local policy. Effective policy also needs the server to say FILL_ONLY. */
  policy: ProviderPolicy;
  /** Domains this provider owns (for telling "known site, outside scope" from a stranger). */
  hosts: string[];
  /** Chrome match patterns. Used for the manifest ONLY when policy is FILL_ONLY. */
  urlPatterns: string[];
  capabilities: ProviderCapabilities;
  classify(url: URL): PageClassification;
  /** Adapter entry point. Absent = not implemented. */
  adapter?: () => Promise<ProviderAdapter>;
}
