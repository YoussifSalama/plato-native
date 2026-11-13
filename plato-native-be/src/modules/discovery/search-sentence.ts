import { Agent, run } from '@openai/agents';
import { z } from 'zod';
import { metered } from '../usage/usage';
import { isCountryCode } from './countries';

// "New search": the seeker says what they want in one sentence; this fills the
// search form, and the seeker edits anything before starting. Only what the
// sentence says is filled; everything else stays null for the form's defaults.

const parsedSchema = z.object({
  polished: z
    .string()
    .describe(
      "The seeker's sentence rewritten as one or two clear, complete sentences in their own voice: roles, level, employment, where, how they work, visa and minimum pay when stated. Same meaning, nothing invented, no extra facts.",
    ),
  roles: z
    .array(z.string())
    .describe(
      'Job titles asked for, as a recruiter would title the role. Empty when none.',
    ),
  seniority: z.enum(['entry', 'mid', 'senior', 'lead']).nullable(),
  jobTypes: z.array(
    z.enum(['full_time', 'part_time', 'contract', 'internship', 'freelance']),
  ),
  countries: z
    .array(z.string())
    .describe(
      'ISO 3166-1 alpha-2 codes of where they want to work ("Saudi" = SA, "the UAE" = AE, "the Gulf" = SA, AE, QA, KW, BH, OM).',
    ),
  remoteTypes: z.array(z.enum(['remote', 'hybrid', 'onsite'])),
  visaSponsorshipRequired: z.boolean().nullable(),
  postedWithinDays: z
    .number()
    .int()
    .nullable()
    .describe(
      'Only postings from the last N days (1, 3, 7, 14 or 30), when asked; else null.',
    ),
  includeKeywords: z
    .array(z.string())
    .describe(
      'Words a job must mention (skills, tools), when asked; else empty.',
    ),
  excludeKeywords: z
    .array(z.string())
    .describe(
      'Words to keep out of job titles ("no sales roles" = Sales), when asked; else empty.',
    ),
  excludeCompanies: z
    .array(z.string())
    .describe('Companies to skip, when named; else empty.'),
  salaryShownOnly: z
    .boolean()
    .describe('True only when they ask for jobs that show a salary.'),
  willingToRelocate: z
    .boolean()
    .nullable()
    .describe(
      'True/false only when they say whether they can relocate; else null.',
    ),
  salary: z
    .object({
      amount: z.number(),
      currency: z.string().describe('ISO code, e.g. USD'),
      period: z.enum(['MONTHLY', 'YEARLY']),
    })
    .nullable()
    .describe('The minimum pay they state; null when none.'),
});
export type ParsedSearch = z.infer<typeof parsedSchema>;

const INSTRUCTIONS = `Turn a job seeker's one-sentence job search into search fields. Fill only what the sentence states or clearly implies; leave the rest empty or null. Never invent a title, country or salary. "At least $3,000 a month" is salary 3000 USD MONTHLY.`;

export const EMPTY_SEARCH: ParsedSearch = {
  polished: '',
  roles: [],
  seniority: null,
  jobTypes: [],
  countries: [],
  remoteTypes: [],
  visaSponsorshipRequired: null,
  salary: null,
  postedWithinDays: null,
  includeKeywords: [],
  excludeKeywords: [],
  excludeCompanies: [],
  salaryShownOnly: false,
  willingToRelocate: null,
};

// "Polish with AI": the seeker's CV in a few lines, so a short sentence ("frontend jobs") becomes a complete one.
export interface PolishProfile {
  roles: string[];
  seniority: string | null;
  yearsExperience: string | null;
  skills: string[];
}

const POLISH = `The seeker's profile is given. For "polished", turn even a very short sentence into a complete, strong search in
their voice: add their level and their 3-5 strongest relevant skills from the profile when the sentence does not say them,
and the roles their background fits next to the one they named. Never add a country, work mode or pay they did not state.
The fields still follow the sentence only, plus "seniority" from the profile when the sentence gives none.`;

export async function parseSearchSentence(
  model: string,
  text: string,
  timeoutMs = 15_000,
  profile?: PolishProfile,
): Promise<ParsedSearch> {
  const agent = new Agent({
    name: 'Search Sentence Parser',
    instructions: profile ? `${INSTRUCTIONS}\n${POLISH}` : INSTRUCTIONS,
    model,
    outputType: parsedSchema,
  });
  const input = profile
    ? JSON.stringify({ sentence: text.slice(0, 600), profile })
    : text.slice(0, 600);
  const result = await Promise.race([
    run(agent, input).then((r) => metered('discovery.sentence', model, r)),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('reading the sentence timed out')),
        timeoutMs,
      ),
    ),
  ]);
  return clean(result.finalOutput ?? EMPTY_SEARCH);
}

// The model's output is data: keep only real country codes, trimmed unique titles, a positive salary.
export function clean(p: ParsedSearch): ParsedSearch {
  return {
    ...p,
    polished: p.polished.trim().slice(0, 600),
    roles: [...new Set(p.roles.map((r) => r.trim()).filter(Boolean))].slice(
      0,
      8,
    ),
    countries: [
      ...new Set(
        p.countries.map((c) => c.trim().toUpperCase()).filter(isCountryCode),
      ),
    ],
    salary:
      p.salary && p.salary.amount > 0
        ? {
            ...p.salary,
            currency: p.salary.currency.trim().toUpperCase().slice(0, 3),
          }
        : null,
  };
}
