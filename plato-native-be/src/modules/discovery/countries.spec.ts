import {
  countriesOf,
  inCountries,
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
