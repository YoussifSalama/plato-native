import { clean } from './search-fit';

describe('search fit check: the model output is cleaned', () => {
  it('a fit carries no reasons and no suggestion', () => {
    expect(clean({ fits: true, reasons: ['x'], suggestion: null })).toEqual({
      fits: true,
      reasons: [],
      suggestion: null,
    });
  });
  it('a misfit keeps real country codes, unique titles and a positive salary only', () => {
    const f = clean({
      fits: false,
      reasons: [' Your background is backend engineering. ', ''],
      suggestion: {
        sentence: ' Backend roles in the Gulf. ',
        roles: ['Backend Engineer', 'Backend Engineer', ' Node.js Developer '],
        level: 'mid',
        employment: ['full_time'],
        countries: ['sa', 'XX', 'AE'],
        remoteTypes: ['remote'],
        visaSponsorshipRequired: false,
        salary: { amount: 0, currency: 'usd', period: 'MONTHLY' },
        postedWithinDays: null,
        includeKeywords: [],
        excludeKeywords: [],
        excludeCompanies: [],
        salaryShownOnly: false,
        willingToRelocate: false,
      },
    });
    expect(f.reasons).toEqual(['Your background is backend engineering.']);
    expect(f.suggestion).toMatchObject({
      sentence: 'Backend roles in the Gulf.',
      roles: ['Backend Engineer', 'Node.js Developer'],
      countries: ['SA', 'AE'],
      salary: null,
    });
  });
});
