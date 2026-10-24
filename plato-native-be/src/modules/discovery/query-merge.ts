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
};

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
  };
}
