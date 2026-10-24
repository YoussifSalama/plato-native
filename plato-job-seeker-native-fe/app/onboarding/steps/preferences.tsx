"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import {
  Award,
  Briefcase,
  Building2,
  Calendar,
  Clock,
  Globe2,
  Link2,
  Lock,
  MapPin,
  ShieldCheck,
  Sparkles,
  Stamp,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { OptionCombobox } from "@/app/onboarding/components/option-combobox"
import { TogglePillGroup } from "@/components/toggle-pill-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getPreferences, savePreferences } from "@/lib/preferences/api"
import { getIntake, saveIntake, type IntakeItem } from "@/lib/jobs/api"
import type { Preferences } from "@/lib/preferences/schema"
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
import { formatPreferenceSummary } from "@/lib/preference-format"
import { PreferencesSkeleton } from "@/components/onboarding-skeletons"
import { distributeColors, ICON_COLORS } from "@/lib/icon-colors"
import { staggerContainer, fadeUpItem } from "@/lib/motion-variants"
import { PlatoMark } from "@/components/plato-orb"
import { RequiredMark } from "@/app/onboarding/components/required-mark"

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
  { key: "work_authorization", label: "Work authorization", icon: Stamp },
  { key: "links", label: "Links", icon: Link2 },
] as const

// Countries for "where can you work without sponsorship". Derived from the
// location seeds ("City, Country") so there is one list to maintain.
const COUNTRY_SEEDS = [...new Set(LOCATION_SEEDS.map((l) => l.value.split(",").pop()!.trim()))].sort().map((c) => ({ value: c, label: c }))

const SUMMARY_COLORS = distributeColors(SUMMARY_DEFS.length)

function PreferencesStep({ onContinue }: { onContinue: () => void }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [roles, setRoles] = useState<string[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [workSetup, setWorkSetup] = useState<string[]>([])
  const [employmentTypes, setEmploymentTypes] = useState<string[]>([])
  const [industries, setIndustries] = useState<string[]>([])
  const [salaryMin, setSalaryMin] = useState<string>("")
  const [salaryMax, setSalaryMax] = useState<string>("")
  const [salaryCurrency, setSalaryCurrency] = useState<string>("EGP")
  const [thingsToAvoid, setThingsToAvoid] = useState<string>("")
  const [seniority, setSeniority] = useState<string>("")
  const [yearsExperience, setYearsExperience] = useState<string>("")
  const [availability, setAvailability] = useState<string>("")
  const [employmentStatus, setEmploymentStatus] = useState<string>("")
  const [willingToRelocate, setWillingToRelocate] = useState(false)
  const [visaSponsorshipRequired, setVisaSponsorshipRequired] = useState(false)
  const [linkedinUrl, setLinkedinUrl] = useState<string>("")
  const [githubUrl, setGithubUrl] = useState<string>("")
  const [portfolioUrl, setPortfolioUrl] = useState<string>("")
  const [workAuthorization, setWorkAuthorization] = useState<string[]>([])
  // Facts employers' forms keep asking for; answered once, reused everywhere.
  const [intake, setIntake] = useState<IntakeItem[]>([])
  const [facts, setFacts] = useState<Record<string, string>>({})

  const fieldRefs = useRef<Partial<Record<string, HTMLDivElement | null>>>({})

  useEffect(() => {
    getPreferences()
      .then((p: Preferences) => {
        setRoles(p.roles)
        setLocations(p.preferred_locations)
        setWorkSetup(p.work_setup)
        setEmploymentTypes(p.preferred_job_types)
        setIndustries(p.preferred_industries)
        setSalaryMin(p.salary_min?.toString() ?? "")
        setSalaryMax(p.salary_max?.toString() ?? "")
        setSalaryCurrency(p.salary_currency ?? "EGP")
        setThingsToAvoid(p.things_to_avoid ?? "")
        setSeniority(p.seniority ?? "")
        setYearsExperience(p.years_experience ?? "")
        setAvailability(p.availability ?? "")
        setEmploymentStatus(p.employment_status ?? "")
        setWillingToRelocate(p.willing_to_relocate)
        setVisaSponsorshipRequired(p.visa_sponsorship_required)
        setLinkedinUrl(p.linkedin_url ?? "")
        setGithubUrl(p.github_url ?? "")
        setPortfolioUrl(p.portfolio_url ?? "")
        setWorkAuthorization(p.work_authorization ?? [])
      })
      .finally(() => setLoading(false))
    getIntake()
      .then((items) => {
        setIntake(items)
        setFacts(Object.fromEntries(items.map((i) => [i.key, i.value ?? ""])))
      })
      .catch(() => setIntake([]))
  }, [])

  function scrollTo(key: string) {
    fieldRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  async function handleContinue() {
    setError(null)
    setSaving(true)
    try {
      await savePreferences({
        roles,
        preferred_locations: locations,
        work_setup: workSetup,
        preferred_job_types: employmentTypes,
        preferred_industries: industries,
        salary_min: salaryMin ? Number(salaryMin) : null,
        salary_max: salaryMax ? Number(salaryMax) : null,
        salary_currency: salaryCurrency,
        things_to_avoid: thingsToAvoid || null,
        seniority: seniority || null,
        years_experience: yearsExperience || null,
        availability: availability || null,
        employment_status: employmentStatus || null,
        willing_to_relocate: willingToRelocate,
        visa_sponsorship_required: visaSponsorshipRequired,
        linkedin_url: linkedinUrl || null,
        github_url: githubUrl || null,
        portfolio_url: portfolioUrl || null,
        work_authorization: workAuthorization,
      })
      if (intake.length) await saveIntake(Object.fromEntries(intake.map((i) => [i.key, facts[i.key]?.trim() || null])))
      onContinue()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PreferencesSkeleton />

  // The same basics the apply worker checks (backend: apply/readiness.ts).
  const missing = [
    !(salaryMin || salaryMax) && "expected salary",
    !yearsExperience && "years of experience",
    !availability && "notice period",
    workAuthorization.length === 0 && "work authorization",
  ].filter(Boolean) as string[]

  const summaryValues = formatPreferenceSummary({
    roles,
    preferred_locations: locations,
    work_setup: workSetup,
    preferred_job_types: employmentTypes,
    preferred_industries: industries,
    salary_min: salaryMin ? Number(salaryMin) : null,
    salary_max: salaryMax ? Number(salaryMax) : null,
    salary_currency: salaryCurrency,
    things_to_avoid: thingsToAvoid || null,
    seniority: seniority || null,
    years_experience: yearsExperience || null,
    availability: availability || null,
    employment_status: employmentStatus || null,
    willing_to_relocate: willingToRelocate,
    visa_sponsorship_required: visaSponsorshipRequired,
    linkedin_url: linkedinUrl || null,
    github_url: githubUrl || null,
    portfolio_url: portfolioUrl || null,
    work_authorization: workAuthorization,
  })

  return (
    <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        <motion.div variants={fadeUpItem} className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            Tell Plato what you&apos;re looking for
            <motion.span
              animate={{ rotate: [0, 15, -10, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" as const }}
            >
              <Sparkles className="size-5 text-primary" />
            </motion.span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Your preferences help me find and apply to the right opportunities for you. You can update these anytime.
          </p>
        </motion.div>

        <motion.div variants={fadeUpItem} ref={(el) => { fieldRefs.current.roles = el }} className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">Roles you&apos;re interested in</p>
          <p className="mb-2 text-xs text-muted-foreground">Select the roles that match what you want to do next.</p>
          <OptionCombobox options={ROLE_SEEDS} value={roles} onChange={setRoles} creatable placeholder="Add a role" />
        </motion.div>

        <motion.div variants={fadeUpItem} ref={(el) => { fieldRefs.current.locations = el }} className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">Locations</p>
          <p className="mb-2 text-xs text-muted-foreground">Where are you open to work?</p>
          <OptionCombobox options={LOCATION_SEEDS} value={locations} onChange={setLocations} creatable placeholder="Add a location" />
        </motion.div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <motion.div variants={fadeUpItem} ref={(el) => { fieldRefs.current.work_setup = el }} className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground">Work setup</p>
            <p className="mb-2 text-xs text-muted-foreground">What kind of work environment do you prefer?</p>
            <TogglePillGroup options={WORK_MODES} value={workSetup} onChange={setWorkSetup} />
          </motion.div>

          <motion.div variants={fadeUpItem} ref={(el) => { fieldRefs.current.employment_type = el }} className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground">Employment type</p>
            <p className="mb-2 text-xs text-muted-foreground">What type of opportunities are you looking for?</p>
            <TogglePillGroup options={JOB_TYPES} value={employmentTypes} onChange={setEmploymentTypes} />
          </motion.div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <motion.div variants={fadeUpItem} ref={(el) => { fieldRefs.current.experience = el }} className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground">
              Experience level <RequiredMark />
            </p>
            <p className="mb-2 text-xs text-muted-foreground">Your seniority and years of experience.</p>
            <div className="flex items-center gap-2">
              <Select value={seniority} onValueChange={(v) => v && setSeniority(v)}>
                <SelectTrigger size="sm" className="h-9 flex-1">
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
              <Select value={yearsExperience} onValueChange={(v) => v && setYearsExperience(v)}>
                <SelectTrigger size="sm" className="h-9 flex-1">
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
          </motion.div>

          <motion.div variants={fadeUpItem} ref={(el) => { fieldRefs.current.availability = el }} className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground">
              Availability <RequiredMark />
            </p>
            <p className="mb-2 text-xs text-muted-foreground">When can you start, and your current status?</p>
            <div className="flex items-center gap-2">
              <Select value={availability} onValueChange={(v) => v && setAvailability(v)}>
                <SelectTrigger size="sm" className="h-9 flex-1">
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
              <Select value={employmentStatus} onValueChange={(v) => v && setEmploymentStatus(v)}>
                <SelectTrigger size="sm" className="h-9 flex-1">
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
          </motion.div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <motion.div variants={fadeUpItem} ref={(el) => { fieldRefs.current.salary = el }} className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground">
              Salary expectation ({salaryCurrency}) <RequiredMark />
            </p>
            <p className="mb-2 text-xs text-muted-foreground">What&apos;s your expected monthly salary?</p>
            <div className="flex items-center gap-2">
              <Input type="number" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} placeholder="Min" className="h-9" />
              <span className="text-muted-foreground">—</span>
              <Input type="number" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} placeholder="Max" className="h-9" />
              <Select value={salaryCurrency} onValueChange={(v) => v && setSalaryCurrency(v)}>
                <SelectTrigger size="sm" className="h-9 shrink-0">
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
          </motion.div>

          <motion.div variants={fadeUpItem} ref={(el) => { fieldRefs.current.industries = el }} className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground">Industries you prefer</p>
            <p className="mb-2 text-xs text-muted-foreground">Select the industries you enjoy or have experience in.</p>
            <OptionCombobox options={INDUSTRIES} value={industries} onChange={setIndustries} placeholder="Add an industry" />
          </motion.div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <motion.div variants={fadeUpItem} ref={(el) => { fieldRefs.current.relocation = el }} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-foreground">Willing to relocate</p>
              <p className="text-xs text-muted-foreground">Open to moving for the right role.</p>
            </div>
            <Switch checked={willingToRelocate} onCheckedChange={setWillingToRelocate} />
          </motion.div>

          <motion.div variants={fadeUpItem} ref={(el) => { fieldRefs.current.visa_sponsorship = el }} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-foreground">Visa sponsorship required</p>
              <p className="text-xs text-muted-foreground">Need an employer that sponsors work visas.</p>
            </div>
            <Switch checked={visaSponsorshipRequired} onCheckedChange={setVisaSponsorshipRequired} />
          </motion.div>
        </div>

        <motion.div variants={fadeUpItem} ref={(el) => { fieldRefs.current.work_authorization = el }} className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">
            Where can you work without sponsorship? <RequiredMark />
          </p>
          <p className="mb-2 text-xs text-muted-foreground">Countries where you already have the right to work. Employers ask this on most forms.</p>
          <OptionCombobox options={COUNTRY_SEEDS} value={workAuthorization} onChange={setWorkAuthorization} creatable placeholder="Add a country" />
        </motion.div>


        {intake.length > 0 && (
          <motion.div variants={fadeUpItem} className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground">
              Questions employers keep asking <span className="font-normal text-muted-foreground">(optional)</span>
            </p>
            <p className="mb-3 text-xs text-muted-foreground">Answer once and Plato fills them on every application. Anything you leave empty, Plato will never guess.</p>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              {intake.map((item) => (
                <label key={item.key} className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-foreground">
                    {item.question}
                    {item.sensitive && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">Personal</span>}
                  </span>
                  {item.type === "choice" && item.options ? (
                    <div className="flex flex-wrap gap-1.5">
                      {item.options.map((o) => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => setFacts((f) => ({ ...f, [item.key]: f[item.key] === o ? "" : o }))}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${facts[item.key] === o ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Input
                      type={item.type === "number" ? "number" : item.type === "date" ? "date" : "text"}
                      min={item.type === "number" ? 0 : undefined}
                      value={facts[item.key] ?? ""}
                      onChange={(e) => setFacts((f) => ({ ...f, [item.key]: e.target.value }))}
                      className="h-9"
                    />
                  )}
                </label>
              ))}
            </div>
          </motion.div>
        )}

        <motion.div variants={fadeUpItem} ref={(el) => { fieldRefs.current.links = el }} className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">
            Links <span className="font-normal text-muted-foreground">(optional)</span>
          </p>
          <p className="mb-2 text-xs text-muted-foreground">LinkedIn, GitHub, or a portfolio site.</p>
          <div className="flex flex-col gap-2">
            <Input type="url" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="LinkedIn URL" className="h-9" />
            <Input type="url" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="GitHub URL" className="h-9" />
            <Input type="url" value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} placeholder="Portfolio URL" className="h-9" />
          </div>
        </motion.div>

        <motion.div variants={fadeUpItem} className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">
            Things you want to avoid <span className="font-normal text-muted-foreground">(optional)</span>
          </p>
          <p className="mb-2 text-xs text-muted-foreground">Tell me about roles, industries or environments you&apos;d rather avoid.</p>
          <Textarea
            value={thingsToAvoid}
            onChange={(e) => setThingsToAvoid(e.target.value.slice(0, 250))}
            className="min-h-20"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">{thingsToAvoid.length}/250</p>
        </motion.div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {missing.length > 0 && (
          <p className="rounded-md border border-warning/25 bg-warning-soft/60 p-3 text-sm text-foreground">
            <span className="font-semibold">Auto-apply needs {missing.length} more thing{missing.length === 1 ? "" : "s"}:</span> {missing.join(", ")}. You can continue, but applications will wait until these are filled.
          </p>
        )}

        <motion.div variants={fadeUpItem} className="flex items-center gap-4">
          <Button onClick={handleContinue} disabled={saving} className="w-fit gap-2 shadow-md shadow-primary/30">
            {saving ? "Saving…" : "Continue"}
          </Button>
          <button type="button" onClick={onContinue} className="text-sm text-muted-foreground hover:underline">
            I&apos;ll do this later
          </button>
        </motion.div>
      </div>

      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
        <motion.div variants={fadeUpItem} className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">Your preferences summary</p>
          <p className="mb-3 text-xs text-muted-foreground">You can change these anytime.</p>
          <ul className="flex flex-col gap-3">
            {SUMMARY_DEFS.map((def, i) => (
              <li key={def.key} className="flex items-start gap-3">
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${ICON_COLORS[SUMMARY_COLORS[i]]}`}>
                  <def.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{def.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{summaryValues[def.key]}</p>
                </div>
                <button type="button" onClick={() => scrollTo(def.key)} className="text-xs text-primary hover:underline">
                  Edit
                </button>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div variants={fadeUpItem} className="flex items-start gap-3 rounded-lg border border-primary/15 bg-primary-soft/60 p-4">
          <PlatoMark size={32} />
          <div>
            <p className="text-sm font-semibold text-foreground">The clearer you are, the better I can help.</p>
            <p className="text-xs text-muted-foreground">
              I&apos;ll use your preferences to search thousands of opportunities and apply to the best ones.
            </p>
          </div>
        </motion.div>

        <motion.div variants={fadeUpItem} className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          Your preferences are private
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

export { PreferencesStep }
