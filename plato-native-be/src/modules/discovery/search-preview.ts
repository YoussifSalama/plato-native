import { JobRemoteType } from '@prisma/client';
import { searchMiss } from './discovery-run.helpers';
import type { DiscoveryQuery } from './adapters/types';

// "New search" live preview: what Plato's own index already holds for these details, and what each rule takes
// away. No AI, no tokens. The SAME gate the search applies to every job (searchMiss), so the numbers are the search's
// own rules; the search itself checks every job site, so it usually finds more.

export interface PreviewJob {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remote_type: JobRemoteType;
  job_type: string | null;
  salary_max: number | null;
  salary_currency: string | null;
  description: string | null;
  posted_at: Date | null;
}
export type PreviewInput = Pick<
  DiscoveryQuery,
  'titles' | 'countries' | 'remoteTypes' | 'visaSponsorshipRequired'
> &
  Partial<
    Pick<
      DiscoveryQuery,
      | 'jobTypes'
      | 'level'
      | 'minMonthlyUsd'
      | 'residenceCountry'
      | 'postedWithinDays'
      | 'includeKeywords'
      | 'excludeKeywords'
      | 'excludeCompanies'
      | 'salaryShownOnly'
      | 'remoteAnywhere'
    >
  >;

export function previewSearch(
  jobs: PreviewJob[],
  q: PreviewInput,
  now = Date.now(),
) {
  let relocate = 0;
  let payBelow = 0;
  let noVisa = 0;
  let other = 0; // level, employment, posted date, keywords, companies, salary shown
  const ok: PreviewJob[] = [];
  for (const j of jobs) {
    const miss = searchMiss(j, q, now);
    if (miss === 'place') relocate++;
    else if (miss === 'pay') payBelow++;
    else if (miss === 'visa') noVisa++;
    else if (miss) other++;
    else ok.push(j);
  }
  // Best first: the title closest to what was asked, then the newest.
  const words = (t: string) =>
    new Set(t.toLowerCase().match(/[a-z0-9+#.]+/g) ?? []);
  const asked = q.titles.map(words);
  const fit = (t: string) => {
    const w = words(t);
    return Math.max(
      0,
      ...asked.map(
        (a) => [...a].filter((x) => w.has(x)).length / Math.max(1, a.size),
      ),
    );
  };
  const top = ok
    .map((j) => ({ j, f: fit(j.title) }))
    .sort(
      (a, b) =>
        b.f - a.f ||
        (b.j.posted_at?.getTime() ?? 0) - (a.j.posted_at?.getTime() ?? 0),
    )
    .slice(0, 3)
    // fit: how much of the asked title this posting's title covers (0-100), for the order shown
    .map(({ j, f }) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      fit: Math.round(f * 100),
    }));
  return {
    found: jobs.length,
    relocate,
    payBelow,
    noVisa,
    other,
    canTake: ok.length,
    top,
  };
}
