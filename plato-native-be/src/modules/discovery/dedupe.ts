import { resolveCountry } from './countries';
import { normalizeCompany } from './company';
import { NormalizedJob } from './adapters/types';

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

// The same posting from two boards ("Microsoft Corp." / "MICROSOFT", the same
// title, the same place) gets the same key. "Place" is the country, or
// "remote" for remote jobs with no country, so a city spelled two ways matches.
export function dedupeKey(
  job: Pick<NormalizedJob, 'company' | 'title' | 'location' | 'remote_type'>,
): string {
  const where =
    (job.location && resolveCountry(job.location)) ||
    (job.remote_type === 'REMOTE' ? 'remote' : alnum(job.location ?? ''));
  return `${normalizeCompany(job.company).key}|${alnum(job.title)}|${where}`;
}

// Which of two copies of one posting to keep: the one we can apply on
// (company's own ATS), then the one with the longer description.
const OWN_ATS = /(greenhouse|lever|ashbyhq|workable)\./i;
const score = (j: NormalizedJob) =>
  (OWN_ATS.test(j.apply_url ?? j.url) ? 1_000_000 : 0) +
  (j.description?.length ?? 0) +
  (j.salary_min ? 500 : 0);

export function dedupeJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const best = new Map<string, NormalizedJob>();
  for (const j of jobs) {
    const k = dedupeKey(j);
    const have = best.get(k);
    if (!have || score(j) > score(have)) best.set(k, j);
  }
  return [...best.values()];
}
