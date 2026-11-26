import { checkSalary } from './salary-sanity';
import {
  countryName,
  countryNamesOf,
  isCountryCode,
  type CountryCode,
} from './countries';
import type { JobSeekerSnapshot } from './job-seeker-snapshot';
import type { SearchDraft } from './search-fit';

// Before a search runs (New search, on Start): the plain checks a recruiter would make, comparing what the seeker
// asked for with who they are. Rules, not AI: the same search and profile always get the same questions, at no cost
// (search quality control: nothing here may vary from one run to the next). Each question offers answers that
// change the search in one tap; the seeker may always search as it is. The AI fit check (search-fit.ts) adds the
// one judgement rules can't make: a role from another field.

/** A change to the search, in the API's own field names. */
export type ReviewPatch = {
  level?: 'entry' | 'mid' | 'senior';
  remoteTypes?: ('remote' | 'hybrid' | 'onsite')[];
  visaSponsorshipRequired?: boolean;
  willingToRelocate?: boolean;
  residenceCountry?: string;
  clearSalary?: boolean;
};

export type ReviewQuestion = {
  id: 'residence' | 'visa' | 'relocate' | 'level' | 'salary';
  title: string;
  why: string;
  // The first option is the one Plato suggests.
  options: { label: string; patch: ReviewPatch }[];
};

type Profile = Pick<
  JobSeekerSnapshot,
  'residenceCountry' | 'yearsExperience' | 'experiences' | 'willingToRelocate'
> & { workAuthorization: string[] };

const list = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** Years of experience: the saved band ("3-5" -> 3), else counted from the CV's dated roles (overlaps merged). */
export function yearsOf(
  p: Pick<Profile, 'yearsExperience' | 'experiences'>,
  now = new Date(),
): number | null {
  const band = p.yearsExperience?.match(/^(\d+)/);
  if (band) return Number(band[1]);
  const spans = p.experiences
    .map((e) => ({
      s: e.start ? Date.parse(e.start) : NaN,
      e: e.end ? Date.parse(e.end) : now.getTime(),
    }))
    .filter((x) => !Number.isNaN(x.s) && !Number.isNaN(x.e) && x.e > x.s)
    .sort((a, b) => a.s - b.s);
  if (!spans.length) return null;
  let total = 0;
  let [cur] = spans;
  for (const x of spans.slice(1)) {
    if (x.s <= cur.e) cur = { s: cur.s, e: Math.max(cur.e, x.e) };
    else {
      total += cur.e - cur.s;
      cur = x;
    }
  }
  total += cur.e - cur.s;
  return Math.floor(total / (365.25 * 24 * 3600 * 1000));
}

export function reviewSearch(
  profile: Profile,
  draft: SearchDraft,
): ReviewQuestion[] {
  const out: ReviewQuestion[] = [];
  const residence =
    draft.advanced?.residenceCountry ?? profile.residenceCountry;
  const anyWork = !draft.remoteTypes.length || draft.remoteTypes.length === 3;
  const officeToo = anyWork || draft.remoteTypes.some((r) => r !== 'remote');

  // 1. Where they live: eligibility, visas and pay all hang on it.
  if (!residence)
    out.push({
      id: 'residence',
      title: 'Where do you live now?',
      why: 'Plato uses it to keep jobs you can legally take and to judge pay. Pick your country before searching.',
      options: [],
    });

  // Countries searched that are not home and not already authorised.
  const authorised = new Set(
    countryNamesOf([residence, ...profile.workAuthorization]),
  );
  const abroad = draft.countries
    .filter(
      (c) => isCountryCode(c) && c.toUpperCase() !== residence?.toUpperCase(),
    )
    .filter((c) => !countryNamesOf([c]).some((n) => authorised.has(n)))
    .map((c) => countryName(c.toUpperCase()));

  // 2. Visa: office jobs in a country they can't work in, and sponsorship not asked for.
  if (residence && abroad.length && officeToo && !draft.visaSponsorshipRequired)
    out.push({
      id: 'visa',
      title: `Can you work in ${list(abroad)} without a visa?`,
      why: `Most office jobs in ${list(abroad)} need a work permit. If you need one, Plato keeps jobs that sponsor visas.`,
      options: [
        {
          label: 'I need visa sponsorship',
          patch: { visaSponsorshipRequired: true },
        },
        {
          label: `Only remote jobs in ${list(abroad)}`,
          patch: { remoteTypes: ['remote'] },
        },
        { label: "I'm allowed to work there", patch: {} },
      ],
    });

  // 3. Moving: office jobs abroad but not willing to relocate.
  const relocate =
    draft.advanced?.willingToRelocate ?? profile.willingToRelocate;
  if (residence && abroad.length && officeToo && !relocate)
    out.push({
      id: 'relocate',
      title: `Would you move to ${list(abroad)} for an office job?`,
      why: `You're searching office and hybrid jobs in ${list(abroad)} but haven't said you'd relocate.`,
      options: [
        { label: "Yes, I'd relocate", patch: { willingToRelocate: true } },
        { label: 'No, remote jobs only', patch: { remoteTypes: ['remote'] } },
      ],
    });

  // 4. Level against experience: two bands off is a search that mostly can't land.
  const years = yearsOf(profile);
  if (years !== null && draft.level === 'senior' && years < 3)
    out.push({
      id: 'level',
      title: 'Search senior roles?',
      why: `Senior roles usually ask for 5+ years; your CV shows about ${years}. Mid-level roles are a better match.`,
      options: [
        { label: 'Search mid-level', patch: { level: 'mid' } },
        { label: 'Keep senior', patch: {} },
      ],
    });
  if (years !== null && draft.level === 'entry' && years >= 5)
    out.push({
      id: 'level',
      title: 'Search entry-level roles?',
      why: `Your CV shows about ${years} years of experience. Entry-level roles may pay well below what you can get.`,
      options: [
        {
          label: years >= 8 ? 'Search senior' : 'Search mid-level',
          patch: { level: years >= 8 ? 'senior' : 'mid' },
        },
        { label: 'Keep entry-level', patch: {} },
      ],
    });

  // 5. Pay far from the market for where they're searching.
  if (draft.salary) {
    const v = checkSalary({
      amount: draft.salary.amount,
      currency: draft.salary.currency,
      period: draft.salary.period,
      residence: (residence?.toUpperCase() as CountryCode) ?? null,
      targets: draft.countries
        .filter(isCountryCode)
        .map((c) => c.toUpperCase()),
      remote: draft.remoteTypes.includes('remote'),
    });
    if (v && v.verdict !== 'ok')
      out.push({
        id: 'salary',
        title:
          v.verdict === 'high'
            ? 'Your minimum pay is above the usual range'
            : 'Your minimum pay is below the usual range',
        why: v.note,
        options:
          v.verdict === 'high'
            ? [
                {
                  label: 'Remove the pay filter',
                  patch: { clearSalary: true },
                },
                { label: 'Keep my minimum', patch: {} },
              ]
            : [{ label: 'Keep my minimum', patch: {} }],
      });
  }
  return out;
}
