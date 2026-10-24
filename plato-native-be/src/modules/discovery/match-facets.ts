import { Prisma } from '@prisma/client';

// Postings are messy free text (`Full-time` / `FULL_TIME` / `Contractor
// Full-Time`, `Qesm El Maadi, Cairo, Egypt`…). Filters and facets share the
// same normalisation so the count shown always equals what the filter returns.

export type JobTypeKey = 'full' | 'part' | 'contract' | 'intern' | 'temporary';
export type LevelKey = 'junior' | 'mid' | 'senior';

export const JOB_TYPE_LABEL: Record<JobTypeKey, string> = {
  full: 'Full-time',
  part: 'Part-time',
  contract: 'Contract',
  intern: 'Internship',
  temporary: 'Temporary',
};

const JOB_TYPE_RX: Record<JobTypeKey, RegExp> = {
  full: /full/i,
  part: /part/i,
  contract: /contract/i,
  intern: /intern/i,
  temporary: /temp/i,
};

export const JUNIOR_WORDS = [
  'junior',
  'entry',
  'intern',
  'graduate',
  'trainee',
];
export const SENIOR_WORDS = [
  'senior',
  'lead',
  'principal',
  'staff',
  'head of',
  'architect',
  'manager',
];
const wordRx = (words: string[]) => new RegExp(words.join('|'), 'i');
const JUNIOR_RX = wordRx(JUNIOR_WORDS);
const SENIOR_RX = wordRx(SENIOR_WORDS);

export const SALARY_STEPS = [20_000, 50_000, 100_000];
export const POSTED_STEPS = [1, 3, 7, 14, 30];

export interface FacetJob {
  title: string;
  job_type: string | null;
  location: string | null;
  remote_type: string;
  salary_max: number | null;
  posted_at?: Date | null;
}

export function jobTypeOf(
  j: Pick<FacetJob, 'job_type' | 'title'>,
): JobTypeKey | null {
  const text = `${j.job_type ?? ''}`;
  if (JOB_TYPE_RX.intern.test(text) || /intern/i.test(j.title)) return 'intern';
  for (const k of ['contract', 'part', 'temporary', 'full'] as JobTypeKey[])
    if (JOB_TYPE_RX[k].test(text)) return k;
  return null;
}

export function levelOf(title: string): LevelKey {
  if (JUNIOR_RX.test(title)) return 'junior';
  if (SENIOR_RX.test(title)) return 'senior';
  return 'mid';
}

// "Qesm El Maadi, Cairo, Egypt" → tokens ["Qesm El Maadi", "Cairo", "Egypt"].
// A location filter value is "Cairo|Egypt": every token must appear.
export function locationTokens(location: string) {
  return location
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function locationMatches(location: string | null, value: string) {
  if (!location) return false;
  const hay = location.toLowerCase();
  return value
    .split('|')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

// Candidate facet values for one posting: the country, and each city/region
// segment paired with the country ("Cairo|Egypt", "New Cairo|Egypt").
export function locationFacetValues(location: string | null): string[] {
  if (!location) return [];
  const tokens = locationTokens(location);
  if (!tokens.length) return [];
  const country = tokens[tokens.length - 1];
  const out = new Set<string>([country]);
  for (const t of tokens.slice(0, -1)) out.add(`${t}|${country}`);
  return [...out];
}

export function locationLabel(value: string) {
  return value.split('|').join(', ');
}

// Prisma filters that mirror the helpers above — same precedence as
// jobTypeOf (intern > contract > part > temporary > full).
const JOB_TYPE_NEEDLE: Record<JobTypeKey, string> = {
  full: 'full',
  part: 'part',
  contract: 'contract',
  intern: 'intern',
  temporary: 'temp',
};
const JOB_TYPE_ORDER: JobTypeKey[] = [
  'intern',
  'contract',
  'part',
  'temporary',
  'full',
];
const typeContains = (key: JobTypeKey): Prisma.JobWhereInput => ({
  job_type: { contains: JOB_TYPE_NEEDLE[key], mode: 'insensitive' },
});

export function jobTypeWhere(key: JobTypeKey): Prisma.JobWhereInput {
  const higher = JOB_TYPE_ORDER.slice(0, JOB_TYPE_ORDER.indexOf(key));
  const self: Prisma.JobWhereInput =
    key === 'intern'
      ? {
          OR: [
            typeContains('intern'),
            { title: { contains: 'intern', mode: 'insensitive' } },
          ],
        }
      : typeContains(key);
  const exclusions: Prisma.JobWhereInput[] = higher.map((h) =>
    h === 'intern'
      ? {
          NOT: [
            typeContains('intern'),
            { title: { contains: 'intern', mode: 'insensitive' } },
          ],
        }
      : { NOT: typeContains(h) },
  );
  return exclusions.length ? { AND: [self, ...exclusions] } : self;
}

export function locationWhere(value: string): Prisma.JobWhereInput {
  const tokens = value
    .split('|')
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    AND: tokens.map((t) => ({
      location: { contains: t, mode: 'insensitive' as const },
    })),
  };
}

const titleHas = (words: string[]): Prisma.JobWhereInput[] =>
  words.map((w) => ({ title: { contains: w, mode: 'insensitive' } }));

export function levelWhere(level: LevelKey): Prisma.JobWhereInput {
  if (level === 'junior') return { OR: titleHas(JUNIOR_WORDS) };
  if (level === 'senior')
    return {
      AND: [{ NOT: titleHas(JUNIOR_WORDS) }, { OR: titleHas(SENIOR_WORDS) }],
    };
  return { NOT: titleHas([...JUNIOR_WORDS, ...SENIOR_WORDS]) };
}

export interface Facets {
  locations: { value: string; label: string; count: number }[];
  jobTypes: { value: JobTypeKey; label: string; count: number }[];
  levels: { value: LevelKey; label: string; count: number }[];
  remote: number;
  salary: { hasSalary: number; atLeast: { value: number; count: number }[] };
  posted: { value: number; count: number }[];
  total: number;
}

export function buildFacets(jobs: FacetJob[], now = new Date()): Facets {
  const inc = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);
  const loc = new Map<string, number>();
  const type = new Map<JobTypeKey, number>();
  const level = new Map<LevelKey, number>();
  let remote = 0;
  let hasSalary = 0;
  const atLeast = new Map<number, number>();
  const posted = new Map<number, number>();

  for (const j of jobs) {
    for (const v of locationFacetValues(j.location)) inc(loc, v);
    const t = jobTypeOf(j);
    if (t) inc(type, t);
    inc(level, levelOf(j.title));
    if (j.remote_type === 'REMOTE') remote++;
    if (j.posted_at) {
      const age = (now.getTime() - j.posted_at.getTime()) / 86_400_000;
      for (const step of POSTED_STEPS) if (age <= step) inc(posted, step);
    }
    if (j.salary_max != null) {
      hasSalary++;
      for (const step of SALARY_STEPS)
        if (j.salary_max >= step) inc(atLeast, step);
    }
  }

  return {
    total: jobs.length,
    locations: [...loc.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([value, count]) => ({ value, label: locationLabel(value), count })),
    jobTypes: (Object.keys(JOB_TYPE_LABEL) as JobTypeKey[])
      .map((value) => ({
        value,
        label: JOB_TYPE_LABEL[value],
        count: type.get(value) ?? 0,
      }))
      .filter((f) => f.count > 0),
    levels: (['junior', 'mid', 'senior'] as LevelKey[])
      .map((value) => ({
        value,
        label: {
          junior: 'Junior / Entry',
          mid: 'Mid level',
          senior: 'Senior / Lead',
        }[value],
        count: level.get(value) ?? 0,
      }))
      .filter((f) => f.count > 0),
    remote,
    posted: POSTED_STEPS.map((value) => ({
      value,
      count: posted.get(value) ?? 0,
    })),
    salary: {
      hasSalary,
      atLeast: SALARY_STEPS.map((value) => ({
        value,
        count: atLeast.get(value) ?? 0,
      })),
    },
  };
}
