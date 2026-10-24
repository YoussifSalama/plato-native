"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import {
  Award,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Globe2,
  Link2,
  Lock,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { OptionCombobox } from "@/app/onboarding/components/option-combobox"
import { TogglePillGroup } from "@/components/toggle-pill-group"
import { getMe, type AuthUser } from "@/lib/auth/api"
import { getProfile } from "@/lib/documents/api"
import { getPreferences, savePreferences } from "@/lib/preferences/api"
import type { JobSeekerProfile } from "@/lib/documents/schema"
import type { Preferences } from "@/lib/preferences/schema"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  WORK_MODES,
  JOB_TYPES,
  INDUSTRIES,
  ROLE_SEEDS,
  LOCATION_SEEDS,
  CURRENCIES,
  SENIORITY_LEVELS,
  YEARS_EXPERIENCE,
  AVAILABILITY,
  EMPLOYMENT_STATUS,
} from "@/lib/preference-options"
import { formatPreferenceSummary, sourceLabel } from "@/lib/preference-format"
import { distributeColors, ICON_COLORS } from "@/lib/icon-colors"
import { staggerContainer, fadeUpItem } from "@/lib/motion-variants"
import { ReadySkeleton } from "@/components/onboarding-skeletons"
import { PlatoMark } from "@/components/plato-orb"

const SUMMARY_DEFS = [
  { key: "roles", label: "Roles", icon: Briefcase },
  { key: "locations", label: "Locations", icon: MapPin },
  { key: "work_setup", label: "Work setup", icon: Building2 },
  { key: "employment_type", label: "Employment type", icon: Calendar },
  { key: "experience", label: "Experience level", icon: Award },
  { key: "availability", label: "Availability", icon: Clock },
  { key: "salary", label: "Salary expectation", icon: Wallet },
  { key: "industries", label: "Industries", icon: Building2 },
  { key: "relocation", label: "Relocation", icon: Globe2 },
  { key: "visa_sponsorship", label: "Visa sponsorship", icon: ShieldCheck },
  { key: "links", label: "Links", icon: Link2 },
  { key: "things_to_avoid", label: "Things to avoid", icon: XCircle },
] as const

type SummaryKey = (typeof SUMMARY_DEFS)[number]["key"]
const SUMMARY_COLORS = distributeColors(SUMMARY_DEFS.length)

const WHATS_NEXT = [
  { icon: Search, title: "Finding great opportunities", description: "I'm already searching thousands of jobs that fit you best." },
  { icon: Sparkles, title: "Smarter applications", description: "I'll help you tailor applications that showcase your strengths." },
  { icon: TrendingUp, title: "Better over time", description: "The more you engage, the better my recommendations become." },
]

// Names arrive in whatever case the user typed at signup.
const firstName = (full: string) => {
  const n = full.trim().split(/\s+/)[0] ?? ""
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
}

function ReadyStep() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<JobSeekerProfile | null>(null)
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<SummaryKey | null>(null)
  const [saving, setSaving] = useState(false)

  // transient drafts, only meaningful while editingKey matches
  const [draftRoles, setDraftRoles] = useState<string[]>([])
  const [draftLocations, setDraftLocations] = useState<string[]>([])
  const [draftWorkSetup, setDraftWorkSetup] = useState<string[]>([])
  const [draftEmploymentTypes, setDraftEmploymentTypes] = useState<string[]>([])
  const [draftIndustries, setDraftIndustries] = useState<string[]>([])
  const [draftSalaryMin, setDraftSalaryMin] = useState("")
  const [draftSalaryMax, setDraftSalaryMax] = useState("")
  const [draftSalaryCurrency, setDraftSalaryCurrency] = useState("EGP")
  const [draftAvoid, setDraftAvoid] = useState("")
  const [draftSeniority, setDraftSeniority] = useState("")
  const [draftYearsExperience, setDraftYearsExperience] = useState("")
  const [draftAvailability, setDraftAvailability] = useState("")
  const [draftEmploymentStatus, setDraftEmploymentStatus] = useState("")
  const [draftWillingToRelocate, setDraftWillingToRelocate] = useState(false)
  const [draftVisaSponsorship, setDraftVisaSponsorship] = useState(false)
  const [draftLinkedinUrl, setDraftLinkedinUrl] = useState("")
  const [draftGithubUrl, setDraftGithubUrl] = useState("")
  const [draftPortfolioUrl, setDraftPortfolioUrl] = useState("")

  useEffect(() => {
    Promise.all([getMe(), getProfile(), getPreferences()])
      .then(([me, p, prefs]) => {
        setUser(me)
        setProfile(p)
        setPreferences(prefs)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading || !preferences) return <ReadySkeleton />

  const flaggedCount = profile?.profile_evaluation
    ? Object.values(profile.profile_evaluation).filter((v) => v === "NEEDS_ATTENTION").length
    : 0

  const summaryValues = formatPreferenceSummary(preferences)

  function startEdit(key: SummaryKey) {
    if (!preferences) return
    setDraftRoles(preferences.roles)
    setDraftLocations(preferences.preferred_locations)
    setDraftWorkSetup(preferences.work_setup)
    setDraftEmploymentTypes(preferences.preferred_job_types)
    setDraftIndustries(preferences.preferred_industries)
    setDraftSalaryMin(preferences.salary_min?.toString() ?? "")
    setDraftSalaryMax(preferences.salary_max?.toString() ?? "")
    setDraftSalaryCurrency(preferences.salary_currency ?? "EGP")
    setDraftAvoid(preferences.things_to_avoid ?? "")
    setDraftSeniority(preferences.seniority ?? "")
    setDraftYearsExperience(preferences.years_experience ?? "")
    setDraftAvailability(preferences.availability ?? "")
    setDraftEmploymentStatus(preferences.employment_status ?? "")
    setDraftWillingToRelocate(preferences.willing_to_relocate)
    setDraftVisaSponsorship(preferences.visa_sponsorship_required)
    setDraftLinkedinUrl(preferences.linkedin_url ?? "")
    setDraftGithubUrl(preferences.github_url ?? "")
    setDraftPortfolioUrl(preferences.portfolio_url ?? "")
    setEditingKey(key)
  }

  async function saveEdit() {
    if (!preferences) return
    setSaving(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { source, ...rest } = preferences
      const updated = await savePreferences({
        ...rest,
        roles: draftRoles,
        preferred_locations: draftLocations,
        work_setup: draftWorkSetup,
        preferred_job_types: draftEmploymentTypes,
        preferred_industries: draftIndustries,
        salary_min: draftSalaryMin ? Number(draftSalaryMin) : null,
        salary_max: draftSalaryMax ? Number(draftSalaryMax) : null,
        salary_currency: draftSalaryCurrency,
        things_to_avoid: draftAvoid || null,
        seniority: draftSeniority || null,
        years_experience: draftYearsExperience || null,
        availability: draftAvailability || null,
        employment_status: draftEmploymentStatus || null,
        willing_to_relocate: draftWillingToRelocate,
        visa_sponsorship_required: draftVisaSponsorship,
        linkedin_url: draftLinkedinUrl || null,
        github_url: draftGithubUrl || null,
        portfolio_url: draftPortfolioUrl || null,
      })
      setPreferences(updated)
      setEditingKey(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        <motion.div variants={fadeUpItem} className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-foreground">
              You&apos;re all set{user ? `, ${firstName(user.full_name)}` : ""}! 🎉
            </h1>
            <p className="text-sm text-muted-foreground">
              Your career profile is ready. I&apos;ve already started finding opportunities that match you.
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5 border-success/25 bg-success-soft text-success">
            <CheckCircle2 className="size-3.5" />
            Profile completed
          </Badge>
        </motion.div>

        <motion.div variants={fadeUpItem} className="flex items-start gap-3 rounded-lg border border-primary/15 bg-primary-soft/60 p-4">
          <PlatoMark size={36} />
          <div>
            <p className="text-sm font-semibold text-foreground">Your profile is ready to go</p>
            <p className="text-xs text-muted-foreground">
              I now understand your experience, skills and what you&apos;re looking for. I&apos;ll continuously learn and
              improve your matches the more you use Plato.
            </p>
          </div>
        </motion.div>

        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">What&apos;s next?</p>
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {WHATS_NEXT.map((item) => (
              <motion.div key={item.title} variants={fadeUpItem} className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm">
                <span className="flex size-9 items-center justify-center rounded-md bg-primary-soft text-primary">
                  <item.icon className="size-4" />
                </span>
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>

        <motion.div variants={fadeUpItem} className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">I&apos;ve already started working for you</p>
          <p className="mb-3 text-xs text-muted-foreground">
            While you were setting things up, I analyzed thousands of opportunities and found some strong matches to get
            you started.
          </p>
          {flaggedCount > 0 && (
            <p className="mb-3 text-xs font-medium text-warning">
              {flaggedCount} thing{flaggedCount === 1 ? "" : "s"} in your profile may still need your attention.
            </p>
          )}
          <div className="flex items-center gap-4">
            <Link href="/jobs" className={buttonVariants({ className: "w-fit gap-2 shadow-md shadow-primary/30" })}>
              Find my jobs →
            </Link>
            <a href="/onboarding?step=2" className="text-sm text-primary hover:underline">
              Review your profile
            </a>
          </div>
        </motion.div>
      </div>

      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
        <motion.div variants={fadeUpItem} className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">Your profile summary</p>
          <p className="mb-3 text-xs text-muted-foreground">Here&apos;s what I&apos;ll use to find the best matches for you.</p>
          <ul className="flex flex-col gap-4">
            {SUMMARY_DEFS.map((def, i) => (
              <li key={def.key}>
                {editingKey === def.key ? (
                  <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/[0.03] p-3">
                    <div className="flex items-center gap-2">
                      <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${ICON_COLORS[SUMMARY_COLORS[i]]}`}>
                        <def.icon className="size-3.5" />
                      </span>
                      <p className="text-sm font-semibold text-foreground">{def.label}</p>
                    </div>
                    {def.key === "roles" && <OptionCombobox options={ROLE_SEEDS} value={draftRoles} onChange={setDraftRoles} creatable />}
                    {def.key === "locations" && (
                      <OptionCombobox options={LOCATION_SEEDS} value={draftLocations} onChange={setDraftLocations} creatable />
                    )}
                    {def.key === "work_setup" && (
                      <TogglePillGroup options={WORK_MODES} value={draftWorkSetup} onChange={setDraftWorkSetup} />
                    )}
                    {def.key === "employment_type" && (
                      <TogglePillGroup options={JOB_TYPES} value={draftEmploymentTypes} onChange={setDraftEmploymentTypes} />
                    )}
                    {def.key === "experience" && (
                      <div className="flex items-center gap-2">
                        <Select value={draftSeniority} onValueChange={(v) => v && setDraftSeniority(v)}>
                          <SelectTrigger size="sm" className="h-8 flex-1 text-sm">
                            <SelectValue placeholder="Seniority" />
                          </SelectTrigger>
                          <SelectContent>
                            {SENIORITY_LEVELS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={draftYearsExperience} onValueChange={(v) => v && setDraftYearsExperience(v)}>
                          <SelectTrigger size="sm" className="h-8 flex-1 text-sm">
                            <SelectValue placeholder="Years" />
                          </SelectTrigger>
                          <SelectContent>
                            {YEARS_EXPERIENCE.map((y) => (
                              <SelectItem key={y.value} value={y.value}>
                                {y.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {def.key === "availability" && (
                      <div className="flex items-center gap-2">
                        <Select value={draftAvailability} onValueChange={(v) => v && setDraftAvailability(v)}>
                          <SelectTrigger size="sm" className="h-8 flex-1 text-sm">
                            <SelectValue placeholder="Notice period" />
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABILITY.map((a) => (
                              <SelectItem key={a.value} value={a.value}>
                                {a.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={draftEmploymentStatus} onValueChange={(v) => v && setDraftEmploymentStatus(v)}>
                          <SelectTrigger size="sm" className="h-8 flex-1 text-sm">
                            <SelectValue placeholder="Current status" />
                          </SelectTrigger>
                          <SelectContent>
                            {EMPLOYMENT_STATUS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {def.key === "salary" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input type="number" value={draftSalaryMin} onChange={(e) => setDraftSalaryMin(e.target.value)} placeholder="Min" className="h-8 w-20 text-sm" />
                        <span className="text-muted-foreground">—</span>
                        <Input type="number" value={draftSalaryMax} onChange={(e) => setDraftSalaryMax(e.target.value)} placeholder="Max" className="h-8 w-20 text-sm" />
                        <Select value={draftSalaryCurrency} onValueChange={(v) => v && setDraftSalaryCurrency(v)}>
                          <SelectTrigger size="sm" className="h-8 shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CURRENCIES.map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                {c.value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {def.key === "industries" && (
                      <OptionCombobox options={INDUSTRIES} value={draftIndustries} onChange={setDraftIndustries} />
                    )}
                    {def.key === "relocation" && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Willing to relocate</span>
                        <Switch checked={draftWillingToRelocate} onCheckedChange={setDraftWillingToRelocate} />
                      </div>
                    )}
                    {def.key === "visa_sponsorship" && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Sponsorship required</span>
                        <Switch checked={draftVisaSponsorship} onCheckedChange={setDraftVisaSponsorship} />
                      </div>
                    )}
                    {def.key === "links" && (
                      <div className="flex flex-col gap-2">
                        <Input type="url" value={draftLinkedinUrl} onChange={(e) => setDraftLinkedinUrl(e.target.value)} placeholder="LinkedIn URL" className="h-8 text-sm" />
                        <Input type="url" value={draftGithubUrl} onChange={(e) => setDraftGithubUrl(e.target.value)} placeholder="GitHub URL" className="h-8 text-sm" />
                        <Input type="url" value={draftPortfolioUrl} onChange={(e) => setDraftPortfolioUrl(e.target.value)} placeholder="Portfolio URL" className="h-8 text-sm" />
                      </div>
                    )}
                    {def.key === "things_to_avoid" && (
                      <Textarea value={draftAvoid} onChange={(e) => setDraftAvoid(e.target.value.slice(0, 250))} className="min-h-16 text-sm" />
                    )}
                    <div className="flex justify-end gap-2 border-t border-primary/10 pt-3">
                      <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditingKey(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" disabled={saving} onClick={saveEdit}>
                        {saving ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${ICON_COLORS[SUMMARY_COLORS[i]]}`}>
                      <def.icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{def.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{summaryValues[def.key]}</p>
                      <p className="text-[11px] text-muted-foreground/70">{sourceLabel(preferences.source)}</p>
                    </div>
                    <button type="button" onClick={() => startEdit(def.key)} className="text-xs text-primary hover:underline">
                      Edit
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div variants={fadeUpItem} className="flex items-start gap-3 rounded-lg border border-success/20 bg-success-soft p-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
            <Lock className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Your data is private and secure</p>
            <p className="text-xs text-muted-foreground">Plato will never share your information without your permission.</p>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

export { ReadyStep }
