import { z } from 'zod';
import {
  jobTypeEnum,
  workModeEnum,
  industryEnum,
  seniorityEnum,
  yearsExperienceEnum,
  availabilityEnum,
  employmentStatusEnum,
} from '../../common/onboarding-options';

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
export const preferenceEditSchema = z.object({
  roles: z.array(z.string()),
  preferred_locations: z.array(z.string()),
  work_setup: z.array(z.string()),
  preferred_job_types: z.array(z.string()),
  preferred_industries: z.array(z.string()),
  salary_min: z.number().nullable(),
  salary_max: z.number().nullable(),
  salary_currency: z.string().nullable(),
  things_to_avoid: z.string().nullable(),
  seniority: seniorityEnum.nullable(),
  years_experience: yearsExperienceEnum.nullable(),
  availability: availabilityEnum.nullable(),
  employment_status: employmentStatusEnum.nullable(),
  willing_to_relocate: z.boolean(),
  visa_sponsorship_required: z.boolean(),
  linkedin_url: z.union([z.string().url(), z.literal(''), z.null()]),
  github_url: z.union([z.string().url(), z.literal(''), z.null()]),
  portfolio_url: z.union([z.string().url(), z.literal(''), z.null()]),
  // Application snapshot. Optional so older clients keep saving.
  work_authorization: z.array(z.string().min(1).max(80)).max(20).optional(),
  auto_apply_consent: z.boolean().optional(),
});

export type PreferenceEditInput = z.infer<typeof preferenceEditSchema>;
