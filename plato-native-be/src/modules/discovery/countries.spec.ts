import { countryNamesOf } from './countries';
import { excludesCountry } from '../apply/eligibility';
import {
  countriesOf,
  inCountries,
  marketScale,
  placeIn,
  primaryPlaces,
  resolveCountry,
  searchPlaces,
} from './countries';
import { buildDiscoveryQuery } from './query-builder';
import { mergeDiscoveryQuery } from './query-merge';
import { DiscoveryQuery } from './adapters/types';

describe('resolveCountry', () => {
  it.each([
    ['Toronto, Canada', 'CA'],
    ['Toronto, ON', 'CA'],
    ['Burlington, ON, CA', 'CA'],
    ['Austin, TX', 'US'],
    ['San Francisco, CA', 'US'],
    ['New York, US', 'US'],
    ['Cairo, Egypt', 'EG'],
    ['6th of October, Al Jizah, Egypt', 'EG'],
    ['Alexandria', 'EG'],
    ['London, UK', 'GB'],
    ['Vancouver', 'CA'],
    ['Lyon, France', 'FR'],
    ['Tokyo', 'JP'],
    ['Atlanta, Georgia', 'US'],
    ['Tbilisi, Georgia', 'GE'],
    ['Nairobi, Kenya', 'KE'],
    ['Remote', null],
    ['', null],
  ])('%s -> %s', (text, code) => expect(resolveCountry(text)).toBe(code));
});

describe('countriesOf', () => {
  it('collects countries in order, once each', () => {
    expect(countriesOf(['Toronto, Canada', 'Austin, US', 'Ottawa'])).toEqual([
      'CA',
      'US',
    ]);
  });
  it('reads "Remote — US" style choices', () => {
    expect(countriesOf([], ['remote_us', 'remote_global'])).toEqual(['US']);
  });
});

describe('inCountries', () => {
  it('drops jobs based elsewhere, keeps unplaceable ones', () => {
    expect(inCountries('Cairo, Egypt', ['EG'])).toBe(true);
    expect(inCountries('Lagos, Nigeria', ['EG'])).toBe(false);
    expect(inCountries('Remote', ['EG'])).toBe(true);
    expect(inCountries(null, ['EG'])).toBe(true);
    expect(inCountries('Lagos, Nigeria', [])).toBe(true);
  });
});

describe('places', () => {
  const q = (over: Partial<DiscoveryQuery>) =>
    ({
      locations: ['Toronto, Canada', 'Ottawa, Canada', 'Cairo, Egypt'],
      countries: ['CA', 'EG'],
      willingToRelocate: false,
      ...over,
    }) as DiscoveryQuery;

  it('uses the seeker places, or the countries when relocating', () => {
    expect(searchPlaces(q({}))).toHaveLength(3);
    expect(searchPlaces(q({ willingToRelocate: true }))).toEqual([
      'Canada',
      'Egypt',
    ]);
  });
  it('picks one place per country for per-search billing', () => {
    expect(primaryPlaces(q({}), 2)).toEqual([
      'Toronto, Canada',
      'Cairo, Egypt',
    ]);
  });
  // QC 2026-11-26: a New search for Egypt + UAE sent LinkedIn only the saved "Cairo".
  it('searches every chosen country: own city inside it, else its name; saved cities elsewhere are not searched', () => {
    const cairo = q({ locations: ['Cairo'], countries: ['EG', 'AE'] });
    expect(searchPlaces(cairo)).toEqual(['Cairo', 'UAE']);
    expect(
      primaryPlaces({ ...cairo, countries: ['EG', 'AE', 'US', 'CA'] }, 4),
    ).toEqual(['Cairo', 'UAE', 'United States', 'Canada']);
    expect(
      searchPlaces(q({ locations: ['Cairo'], countries: ['AE'] })),
    ).toEqual(['UAE']);
  });
  it('grows the search with its markets, up to 2x at four countries', () => {
    const all = ['EG', 'AE', 'US', 'CA', 'SA', 'QA', 'KW', 'GB', 'DE'];
    expect(
      [0, 1, 2, 3, 4, 9].map((n) =>
        marketScale({ countries: all.slice(0, n) }),
      ),
    ).toEqual([1, 1, 1, 1.5, 2, 2]);
    // The same country twice (any case) is one market.
    expect(marketScale({ countries: ['us', 'US', 'EG'] })).toBe(1);
  });
  it('sends a board the own city in its country, else the country', () => {
    expect(placeIn(q({}), 'EG')).toBe('Cairo, Egypt');
    expect(placeIn(q({}), 'US')).toBe('United States');
    expect(placeIn(q({ willingToRelocate: true }), 'EG')).toBe('Egypt');
  });
});

describe('country in the query', () => {
  const base: DiscoveryQuery = {
    titles: ['Dev'],
    locations: ['Cairo, Egypt'],
    countries: ['EG'],
    remoteTypes: ['onsite'],
    jobTypes: [],
    industries: [],
    yearsExperience: null,
    willingToRelocate: false,
    visaSponsorshipRequired: false,
  };

  it('is derived from the saved places', () => {
    const q = buildDiscoveryQuery({
      roles: ['Dev'],
      preferredLocations: ['toronto', 'remote_us'],
      workSetup: ['remote'],
      preferredIndustries: [],
      jobTypes: [],
      yearsExperience: null,
      willingToRelocate: false,
      visaSponsorshipRequired: false,
    } as never);
    expect(q.locations).toEqual(['Toronto, Canada']);
    expect(q.countries).toEqual(['CA', 'US']);
  });

  it('takes titles from chat when no roles are saved', () => {
    const q = buildDiscoveryQuery({
      roles: [],
      preferredLocations: [],
      workSetup: [],
      preferredIndustries: [],
      jobTypes: [],
      yearsExperience: null,
      willingToRelocate: false,
      visaSponsorshipRequired: false,
    } as never);
    expect(
      mergeDiscoveryQuery(q, { titles: ['Full Stack Developer'] }).titles,
    ).toEqual(['Full Stack Developer']);
  });

  // QC 2026-11-26: New search's empty work mode fell back to the CV-suggested one (remote only: 53 jobs, not 118).
  it('New search (exact): an empty work mode or employment means any, not the saved preference', () => {
    const saved = {
      ...base,
      remoteTypes: ['remote'],
      jobTypes: ['full_time'],
    } as DiscoveryQuery;
    const exact = mergeDiscoveryQuery(saved, {
      exact: true,
      remoteTypes: [],
      jobTypes: [],
    });
    expect(exact.remoteTypes).toEqual(['any']);
    expect(exact.jobTypes).toEqual([]);
    expect(
      mergeDiscoveryQuery(saved, { exact: true, remoteTypes: ['hybrid'] })
        .remoteTypes,
    ).toEqual(['hybrid']);
    // The chat (no exact) still treats empty as "not said".
    expect(mergeDiscoveryQuery(saved, { remoteTypes: [] }).remoteTypes).toEqual(
      ['remote'],
    );
  });

  it('follows new places from chat, and an explicit list wins', () => {
    expect(mergeDiscoveryQuery(base, {}).countries).toEqual(['EG']);
    expect(
      mergeDiscoveryQuery(base, { locations: ['Toronto, Canada'] }).countries,
    ).toEqual(['CA']);
    expect(
      mergeDiscoveryQuery(base, {
        locations: ['Toronto, Canada'],
        countries: ['US'],
      }).countries,
    ).toEqual(['US']);
  });
});

describe('countryNamesOf: codes and names both become the names postings use', () => {
  it('turns an ISO code into the country names (EG -> egypt), keeps names, drops blanks', () => {
    const names = countryNamesOf(['EG', 'United Arab Emirates', '', null]);
    expect(names).toContain('egypt');
    expect(names).toContain('united arab emirates');
    expect(names).not.toContain('eg');
  });

  it('a seeker authorised as "IN" is not excluded from an India-only posting', () => {
    const job = {
      title: 'Backend Engineer',
      description: 'Only candidates based in India.',
    };
    expect(excludesCountry(job, countryNamesOf(['IN']))).toBe(false);
    expect(excludesCountry(job, countryNamesOf(['DE']))).toBe(true);
    // Before the fix the code stayed "in" and never matched "india".
    expect(excludesCountry(job, ['in'])).toBe(true);
  });
});
