import { onboardingOptions } from '../../common/onboarding-options';
import { DiscoveryQuery } from './adapters/types';

// ISO 3166-1 alpha-2. The seeker has no "country" field of their own: it is
// derived from the places they want to work in (and chat overrides), then
// drives which sources run and how each one filters.
export type CountryCode = string;

const COUNTRIES: Record<CountryCode, { name: string; aliases?: string[] }> = {
  US: {
    name: 'United States',
    aliases: ['us', 'usa', 'u.s.', 'u.s.a.', 'america'],
  },
  CA: { name: 'Canada' },
  GB: {
    name: 'United Kingdom',
    aliases: ['uk', 'england', 'scotland', 'britain'],
  },
  DE: { name: 'Germany' },
  NL: { name: 'Netherlands' },
  FR: { name: 'France' },
  ES: { name: 'Spain' },
  PT: { name: 'Portugal' },
  PL: { name: 'Poland' },
  AE: { name: 'UAE', aliases: ['united arab emirates'] },
  SA: { name: 'Saudi Arabia', aliases: ['ksa'] },
  EG: { name: 'Egypt' },
  JO: { name: 'Jordan' },
  TR: { name: 'Turkey', aliases: ['türkiye'] },
  KE: { name: 'Kenya' },
  NG: { name: 'Nigeria' },
  ZA: { name: 'South Africa' },
  IN: { name: 'India' },
  SG: { name: 'Singapore' },
  ID: { name: 'Indonesia' },
  JP: { name: 'Japan' },
  KR: { name: 'South Korea', aliases: ['korea'] },
  HK: { name: 'Hong Kong' },
  TW: { name: 'Taiwan' },
  AU: { name: 'Australia' },
  BR: { name: 'Brazil' },
  MX: { name: 'Mexico' },
};

// Every real country, from the runtime's own ICU data: no hand-kept world list.
const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });
const NOT_COUNTRIES = new Set([
  'EU',
  'UN',
  'EZ',
  'ZZ',
  'QO',
  'AC',
  'CP',
  'DG',
  'EA',
  'IC',
  'TA',
  'XA',
  'XB',
]);
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const COUNTRY_CODES: [CountryCode, ...CountryCode[]] = (() => {
  const all: CountryCode[] = [];
  for (const a of LETTERS)
    for (const b of LETTERS) {
      const code = a + b;
      if (NOT_COUNTRIES.has(code)) continue;
      let name: string | undefined;
      try {
        name = REGION_NAMES.of(code);
      } catch {
        continue;
      }
      if (name && name !== code) all.push(code);
    }
  return all as [CountryCode, ...CountryCode[]];
})();
export const isCountryCode = (code: string) =>
  COUNTRY_CODES.includes(code.toUpperCase());
/** Every name a posting may use for the country ("UAE", "United Arab Emirates"), for text matching. */
export const countryNames = (code: CountryCode): string[] => [
  ...new Set(
    [
      COUNTRIES[code]?.name,
      ...(COUNTRIES[code]?.aliases ?? []),
      REGION_NAMES.of(code),
    ].filter((n): n is string => !!n && n.length > 2),
  ),
];

export const countryName = (code: CountryCode) =>
  COUNTRIES[code]?.name ?? REGION_NAMES.of(code) ?? code;

/**
 * Countries as the lowercase names postings use, whatever form they were saved in: an ISO code ("EG", saved by
 * the assistant and the guest flow) becomes every name of that country ("egypt"); a name stays a name. Eligibility
 * compares against posting text, so a bare "eg" would never match "egypt".
 */
export function countryNamesOf(
  values: (string | null | undefined)[],
): string[] {
  const out = values.flatMap((v) => {
    const t = (v ?? '').trim();
    if (!t) return [];
    if (t.length === 2 && isCountryCode(t))
      return countryNames(t.toUpperCase());
    return [t];
  });
  return [...new Set(out.map((n) => n.toLowerCase()))];
}

const BY_NAME = new Map<string, CountryCode>();
for (const [code, { name, aliases = [] }] of Object.entries(COUNTRIES))
  for (const n of [name, ...aliases]) BY_NAME.set(n.toLowerCase(), code);
// Curated names win; every other country resolves by its English name.
for (const code of COUNTRY_CODES) {
  const n = REGION_NAMES.of(code)?.toLowerCase();
  if (n && !BY_NAME.has(n)) BY_NAME.set(n, code);
}

// Big cities people type in chat, beyond the onboarding list below.
const EXTRA_CITIES: Record<CountryCode, string[]> = {
  CA: [
    'vancouver',
    'montreal',
    'montréal',
    'calgary',
    'ottawa',
    'edmonton',
    'winnipeg',
    'quebec',
    'québec',
    'mississauga',
  ],
  US: [
    'los angeles',
    'seattle',
    'boston',
    'chicago',
    'denver',
    'atlanta',
    'dallas',
    'houston',
    'miami',
    'san diego',
    'washington',
  ],
  EG: [
    'alexandria',
    'giza',
    'mansoura',
    'tanta',
    'new cairo',
    'maadi',
    'nasr city',
    '6th of october',
    'sheikh zayed',
    'smart village',
  ],
};

const CITY = new Map<string, CountryCode>();
// "Toronto, Canada" in the onboarding list teaches us Toronto → CA.
for (const o of onboardingOptions.locations) {
  if (o.value.startsWith('remote_')) continue;
  const [city, ...rest] = o.label.split(',').map((p) => p.trim().toLowerCase());
  const code = BY_NAME.get(rest.at(-1) ?? city);
  if (code) CITY.set(city, code);
}
for (const [code, cities] of Object.entries(EXTRA_CITIES))
  for (const c of cities) CITY.set(c, code);

const CA_PROVINCE = /,\s*(ON|BC|AB|QC|MB|SK|NS|NB|NL|PE)\b/;
const US_STATE =
  /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/;

// "Toronto, Canada" / "Austin, TX" / "Cairo" / "UK" → the country, or null
// when the text names no place we recognise (e.g. "Remote").
export function resolveCountry(location: string): CountryCode | null {
  // "Dubai - United Arab Emirates (UAE)", "Remote; Canada" split the same as commas.
  const parts = location
    .split(/[,;/()–—]|\s-\s/)
    // "Remote Canada" / "Remote: US" name the country after the tag.
    .map((p) =>
      p
        .trim()
        .toLowerCase()
        .replace(/^remote\b[\s:-]*/, ''),
    )
    .filter(Boolean);
  // "Atlanta, Georgia" is a US state; "Tbilisi, Georgia" is the country.
  if (
    parts.at(-1) === 'georgia' &&
    parts.slice(0, -1).some((p) => CITY.get(p) === 'US')
  )
    return 'US';
  for (const p of [...parts].reverse()) {
    const byName = BY_NAME.get(p);
    if (byName) return byName;
  }
  if (CA_PROVINCE.test(location)) return 'CA';
  if (US_STATE.test(location)) return 'US';
  for (const p of parts) {
    const city = CITY.get(p);
    if (city) return city;
  }
  return null;
}

// Onboarding's "Remote — US" style entries say where remote work is wanted.
// ponytail: remote_mena maps to Egypt (the only MENA market with a board).
const REMOTE_PSEUDO: Record<string, CountryCode[]> = {
  remote_us: ['US'],
  remote_mena: ['EG'],
};

export function countriesOf(
  locations: string[],
  remotePseudo: string[] = [],
): CountryCode[] {
  const found = new Set<CountryCode>();
  for (const l of locations) {
    const c = resolveCountry(l);
    if (c) found.add(c);
  }
  for (const p of remotePseudo)
    for (const c of REMOTE_PSEUDO[p] ?? []) found.add(c);
  return [...found];
}

// Country is a hard control: a job somewhere else is out. Places we can't
// place (remote, blank) pass — the other filters judge those.
export function inCountries(
  location: string | null | undefined,
  countries: CountryCode[],
) {
  if (!countries.length || !location) return true;
  const c = resolveCountry(location);
  return c === null || countries.includes(c);
}

type PlaceQuery = Pick<
  DiscoveryQuery,
  'locations' | 'countries' | 'willingToRelocate'
>;

// Where to search. Relocating seekers get the countries they chose (any
// city inside them); others get their own places.
export function searchPlaces(query: PlaceQuery): string[] {
  if (query.willingToRelocate) return query.countries.map(countryName);
  if (!query.countries.length) return query.locations;
  // QC 2026-11-26: the search's countries are the places. Before, a New search for Egypt + UAE sent LinkedIn only the
  // saved "Cairo", so no UAE (or US, Canada) job ever came from it. Own cities inside those countries stay (more
  // precise); each other country is searched by name; saved cities outside them are not searched.
  const own = query.locations.filter((l) => {
    const c = resolveCountry(l);
    return !c || query.countries.includes(c);
  });
  const rest = query.countries
    .filter((c) => !own.some((l) => resolveCountry(l) === c))
    .map(countryName);
  return [...own, ...rest];
}

/**
 * How much a search grows with its markets: two countries = the usual budget, each one past that adds half, up to
 * four (2x). QC 2026-11-26: with a fixed budget, adding the US and Canada halved Egypt's and the UAE's board results.
 */
export const marketScale = (query: Pick<PlaceQuery, 'countries'>) =>
  Math.max(
    1,
    Math.min(4, new Set(query.countries.map((c) => c.toUpperCase())).size) / 2,
  );

// One place per country, for sources billed per search: two cities in one
// country shouldn't crowd out a second country.
export function primaryPlaces(query: PlaceQuery, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of searchPlaces(query)) {
    const key = resolveCountry(p) ?? p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.slice(0, max);
}

// The place to send a country-scoped board: the seeker's own city there,
// else the country itself.
export function placeIn(query: PlaceQuery, country: CountryCode) {
  if (!query.willingToRelocate) {
    const own = query.locations.find((l) => resolveCountry(l) === country);
    if (own) return own;
  }
  return countryName(country);
}
