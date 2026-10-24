import { JobRemoteType, JobSource, Prisma } from '@prisma/client';

// What every adapter consumes: parameters destructured from the job
// seeker's own preferences, source-agnostic.
export interface DiscoveryQuery {
  // Every title actually searched: planned from the seeker's background.
  titles: string[];
  // What the seeker asked for, before planning (names the search in the UI).
  requestedTitles?: string[];
  // Why each searched title is there, shown to the seeker.
  titlePlan?: { title: string; reason: string }[];
  locations: string[];
  // ISO country codes the seeker works in, derived from `locations` (and
  // chat overrides). Empty = no country known: search worldwide.
  countries: string[];
  remoteTypes: Array<'onsite' | 'hybrid' | 'remote' | 'any'>;
  jobTypes: string[];
  industries: string[];
  yearsExperience: string | null;
  willingToRelocate: boolean;
  visaSponsorshipRequired: boolean;
  // How many more jobs the run still wants after the local index was
  // consulted; adapters scale their limits down to this.
  budget?: number;
}

// What every adapter produces, before it's persisted as a Job row.
export interface NormalizedJob {
  source: JobSource;
  external_id: string;
  title: string;
  company: string;
  company_url?: string | null;
  location?: string | null;
  remote_type: JobRemoteType;
  job_type?: string | null;
  easy_apply: boolean;
  url: string;
  apply_url?: string | null;
  description?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  posted_at?: Date | null;
  raw: Prisma.InputJsonValue;
}

export interface DiscoveryAdapter {
  discover(query: DiscoveryQuery): Promise<NormalizedJob[]>;
}
