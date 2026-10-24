export type Preferences = {
  roles: string[]
  preferred_locations: string[]
  work_setup: string[]
  preferred_job_types: string[]
  preferred_industries: string[]
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
  things_to_avoid: string | null
  seniority: string | null
  years_experience: string | null
  availability: string | null
  employment_status: string | null
  willing_to_relocate: boolean
  visa_sponsorship_required: boolean
  linkedin_url: string | null
  github_url: string | null
  portfolio_url: string | null
  // Application snapshot: asked once so Plato never asks per job.
  work_authorization: string[]
  source: "AI_SUGGESTED" | "USER_CONFIRMED"
}

export type PreferencesEditPayload = Omit<Preferences, "source">
