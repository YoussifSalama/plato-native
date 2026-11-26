import { z } from 'zod';
import {
  jobTypeEnum,
  workModeEnum,
  industryEnum,
  seniorityEnum,
  yearsExperienceEnum,
  availabilityEnum,
  employmentStatusEnum,
  currencyEnum,
} from '../../common/onboarding-options';

// A link the extension pastes into employers' forms: http(s) only. A missing
// scheme gets https:// ("linkedin.com/in/x" works); empty clears it.
export const webUrl = z
  .string()
  .trim()
  .max(300)
  .nullable()
  .transform((v) =>
    !v ? null : /^[a-z][a-z\d+.-]*:/i.test(v) ? v : `https://${v}`,
  )
  .refine((v) => {
    if (v === null) return true;
    try {
      const u = new URL(v);
      return /^https?:$/.test(u.protocol) && u.hostname.includes('.');
    } catch {
      return false;
    }
  }, 'Enter a web link, like https://linkedin.com/in/you');

// The AI suggestion agent's structured output. Never includes
// things_to_avoid, willing_to_relocate, visa_sponsorship_required, or the
// social/portfolio URLs — those are pure user-stated preferences or facts
// the AI has no evidentiary basis to invent from a résumé.
export const preferenceSuggestionSchema = z.object({
  roles: z.array(z.string()),
  locations: z.array(z.string()),
  work_setup: z.array(workModeEnum),
  employment_types: z.array(jobTypeEnum),
  industries: z.array(industryEnum),
  salary_min: z.number().nullable(),
  salary_max: z.number().nullable(),
  salary_currency: z.string(),
  seniority: seniorityEnum.nullable(),
  years_experience: yearsExperienceEnum.nullable(),
});

export type PreferenceSuggestion = z.infer<typeof preferenceSuggestionSchema>;

// The Continue/save body — the full, user-editable preference shape.
export const preferenceEditSchema = z
  .object({
    roles: z.array(z.string().trim().min(1).max(120)).max(30),
    preferred_locations: z.array(z.string().trim().min(1).max(120)).max(30),
    work_setup: z.array(workModeEnum).max(4),
    preferred_job_types: z.array(jobTypeEnum).max(10),
    preferred_industries: z.array(industryEnum).max(40),
    salary_min: z.number().min(0).max(1e9).nullable(),
    salary_max: z.number().min(0).max(1e9).nullable(),
    salary_currency: currencyEnum.nullable(),
    things_to_avoid: z.string().trim().max(2000).nullable(),
    seniority: seniorityEnum.nullable(),
    years_experience: yearsExperienceEnum.nullable(),
    availability: availabilityEnum.nullable(),
    employment_status: employmentStatusEnum.nullable(),
    willing_to_relocate: z.boolean(),
    visa_sponsorship_required: z.boolean(),
    linkedin_url: webUrl,
    github_url: webUrl,
    portfolio_url: webUrl,
    // Application snapshot. Optional so older clients keep saving.
    work_authorization: z.array(z.string().min(1).max(80)).max(20).optional(),
    auto_apply_consent: z.boolean().optional(),
    // Onboarding (owner screen 02). Optional so older clients keep saving.
    salary_period: z.enum(['MONTHLY', 'YEARLY']).optional(),
    relocation_note: z.string().trim().max(120).nullable().optional(),
    sponsorship_note: z.string().trim().max(120).nullable().optional(),
  })
  .refine(
    (p) =>
      p.salary_min == null ||
      p.salary_max == null ||
      p.salary_min <= p.salary_max,
    {
      path: ['salary_min'],
      message: 'The minimum salary is above the expected salary',
    },
  );

// Draft preferences, while the seeker edits them: how many open jobs fit, and
// whether the salary sits in the usual range.
export const preferenceEstimateSchema = z.object({
  roles: z.array(z.string().max(120)).max(30),
  preferred_locations: z.array(z.string().max(120)).max(30),
  work_setup: z.array(z.string()).max(4),
  willing_to_relocate: z.boolean().optional(),
  salary_min: z.number().nullable().optional(),
  salary_max: z.number().nullable().optional(),
  salary_currency: z.string().max(8).nullable().optional(),
  salary_period: z.enum(['MONTHLY', 'YEARLY']).optional(),
});

export type PreferenceEditInput = z.infer<typeof preferenceEditSchema>;
