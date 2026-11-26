import { DiscoveryQuery } from './adapters/types';
import { countriesOf } from './countries';

export type DiscoveryQueryOverrides = Partial<
  Pick<
    DiscoveryQuery,
    | 'titles'
    | 'locations'
    | 'countries'
    | 'remoteTypes'
    | 'jobTypes'
    | 'industries'
    | 'visaSponsorshipRequired'
  >
> & {
  // The seeker said "only this title": search exactly what was asked.
  strictTitles?: boolean;
  // New search: the sentence the seeker wrote, stored on the run as written.
  sentence?: string;
  // New search: the form IS the search. An empty work mode or employment field means "any", never the saved
  // preference (QC 2026-11-26: the same CV and the same form gave 118 or 53 jobs, depending on what the CV reading
  // had once suggested for work mode).
  exact?: boolean;
} & Partial<
    Pick<
      DiscoveryQuery,
      | 'level'
      | 'minMonthlyUsd'
      | 'residenceCountry'
      | 'postedWithinDays'
      | 'includeKeywords'
      | 'excludeKeywords'
      | 'excludeCompanies'
      | 'salaryShownOnly'
      | 'willingToRelocate'
      | 'remoteAnywhere'
    >
  >;

// Chat-supplied overrides win field-by-field; empty arrays are treated as
// "not specified" so the agent can't accidentally blank out preferences.
export function mergeDiscoveryQuery(
  base: DiscoveryQuery,
  overrides: DiscoveryQueryOverrides = {},
): DiscoveryQuery {
  const pick = <T>(next: T[] | undefined, fallback: T[]) =>
    next && next.length ? [...new Set(next)] : fallback;
  const locations = pick(overrides.locations, base.locations);
  // An explicit country list wins. New places re-derive it (the saved
  // countries described the old places); otherwise the saved ones stand.
  const countries = overrides.countries?.length
    ? [...new Set(overrides.countries)]
    : overrides.locations?.length
      ? countriesOf(locations)
      : base.countries;
  return {
    ...base,
    titles: pick(overrides.titles, base.titles),
    locations,
    countries,
    remoteTypes: overrides.exact
      ? pick(overrides.remoteTypes, ['any'])
      : pick(overrides.remoteTypes, base.remoteTypes),
    jobTypes: overrides.exact
      ? [...new Set(overrides.jobTypes ?? [])]
      : pick(overrides.jobTypes, base.jobTypes),
    industries: pick(overrides.industries, base.industries),
    visaSponsorshipRequired:
      overrides.visaSponsorshipRequired ?? base.visaSponsorshipRequired,
    willingToRelocate: overrides.willingToRelocate ?? base.willingToRelocate,
    // New search rules: only what was asked for; nothing here comes from saved preferences.
    ...(overrides.level && { level: overrides.level }),
    ...(overrides.minMonthlyUsd && { minMonthlyUsd: overrides.minMonthlyUsd }),
    ...(overrides.residenceCountry && {
      residenceCountry: overrides.residenceCountry,
    }),
    ...(overrides.postedWithinDays && {
      postedWithinDays: overrides.postedWithinDays,
    }),
    ...(overrides.includeKeywords?.length && {
      includeKeywords: overrides.includeKeywords,
    }),
    ...(overrides.excludeKeywords?.length && {
      excludeKeywords: overrides.excludeKeywords,
    }),
    ...(overrides.excludeCompanies?.length && {
      excludeCompanies: overrides.excludeCompanies,
    }),
    ...(overrides.remoteAnywhere && { remoteAnywhere: true }),
    ...(overrides.salaryShownOnly && { salaryShownOnly: true }),
  };
}
