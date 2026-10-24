import {
  WORK_MODES,
  JOB_TYPES,
  INDUSTRIES,
  SENIORITY_LEVELS,
  YEARS_EXPERIENCE,
  AVAILABILITY,
  EMPLOYMENT_STATUS,
} from "@/lib/preference-options"
import type { Preferences } from "@/lib/preferences/schema"

function labelFor(options: { value: string; label: string }[], value: string) {
  return options.find((o) => o.value === value)?.label ?? value
}

function formatPreferenceSummary(p: {
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
  work_authorization?: string[]
  auto_apply_consent?: boolean
}) {
  return {
    roles: p.roles.join(", ") || "Not set",
    locations: p.preferred_locations.join(", ") || "Not set",
    work_setup: p.work_setup.map((v) => labelFor(WORK_MODES, v)).join(", ") || "Not set",
    employment_type: p.preferred_job_types.map((v) => labelFor(JOB_TYPES, v)).join(", ") || "Not set",
    salary:
      p.salary_min || p.salary_max
        ? `${p.salary_min || "0"} - ${p.salary_max || "0"} ${p.salary_currency ?? "EGP"}`
        : "Not set",
    industries: p.preferred_industries.map((v) => labelFor(INDUSTRIES, v)).join(", ") || "Not set",
    things_to_avoid: p.things_to_avoid || "None",
    experience: [
      p.seniority ? labelFor(SENIORITY_LEVELS, p.seniority) : null,
      p.years_experience ? `${labelFor(YEARS_EXPERIENCE, p.years_experience)} years` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Not set",
    availability: p.availability ? labelFor(AVAILABILITY, p.availability) : "Not set",
    employment_status: p.employment_status ? labelFor(EMPLOYMENT_STATUS, p.employment_status) : "Not set",
    relocation: p.willing_to_relocate ? "Willing to relocate" : "Not willing to relocate",
    visa_sponsorship: p.visa_sponsorship_required ? "Sponsorship required" : "No sponsorship needed",
    work_authorization: p.work_authorization?.join(", ") || "Not set",
    links: [p.linkedin_url, p.github_url, p.portfolio_url].filter(Boolean).join(", ") || "Not set",
  }
}

function sourceLabel(source: Preferences["source"]) {
  return source === "AI_SUGGESTED" ? "Based on your experience" : "You set this"
}

export { labelFor, formatPreferenceSummary, sourceLabel }
