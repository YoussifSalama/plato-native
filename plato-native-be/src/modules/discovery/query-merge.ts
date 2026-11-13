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
    remoteTypes: pick(overrides.remoteTypes, base.remoteTypes),
    jobTypes: pick(overrides.jobTypes, base.jobTypes),
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
