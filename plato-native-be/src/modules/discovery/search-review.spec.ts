import { reviewSearch, yearsOf } from './search-review';
import type { SearchDraft } from './search-fit';

const draft = (over: Partial<SearchDraft> = {}): SearchDraft => ({
  sentence: '',
  roles: ['Backend Engineer'],
  level: null,
  employment: [],
  countries: [],
  remoteTypes: [],
  visaSponsorshipRequired: false,
  salary: null,
  advanced: {},
  ...over,
});
const profile = (over: Record<string, unknown> = {}) => ({
  residenceCountry: 'EG',
  yearsExperience: null,
  experiences: [],
  willingToRelocate: false,
  workAuthorization: [] as string[],
  ...over,
});
const ids = (qs: { id: string }[]) => qs.map((q) => q.id);

describe('reviewSearch: plain checks before a search runs (rules, no AI)', () => {
  it('a search at home with nothing odd asks nothing', () => {
    expect(reviewSearch(profile(), draft({ countries: ['EG'] }))).toEqual([]);
  });

  it('no country of residence: asks where they live first', () => {
    expect(
      ids(reviewSearch(profile({ residenceCountry: null }), draft())),
    ).toEqual(['residence']);
    // Answered on the form (Live in): no question.
    expect(
      reviewSearch(
        profile({ residenceCountry: null }),
        draft({ advanced: { residenceCountry: 'EG' } }),
      ),
    ).toEqual([]);
  });

  it('office jobs abroad, no visa asked, not relocating: asks about the visa and the move, naming the country', () => {
    const qs = reviewSearch(profile(), draft({ countries: ['EG', 'AE'] }));
    expect(ids(qs)).toEqual(['visa', 'relocate']);
    expect(qs[0].title).toContain('UAE');
    expect(qs[0].options.map((o) => o.patch)).toContainEqual({
      visaSponsorshipRequired: true,
    });
    expect(qs[1].options.map((o) => o.patch)).toContainEqual({
      remoteTypes: ['remote'],
    });
  });

  it('remote only, sponsorship asked, relocating, or authorised (as a code or a name): no visa/move question', () => {
    const abroad = { countries: ['AE'] };
    expect(
      reviewSearch(profile(), draft({ ...abroad, remoteTypes: ['remote'] })),
    ).toEqual([]);
    expect(
      ids(
        reviewSearch(
          profile(),
          draft({ ...abroad, visaSponsorshipRequired: true }),
        ),
      ),
    ).toEqual(['relocate']);
    expect(
      ids(reviewSearch(profile({ willingToRelocate: true }), draft(abroad))),
    ).toEqual(['visa']);
    expect(
      reviewSearch(
        profile({ workAuthorization: ['AE'], willingToRelocate: true }),
        draft(abroad),
      ),
    ).toEqual([]);
    expect(
      reviewSearch(
        profile({
          workAuthorization: ['United Arab Emirates'],
          willingToRelocate: true,
        }),
        draft(abroad),
      ),
    ).toEqual([]);
  });

  it('level two bands off the experience: asks, offering the band that fits', () => {
    const junior = profile({ yearsExperience: '1-3' });
    const q = reviewSearch(junior, draft({ level: 'senior' }));
    expect(ids(q)).toEqual(['level']);
    expect(q[0].options[0].patch).toEqual({ level: 'mid' });
    expect(
      reviewSearch(
        profile({ yearsExperience: '10+' }),
        draft({ level: 'entry' }),
      )[0].options[0].patch,
    ).toEqual({ level: 'senior' });
    // One band off is a normal stretch: no question.
    expect(
      reviewSearch(
        profile({ yearsExperience: '3-5' }),
        draft({ level: 'senior' }),
      ),
    ).toEqual([]);
  });

  it('pay far above the market: offers to drop the pay filter', () => {
    const q = reviewSearch(
      profile(),
      draft({
        countries: ['EG'],
        salary: { amount: 50000, currency: 'USD', period: 'MONTHLY' },
      }),
    );
    expect(ids(q)).toEqual(['salary']);
    expect(q[0].options[0].patch).toEqual({ clearSalary: true });
  });

  it('the same search and profile always give the same questions (quality control)', () => {
    const p = profile({ yearsExperience: '1-3' });
    const d = draft({
      countries: ['AE', 'US'],
      level: 'senior',
      salary: { amount: 900, currency: 'USD', period: 'MONTHLY' },
    });
    expect(reviewSearch(p, d)).toEqual(reviewSearch(p, d));
  });
});

describe('yearsOf: the saved band, else the CV dates with overlaps merged', () => {
  it('reads the band', () =>
    expect(yearsOf({ yearsExperience: '5-10', experiences: [] })).toBe(5));
  it('counts dated roles once when they overlap', () => {
    const now = new Date('2026-01-01');
    const years = yearsOf(
      {
        yearsExperience: null,
        experiences: [
          {
            title: 'A',
            technologies: [],
            description: null,
            start: '2020-01-01',
            end: '2023-01-01',
          },
          {
            title: 'B',
            technologies: [],
            description: null,
            start: '2022-01-01',
            end: null,
          },
        ],
      },
      now,
    );
    expect(years).toBe(6);
  });
});
