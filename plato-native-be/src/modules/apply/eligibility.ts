import { Candidate } from './apply.types';
import { normalizeCompany } from '../discovery/company';

// Should Plato apply to this job at all? Cheap, explainable rules on the
// job's own words. Deliberately conservative: only the TITLE decides stack
// and role level (a description mentions many technologies in passing).
// From the audit: a Node/React seeker was sent to Java, Engineering
// Manager, LATAM-only and US-only roles.

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

interface JobLike {
  title: string;
  description: string | null;
  location?: string | null;
}

// Technology families a title can demand, and what counts as evidence.
const STACKS: { name: string; title: RegExp; evidence: RegExp }[] = [
  {
    name: 'Java',
    title: /\bjava\b(?!\s*script)|\bspring( boot)?\b|\bj2ee\b/i,
    evidence: /\bjava\b(?!\s*script)|\bspring\b|\bkotlin\b/i,
  },
  {
    name: '.NET',
    title: /\.net\b|\bc#|\basp\.net\b|\bdotnet\b/i,
    evidence: /\.net\b|\bc#|\bdotnet\b/i,
  },
  {
    name: 'PHP',
    title: /\bphp\b|\blaravel\b|\bsymfony\b|\bwordpress\b/i,
    evidence: /\bphp\b|\blaravel\b|\bsymfony\b|\bwordpress\b/i,
  },
  {
    name: 'Python',
    title: /\bpython\b|\bdjango\b|\bflask\b/i,
    evidence: /\bpython\b|\bdjango\b|\bflask\b|\bfastapi\b/i,
  },
  {
    name: 'Ruby',
    title: /\bruby\b|\brails\b/i,
    evidence: /\bruby\b|\brails\b/i,
  },
  {
    name: 'Go',
    title: /\bgolang\b|\bgo (developer|engineer)\b/i,
    evidence: /\bgolang\b|\bgo\b/i,
  },
  {
    name: 'iOS',
    title: /\bios\b|\bswift\b/i,
    evidence: /\bios\b|\bswift\b|\bobjective-c\b/i,
  },
  {
    name: 'Android',
    title: /\bandroid\b/i,
    evidence: /\bandroid\b|\bkotlin\b/i,
  },
  { name: 'Angular', title: /\bangular\b/i, evidence: /\bangular\b/i },
  { name: 'Salesforce', title: /\bsalesforce\b/i, evidence: /\bsalesforce\b/i },
  { name: 'SAP', title: /\bsap\b|\babap\b/i, evidence: /\bsap\b|\babap\b/i },
  {
    name: 'C/C++',
    title: /\bc\+\+|\bembedded\b/i,
    evidence: /\bc\+\+|\bembedded\b/i,
  },
];

const MANAGEMENT = /\b(manager|head of|director|vp|vice president|chief)\b/i;

// --- Where the employer will hire from ------------------------------------
// Employers word this a hundred ways ("must be based in", "for engineers
// based in", "open to candidates located in", "Remote — Latin America",
// "LATAM only"). So no phrase list: a restriction is a REGION plus a
// "who may apply" CUE in the same sentence, unless the sentence is about
// the company itself (offices, clients, markets).

const LATAM = [
  'argentina',
  'bolivia',
  'brazil',
  'chile',
  'colombia',
  'costa rica',
  'cuba',
  'dominican republic',
  'ecuador',
  'el salvador',
  'guatemala',
  'honduras',
  'mexico',
  'nicaragua',
  'panama',
  'paraguay',
  'peru',
  'uruguay',
  'venezuela',
];
const EUROPE = [
  'albania',
  'austria',
  'belgium',
  'bosnia',
  'bulgaria',
  'croatia',
  'cyprus',
  'czech republic',
  'czechia',
  'denmark',
  'estonia',
  'finland',
  'france',
  'germany',
  'greece',
  'hungary',
  'iceland',
  'ireland',
  'italy',
  'latvia',
  'lithuania',
  'luxembourg',
  'malta',
  'moldova',
  'montenegro',
  'netherlands',
  'north macedonia',
  'norway',
  'poland',
  'portugal',
  'romania',
  'serbia',
  'slovakia',
  'slovenia',
  'spain',
  'sweden',
  'switzerland',
  'ukraine',
  'united kingdom',
  'uk',
];
const MENA = [
  'algeria',
  'bahrain',
  'egypt',
  'iraq',
  'jordan',
  'kuwait',
  'lebanon',
  'libya',
  'morocco',
  'oman',
  'palestine',
  'qatar',
  'saudi arabia',
  'syria',
  'tunisia',
  'united arab emirates',
  'uae',
  'yemen',
];
const AFRICA = [
  'algeria',
  'egypt',
  'ethiopia',
  'ghana',
  'kenya',
  'libya',
  'morocco',
  'nigeria',
  'rwanda',
  'senegal',
  'south africa',
  'tanzania',
  'tunisia',
  'uganda',
];
const APAC = [
  'australia',
  'bangladesh',
  'china',
  'hong kong',
  'india',
  'indonesia',
  'japan',
  'malaysia',
  'new zealand',
  'pakistan',
  'philippines',
  'singapore',
  'south korea',
  'sri lanka',
  'taiwan',
  'thailand',
  'vietnam',
];
const US = ['united states', 'usa', 'us', 'u.s.', 'u.s.a.'];

interface Region {
  name: string;
  // How the region is written in a posting.
  alias: RegExp;
  countries: string[];
}
const REGIONS: Region[] = [
  {
    name: 'Latin America',
    alias:
      /\b(latin america|latam|lat[- ]?am|south america|central america)\b/i,
    countries: LATAM,
  },
  {
    name: 'the United States',
    // "United States" and "USA" in any case; "US" only in capitals ("us" is a pronoun).
    alias:
      /\b([Uu]nited [Ss]tates|UNITED STATES|[Uu]\.[Ss]\.[Aa]?\.?|USA|[Uu]sa)\b|\bUS\b/,
    countries: US,
  },
  {
    name: 'North America',
    alias: /\bnorth america\b/i,
    countries: [...US, 'canada', 'mexico'],
  },
  { name: 'Canada', alias: /\bcanada\b/i, countries: ['canada'] },
  {
    name: 'the United Kingdom',
    alias: /\b(united kingdom|great britain)\b|\bUK\b/,
    countries: ['united kingdom', 'uk'],
  },
  {
    name: 'Europe',
    alias: /\b(europe|european union|eea)\b|\bEU\b/i,
    countries: EUROPE,
  },
  {
    name: 'EMEA',
    alias: /\bemea\b/i,
    countries: [...EUROPE, ...MENA, ...AFRICA],
  },
  {
    name: 'the Middle East / North Africa',
    alias: /\b(mena|middle east|gcc)\b/i,
    countries: MENA,
  },
  { name: 'Africa', alias: /\bafrica\b/i, countries: AFRICA },
  {
    name: 'Asia-Pacific',
    alias: /\b(apac|asia[- ]pacific|asia)\b/i,
    countries: APAC,
  },
  { name: 'India', alias: /\bindia\b/i, countries: ['india'] },
];

// "Who may apply" cues, relative to a region mention in the same sentence.
const LOCATED =
  /\b(based|located|locat(ed|ion)|resid(e|es|ing|ents?|ency)|liv(e|es|ing)|domiciled|work(ing)? from)\b/i;
const ONLY = /\bonly\b|\bexclusively\b|\brestricted to\b|\blimited to\b/i;
const OPEN_TO =
  /\b(open|available|eligible)\b[^.]{0,40}\b(to|for)\b|\bmust\b|\brequired?\b|\bneed(s)? to\b|\bshould\b/i;
const PEOPLE =
  /\b(you|candidates?|applicants?|engineers?|developers?|professionals?|talent|individuals?|people|someone|contractors?|freelancers?)\b/i;
// The sentence is about the company, not about who may apply.
const ABOUT_COMPANY =
  /\b(offices?|headquarter(s|ed)?|hq|clients?|customers?|markets?|presence|operations?|operat(e|es|ing)|expand(ing)?|users?|partners?|investors?|serv(e|es|ing))\b/i;
// "Remote — Latin America", "Remote (LATAM)", "Remote, US".
const REMOTE_TAG = (alias: string) =>
  new RegExp(
    `\\bremote\\b\\s*[-–—:(,/|]+\\s*(the\\s+)?(${alias})|(${alias})\\s*[-–—:(,/|]+\\s*\\bremote\\b|\\bremote\\b\\s+(in|within|from)\\s+(the\\s+)?(${alias})`,
    'i',
  );

// Regions a posting restricts applicants to. Empty = no restriction found.
export function regionRestrictions(text: string): Region[] {
  const found = new Set<Region>();
  // Sentences and line items; a title counts as one.
  for (const sentence of text.split(/(?<=[.!?])\s+|[\n\r;•]+/)) {
    for (const region of REGIONS) {
      if (!region.alias.test(sentence)) continue;
      const tag = REMOTE_TAG(region.alias.source).test(sentence);
      const strong = ONLY.test(sentence) || tag;
      const located = LOCATED.test(sentence);
      const gated = OPEN_TO.test(sentence) && PEOPLE.test(sentence);
      if (!strong && !located && !gated) continue;
      // "We have offices in Latin America" names the region without
      // restricting anyone. An explicit "only"/tag still wins.
      if (!strong && ABOUT_COMPANY.test(sentence) && !PEOPLE.test(sentence))
        continue;
      found.add(region);
    }
  }
  return [...found];
}

// True when the posting limits applicants to regions that do not include any
// of these (lowercase) country names. No stated restriction means it accepts them.
export function excludesCountry(
  job: { title: string; description?: string | null },
  countries: string[],
): boolean {
  const regions = regionRestrictions(`${job.title}\n${job.description ?? ''}`);
  return (
    regions.length > 0 &&
    !regions.some((r) => r.countries.some((rc) => countries.includes(rc)))
  );
}

export function checkEligibility(
  job: JobLike,
  c: Candidate,
): EligibilityResult {
  const corpus = [
    ...c.skills,
    c.headline,
    ...c.experiences.flatMap((e) => [e.title, e.description ?? '']),
  ].join(' \n ');

  for (const stack of STACKS)
    if (stack.title.test(job.title) && !stack.evidence.test(corpus))
      return {
        eligible: false,
        reason: `The title asks for ${stack.name}, which isn't in your skills or work history.`,
      };

  if (
    MANAGEMENT.test(job.title) &&
    !c.experiences.some((e) => MANAGEMENT.test(e.title))
  )
    return {
      eligible: false,
      reason: "It's a management role and your history doesn't show one.",
    };

  const countries = [c.country, ...c.preferences.workAuthorization]
    .filter(Boolean)
    .map((x) => x.toLowerCase().trim());
  // Several regions listed ("LATAM or Europe") means any of them will do.
  if (excludesCountry(job, countries)) {
    const regions = regionRestrictions(
      `${job.title}\n${job.description ?? ''}`,
    );
    return {
      eligible: false,
      reason: `The employer only takes candidates based in ${regions.map((r) => r.name).join(' or ')}.`,
    };
  }

  return { eligible: true };
}

// "Senior Java Backend Engineer | Spring Boot." and "Senior Java Backend
// Engineer | Spring Boot" are one role posted twice.
export const roleKey = (company: string, title: string) =>
  `${normalizeCompany(company).key || company}|${title}`
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, '');
