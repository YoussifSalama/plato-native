import { mergeDiscoveryQuery } from './query-merge';
import type { DiscoveryQuery } from './adapters/types';

const base: DiscoveryQuery = {
  titles: ['Backend Engineer'],
  locations: [],
  countries: ['EG'],
  remoteTypes: ['remote'],
  jobTypes: [],
  industries: [],
  yearsExperience: null,
  willingToRelocate: false,
  visaSponsorshipRequired: false,
  excludeCompanies: ['My Employer'],
  excludeKeywords: ['php'],
};

describe('mergeDiscoveryQuery: the profile\'s "avoid" lists', () => {
  it('a search that says nothing (chat, alerts) keeps them', () => {
    const q = mergeDiscoveryQuery(base, {});
    expect([q.excludeCompanies, q.excludeKeywords]).toEqual([['My Employer'], ['php']]);
  });

  it('New search (exact) shows them prefilled, so an empty field there means none', () => {
    const q = mergeDiscoveryQuery(base, { exact: true });
    expect([q.excludeCompanies, q.excludeKeywords]).toEqual([undefined, undefined]);
    const asked = mergeDiscoveryQuery(base, { exact: true, excludeCompanies: ['Acme'] });
    expect(asked.excludeCompanies).toEqual(['Acme']);
  });
});
