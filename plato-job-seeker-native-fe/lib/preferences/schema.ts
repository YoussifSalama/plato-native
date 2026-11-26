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
  // Left out of every search; New search shows them prefilled under Advanced. Optional on older servers.
  avoid_companies?: string[]
  avoid_words?: string[]
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
  // Optional on older servers. Period of salary_min/max; limits on the two flags above.
  salary_period?: "MONTHLY" | "YEARLY"
  relocation_note?: string | null
  sponsorship_note?: string | null
  source: "AI_SUGGESTED" | "USER_CONFIRMED"
}

export type PreferencesEditPayload = Omit<Preferences, "source">

// POST /job-seeker/preferences/estimate: open jobs that fit draft preferences, and the salary check.
export type PreferenceEstimate = {
  openJobs: number
  salary: { verdict: "ok" | "low" | "high"; monthlyUsd: number; typical: { min: number; max: number }; market: string; note: string } | null
}
