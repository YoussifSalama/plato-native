import { Agent, run } from '@openai/agents';
import { z } from 'zod';
import { metered } from '../usage/usage';
import { isCountryCode } from './countries';
import type { JobSeekerSnapshot } from './job-seeker-snapshot';

// "New search", on Start: does what the seeker set up fit their profile? A search for roles their background can't
// land spends tokens on results they can't use. When it doesn't fit, the same call proposes a search that does, from
// the profile, so "Fix it" applies at once. A guide, never a block: the seeker may search anyway.

export interface SearchDraft {
  sentence: string;
  roles: string[];
  level: 'entry' | 'mid' | 'senior' | null;
  employment: string[];
  countries: string[];
  remoteTypes: string[];
  visaSponsorshipRequired: boolean;
  // Advanced search: judged too (a keyword or a "must include" outside the profile's field is a misfit).
  advanced?: {
    residenceCountry?: string | null;
    postedWithinDays?: number | null;
    includeKeywords?: string[];
    excludeKeywords?: string[];
    excludeCompanies?: string[];
    salaryShownOnly?: boolean;
    willingToRelocate?: boolean;
  };
  salary: {
    amount: number;
    currency: string;
    period: 'MONTHLY' | 'YEARLY';
  } | null;
}

const fitSchema = z.object({
  fits: z
    .boolean()
    .describe('True unless the search clearly does not fit the profile.'),
  reasons: z
    .array(z.string())
    .describe(
      'When it does not fit: each mismatch in one short sentence the seeker reads, e.g. "Your background is backend engineering; Nurse roles need a nursing licence." Empty when it fits.',
    ),
  suggestion: z
    .object({
      sentence: z
        .string()
        .describe(
          "One or two sentences describing the search, in the seeker's voice, as they would type it.",
        ),
      roles: z
        .array(z.string())
        .describe('2-4 job titles the profile can land, recruiter wording.'),
      level: z.enum(['entry', 'mid', 'senior']),
      employment: z.array(
        z.enum(['full_time', 'contract', 'part_time', 'freelance']),
      ),
      countries: z
        .array(z.string())
        .describe(
          "ISO 3166-1 alpha-2 codes: keep the seeker's countries unless they are the problem.",
        ),
      remoteTypes: z.array(z.enum(['remote', 'hybrid', 'onsite'])),
      visaSponsorshipRequired: z.boolean(),
      postedWithinDays: z.number().int().nullable(),
      includeKeywords: z.array(z.string()),
      excludeKeywords: z.array(z.string()),
      excludeCompanies: z.array(z.string()),
      salaryShownOnly: z.boolean(),
      willingToRelocate: z.boolean(),
      salary: z
        .object({
          amount: z.number(),
          currency: z.string(),
          period: z.enum(['MONTHLY', 'YEARLY']),
        })
        .nullable(),
    })
    .nullable()
    .describe(
      'Only when it does not fit: the closest search that does, keeping every choice of the seeker that was fine.',
    ),
});
export type SearchFit = z.infer<typeof fitSchema>;

const INSTRUCTIONS = `You check a job seeker's planned job search against their profile before it runs (it costs them tokens).
It does NOT fit only when a reasonable recruiter would say the profile cannot land these jobs: a different profession or field
(a backend engineer searching nursing or accounting roles), a level far from their experience (a junior with 1 year searching
Director roles, or a 15-year lead searching internships), or pay far outside what those roles pay there. Advanced rules count too: "must include" keywords from another field (a frontend developer requiring "IFRS"), or rules so
narrow they leave almost nothing (posted within 1 day plus several must-include keywords plus salary-shown-only), are misfits;
say which rule and propose a looser value in the suggestion's sentence. Adjacent roles,
stretch-by-one-level, and any country or work mode are fine: never flag those. When unsure, it fits.
When it does not fit, propose the closest search that does: keep the seeker's countries, work mode, employment and pay when
they were not the problem; fix only what was. Write reasons and the sentence plainly, no jargon, no blame.`;

export async function checkSearchFit(
  model: string,
  snapshot: JobSeekerSnapshot,
  draft: SearchDraft,
  timeoutMs = 20_000,
): Promise<SearchFit> {
  const profile = {
    roles: snapshot.roles,
    seniority: snapshot.seniority,
    yearsExperience: snapshot.yearsExperience,
    skills: snapshot.skills.slice(0, 40),
    experiences: snapshot.experiences.slice(0, 6).map((e) => ({
      title: e.title,
      technologies: e.technologies.slice(0, 10),
      start: e.start,
      end: e.end,
    })),
    residenceCountry: snapshot.residenceCountry,
    salary: snapshot.salary,
  };
  const agent = new Agent({
    name: 'Search Fit Check',
    instructions: INSTRUCTIONS,
    model,
    outputType: fitSchema,
  });
  const result = await Promise.race([
    run(
      agent,
      JSON.stringify({
        profile,
        search: { ...draft, sentence: draft.sentence.slice(0, 600) },
      }),
    ).then((r) => metered('discovery.fit', model, r)),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('the fit check timed out')), timeoutMs),
    ),
  ]);
  return clean(
    result.finalOutput ?? { fits: true, reasons: [], suggestion: null },
  );
}

// Model output is data: a "fits" with reasons or a suggestion is still a fit; codes and titles are cleaned.
export function clean(f: SearchFit): SearchFit {
  if (f.fits) return { fits: true, reasons: [], suggestion: null };
  const s = f.suggestion;
  return {
    fits: false,
    reasons: f.reasons
      .map((r) => r.trim())
      .filter(Boolean)
      .slice(0, 4),
    suggestion: s
      ? {
          ...s,
          sentence: s.sentence.trim().slice(0, 600),
          roles: [
            ...new Set(s.roles.map((r) => r.trim()).filter(Boolean)),
          ].slice(0, 6),
          countries: [
            ...new Set(
              s.countries
                .map((c) => c.trim().toUpperCase())
                .filter(isCountryCode),
            ),
          ],
          salary:
            s.salary && s.salary.amount > 0
              ? {
                  ...s.salary,
                  currency: s.salary.currency.trim().toUpperCase().slice(0, 3),
                }
              : null,
        }
      : null,
  };
}
