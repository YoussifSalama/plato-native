"use client"

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react"
import { ArrowRight, Ban, Briefcase, Check, ChevronRight, CircleAlert, Clock, Heart, Laptop, ListChecks, Loader2, MapPin, TrendingUp, Wallet, X, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { InfoTip } from "@/components/info-tip"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FilterChip } from "@/components/filter-controls"
import { PreferencesSkeleton } from "@/components/onboarding-skeletons"
import { createAlert, deleteAlert, getInsights, type JobAlert } from "@/lib/insights/api"
import { getIntake, saveIntake, type IntakeItem } from "@/lib/jobs/api"
import { AVAILABILITY, YEARS_EXPERIENCE } from "@/lib/preference-options"
import { estimatePreferences, getPreferences, savePreferences } from "@/lib/preferences/api"
import type { PreferenceEstimate, Preferences } from "@/lib/preferences/schema"
import { getProfile } from "@/lib/documents/api"
import { PlatoMark } from "@/components/plato-orb"
import { CARD, EmptyState, SectionHeader } from "@/components/plato-ui"

// Step 2, screen 02: three columns. What job, where and for how much, and the answers
// every application asks for. Everything saves on Continue; companies you'd love to work
// for are followed right away (they are job alerts, the same list as Following).
const LEVELS = [
  ["internship", "Internship"],
  ["entry", "Entry level"],
  ["mid", "Mid level"],
  ["senior", "Senior"],
  ["lead", "Lead / Manager"],
  ["director_plus", "Director and above"],
] as const
const JOB_TYPES = [
  ["full_time", "Full-time"],
  ["part_time", "Part-time"],
  ["contract", "Contract"],
  ["freelance", "Freelance"],
  ["internship", "Internship"],
] as const
const STYLES = [
  ["remote", "Remote"],
  ["hybrid", "Hybrid"],
  ["onsite", "On-site"],
] as const
const CURRENCIES = ["USD", "EUR", "GBP", "EGP", "SAR", "AED"]
// The owner's answers column. Visa and relocation keep their yes/no flag (what the apply
// worker reads) plus a note with the limit ("Gulf only", "only for jobs outside Egypt").
const RELOCATE = [
  ["no", "No", false, null],
  ["country", "Within my country", true, "Within my current country only"],
  ["gulf", "Gulf only", true, "Gulf countries only"],
  ["anywhere", "Anywhere", true, null],
] as const
// The salary check names markets by ISO code ("remote work from EG for SA/AE employers").
const REGION = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null
const countryNames = (s: string) => s.replace(/\b[A-Z]{2}\b/g, (c) => REGION?.of(c) ?? c).replace(/\//g, " or ")
// Shown in the answers column; every other intake question sits under "More answers".
const MAIN_FACTS = ["travel", "earliest_start_date", "salary_negotiable"]
const AVOID_SUGGESTIONS = ["Commission-only pay", "Night shifts", "Travel over 50%", "Unpaid test tasks", "Agencies and recruiters"]
// things_to_avoid is one text field: the chips are stored as a "; " list.
const splitAvoid = (s: string | null) => (s ?? "").split(/[;\n]/).map((x) => x.trim()).filter(Boolean)

function PreferencesStep({ onContinue, onBack }: { onContinue: () => void; onBack?: () => void }) {
  const [p, setP] = useState<Preferences | null>(null)
  const [intake, setIntake] = useState<IntakeItem[]>([])
  const [facts, setFacts] = useState<Record<string, string>>({})
  const [alerts, setAlerts] = useState<JobAlert[]>([])
  const [avoid, setAvoid] = useState<string[]>([])
  const [home, setHome] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<PreferenceEstimate | null>(null)
  const [extra, setExtra] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPreferences()
      .then((x) => {
        setP(x)
        setAvoid(splitAvoid(x.things_to_avoid))
      })
      .catch(() => setError("Could not load your preferences"))
    getIntake()
      .then((items) => {
        setIntake(items)
        setFacts(Object.fromEntries(items.map((i) => [i.key, i.value ?? ""])))
      })
      .catch(() => setIntake([]))
    getInsights()
      .then((i) => setAlerts(i.alerts.filter((a) => a.kind === "COMPANY")))
      .catch(() => setAlerts([]))
    getProfile()
      .then((pr) => setHome(pr.location?.country ?? null))
      .catch(() => setHome(null))
  }, [])

  // "Plato sees about N open jobs", and what adding a work style would add. Debounced.
  const draftKey = p ? JSON.stringify([p.roles, p.preferred_locations, p.work_setup, p.willing_to_relocate, p.salary_min, p.salary_max, p.salary_currency, p.salary_period]) : ""
  useEffect(() => {
    if (!p) return
    const draft = { roles: p.roles, preferred_locations: p.preferred_locations, work_setup: p.work_setup, willing_to_relocate: p.willing_to_relocate, salary_min: p.salary_min, salary_max: p.salary_max, salary_currency: p.salary_currency, salary_period: p.salary_period ?? "MONTHLY" }
    const missing = (["hybrid", "remote"] as const).find((w) => !p.work_setup.includes(w))
    const t = setTimeout(() => {
      estimatePreferences(draft)
        .then((e) => {
          setEstimate(e)
          if (!missing) return setExtra(null)
          return estimatePreferences({ ...draft, work_setup: [...draft.work_setup, missing] }).then((more) => setExtra(more.openJobs - e.openJobs))
        })
        .catch(() => setEstimate(null))
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draftKey is the draft
  }, [draftKey])

  if (!p)
    return error ? (
      <EmptyState
        icon={CircleAlert}
        title={error}
        hint="Check your connection, then try again."
        className="mx-auto mt-10 w-full max-w-md bg-card"
        action={
          <Button variant="outline" onClick={() => window.location.reload()} className="rounded-xl bg-card">
            Try again
          </Button>
        }
      />
    ) : (
      <PreferencesSkeleton />
    )
  const set = (patch: Partial<Preferences>) => setP((cur) => (cur ? { ...cur, ...patch } : cur))
  const toggle = (key: "preferred_job_types" | "work_setup", v: string) => set({ [key]: p[key].includes(v) ? p[key].filter((x) => x !== v) : [...p[key], v] })
  const country = home ?? "my country"
  const visa = !p.visa_sponsorship_required ? "no" : p.sponsorship_note ? "outside" : "yes"
  const relocate = RELOCATE.find(([, , on, note]) => on === p.willing_to_relocate && (note ?? null) === (p.relocation_note ?? null))?.[0] ?? (p.willing_to_relocate ? "anywhere" : "no")
  const fact = (k: string) => intake.find((q) => q.key === k)
  const missingWork = (["hybrid", "remote"] as const).find((w) => !p.work_setup.includes(w))
  const level = p.seniority === "manager" ? "lead" : p.seniority === "executive" ? "director_plus" : p.seniority

  async function follow(company: string) {
    try {
      await createAlert({ kind: "COMPANY", company })
      const i = await getInsights()
      setAlerts(i.alerts.filter((a) => a.kind === "COMPANY"))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not follow that company")
    }
  }
  async function unfollow(a: JobAlert) {
    setAlerts((cur) => cur.filter((x) => x.id !== a.id))
    await deleteAlert(a.id).catch(() => undefined)
  }

  async function save() {
    if (!p) return
    setError(null)
    setSaving(true)
    try {
      await savePreferences({
        roles: p.roles,
        preferred_locations: p.preferred_locations,
        work_setup: p.work_setup,
        preferred_job_types: p.preferred_job_types,
        preferred_industries: p.preferred_industries,
        salary_min: p.salary_min,
        salary_max: p.salary_max,
        salary_period: p.salary_period ?? "MONTHLY",
        relocation_note: p.relocation_note ?? null,
        sponsorship_note: p.sponsorship_note ?? null,
        salary_currency: p.salary_currency,
        things_to_avoid: avoid.join("; ") || null,
        seniority: p.seniority,
        years_experience: p.years_experience,
        availability: p.availability,
        employment_status: p.employment_status,
        willing_to_relocate: p.willing_to_relocate,
        visa_sponsorship_required: p.visa_sponsorship_required,
        linkedin_url: p.linkedin_url,
        github_url: p.github_url,
        portfolio_url: p.portfolio_url,
        work_authorization: p.work_authorization,
      })
      if (intake.length) await saveIntake(Object.fromEntries(intake.map((i) => [i.key, facts[i.key]?.trim() || null])))
      onContinue()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  const actions = (
    <div className="flex gap-3">
      {onBack && (
        <Button variant="outline" onClick={onBack} disabled={saving} className="h-12 rounded-xl bg-card px-6 text-[16px] transition-colors duration-200 hover:border-primary-line hover:text-primary">
          Back
        </Button>
      )}
      <Button data-ai="onboarding.continue" onClick={() => void save()} disabled={saving} className="group/cta h-12 gap-2 rounded-xl px-7 text-[16px] shadow-md shadow-primary/25 transition-[background-color,box-shadow] duration-200 hover:shadow-lg hover:shadow-primary/35">
        {saving && <Loader2 className="size-4 animate-spin" />}
        {saving ? "Saving…" : "Continue"}
        {!saving && <ArrowRight className="size-4 transition-transform duration-200 group-hover/cta:translate-x-0.5" />}
      </Button>
    </div>
  )

  return (
    <div data-tour-state="onboarding.preferences" className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div data-tour="onboarding-prefs-head" className="min-w-[280px] flex-1">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-tight text-balance sm:text-[36px]">What kind of job should Plato find you?</h1>
          <p className="mt-1.5 text-[16.5px] text-text-secondary">We filled in what we could from your CV. Adjust anything, and Plato only brings you jobs that match.</p>
          {estimate && p.roles.length > 0 && (
            <p className="mt-2 flex items-center gap-2 text-[15px] text-text-secondary animate-in fade-in-0 duration-300" aria-live="polite">
              <PlatoMark size={20} />
              <span>
                With these settings Plato sees about <b className="text-primary tabular-nums">{estimate.openJobs.toLocaleString()} open jobs</b> for you right now.
                {extra && extra > 0 && missingWork ? ` Adding ${missingWork === "hybrid" ? "Hybrid" : "Remote"} would add about ${extra.toLocaleString()}.` : ""}
              </span>
            </p>
          )}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {actions}
          <span className="text-sm text-text-secondary">You can change these any time in your profile.</span>
        </div>
      </header>
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        {/* What job */}
        <Column index={0} tour="onboarding-prefs-job">
          <Group icon={Briefcase} title={<span className="flex flex-wrap items-center gap-x-1.5">Job titles you&apos;re interested in<InfoTip text="Plato searches for these titles and ranks every job by how well it matches them and your skills. Your match % comes from this." label="How job titles are used" />{p.source === "AI_SUGGESTED" && <span className="text-sm font-medium text-success-ink">· suggested from your CV</span>}</span>}>
            <Removable items={p.roles} onRemove={(v) => set({ roles: p.roles.filter((x) => x !== v) })} />
            <AddInput id="pref-title" placeholder="Add a job title" hint="Enter" onAdd={(v) => set({ roles: [...new Set([...p.roles, v])] })} />
          </Group>
          <Group icon={TrendingUp} title="Experience level">
            <Chips>
              {LEVELS.map(([v, l]) => (
                <FilterChip key={v} on={level === v} onClick={() => set({ seniority: v })}>
                  {l}
                </FilterChip>
              ))}
            </Chips>
          </Group>
          <Group icon={Clock} title="Job type" hint="Pick all that work for you.">
            <Chips>
              {JOB_TYPES.map(([v, l]) => (
                <FilterChip key={v} on={p.preferred_job_types.includes(v)} onClick={() => toggle("preferred_job_types", v)}>
                  {l}
                </FilterChip>
              ))}
            </Chips>
          </Group>
          <Group icon={Laptop} title="Work style">
            <Chips>
              {STYLES.map(([v, l]) => (
                <FilterChip key={v} on={p.work_setup.includes(v)} onClick={() => toggle("work_setup", v)}>
                  {l}
                </FilterChip>
              ))}
            </Chips>
          </Group>
        </Column>

        {/* Where and for how much */}
        <Column index={1} tour="onboarding-prefs-where">
          <Group icon={MapPin} title="Where">
            <Removable items={p.preferred_locations} onRemove={(v) => set({ preferred_locations: p.preferred_locations.filter((x) => x !== v) })} />
            <AddInput id="pref-where" placeholder="Add a city or country, e.g. Dubai" onAdd={(v) => set({ preferred_locations: [...new Set([...p.preferred_locations, v])] })} />
          </Group>
          <Group icon={Wallet} title="Salary" hint="Put on every application that asks. Jobs clearly below your minimum are skipped.">
            <label htmlFor="pref-salary" className="text-sm font-semibold">
              Expected salary
            </label>
            <div className="flex gap-2">
              <Input id="pref-salary" inputMode="numeric" value={p.salary_max?.toLocaleString("en-US") ?? ""} onChange={(e) => set({ salary_max: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })} className="min-w-0 flex-1 font-semibold" />
              <FormSelect label="Currency" value={p.salary_currency ?? "USD"} onChange={(v) => set({ salary_currency: v })} options={[...new Set([p.salary_currency ?? "USD", ...CURRENCIES])].map((c) => ({ value: c, label: c }))} className="w-24" />
              <FormSelect label="Period" value={p.salary_period ?? "MONTHLY"} onChange={(v) => set({ salary_period: v as "MONTHLY" | "YEARLY" })} options={PERIODS} className="w-32" />
            </div>
            <label htmlFor="pref-min" className="text-sm font-semibold">
              Minimum you&apos;d accept
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Input id="pref-min" inputMode="numeric" value={p.salary_min?.toLocaleString("en-US") ?? ""} onChange={(e) => set({ salary_min: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })} className="max-w-[220px] flex-1" />
              {fact("salary_negotiable") && (
                <label className="flex items-center gap-2 text-[15px] font-medium">
                  <Checkbox checked={facts.salary_negotiable === "Yes"} onCheckedChange={(c) => setFacts((f) => ({ ...f, salary_negotiable: c ? "Yes" : "No" }))} />
                  Open to negotiation
                </label>
              )}
            </div>
            {estimate?.salary && (
              <div className="flex gap-2.5 rounded-xl border border-primary-line bg-primary-tint px-3.5 py-3 text-sm animate-in fade-in-0 duration-300">
                <PlatoMark size={20} className="mt-px" />
                <span>
                  About ${estimate.salary.typical.min.toLocaleString()} to ${estimate.salary.typical.max.toLocaleString()} a month is the usual range for {countryNames(estimate.salary.market)}.{" "}
                  {estimate.salary.verdict === "ok" ? "Your number sits inside it." : estimate.salary.verdict === "low" ? "Your number is below it, so you may be underselling yourself." : "Your number is above it, which may filter out most jobs."}
                </span>
              </div>
            )}
          </Group>
          <Group icon={Heart} title="Companies you'd love to work for" hint="Plato tells you when they post a role that fits.">
            <div className="flex flex-wrap gap-2">
              {alerts.map((a) => (
                <span key={a.id} className={CHIP_REMOVE}>
                  {a.company}
                  <button type="button" aria-label={`Stop following ${a.company}`} onClick={() => void unfollow(a)} className="-my-1.5 -mr-2 rounded-full p-1.5 transition-colors duration-200 hover:bg-primary/10">
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
            <AddInput id="pref-company" placeholder="Add a company" onAdd={(v) => void follow(v)} />
          </Group>
        </Column>

        {/* Answers for your applications */}
        <Column index={2} tour="onboarding-prefs-answers">
          <Group icon={ListChecks} title="Answers for your applications" hint="Set once, so Plato never stops to ask you.">
            <div className="flex flex-col divide-y divide-divider">
              <Row label="Notice period" id="ans-notice">
                <FormSelect id="ans-notice" value={p.availability ?? ""} onChange={(v) => set({ availability: v || null })} options={AVAILABILITY} optional />
              </Row>
              <Row label="Need visa sponsorship?" id="ans-visa">
                <FormSelect id="ans-visa" value={visa} onChange={(v) => set(v === "no" ? { visa_sponsorship_required: false, sponsorship_note: null } : v === "outside" ? { visa_sponsorship_required: true, sponsorship_note: `Only for jobs outside ${country}` } : { visa_sponsorship_required: true, sponsorship_note: null })} options={[{ value: "no", label: "No" }, { value: "outside", label: `Only outside ${country}` }, { value: "yes", label: "Yes" }]} />
              </Row>
              <Row label="Willing to relocate?" id="ans-relocate">
                <FormSelect id="ans-relocate" value={relocate} onChange={(v) => {
                  const r = RELOCATE.find(([k]) => k === v) ?? RELOCATE[0]
                  set({ willing_to_relocate: r[2], relocation_note: r[3] })
                }} options={RELOCATE.map(([v, l]) => ({ value: v, label: l }))} />
              </Row>
              {fact("travel") && (
                <Row label="Travel" id="ans-travel">
                  <FormSelect id="ans-travel" value={facts.travel ?? ""} onChange={(v) => setFacts((f) => ({ ...f, travel: v }))} options={(fact("travel")!.options ?? []).map((o) => ({ value: o, label: o }))} optional />
                </Row>
              )}
              {fact("earliest_start_date") && (
                <Row label="Earliest start date" id="ans-start">
                  <Input id="ans-start" type="date" value={facts.earliest_start_date ?? ""} onChange={(e) => setFacts((f) => ({ ...f, earliest_start_date: e.target.value }))} />
                </Row>
              )}
              {/* Two the apply worker requires (backend apply/readiness.ts); not in the mock-up. */}
              <Row label="Years of experience" id="ans-years">
                <FormSelect id="ans-years" value={p.years_experience ?? ""} onChange={(v) => set({ years_experience: v || null })} options={YEARS_EXPERIENCE.map((o) => ({ value: o.value, label: `${o.label} years` }))} optional />
              </Row>
              <Row label="Allowed to work in" tip={<InfoTip text="Countries where you are already allowed to work, with no sponsorship needed. Plato uses it to answer work-authorization questions on application forms." label="What Allowed to work in is for" />} id="ans-auth">
                <Input id="ans-auth" value={p.work_authorization.join(", ")} onChange={(e) => set({ work_authorization: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="e.g. Egypt" />
              </Row>
            </div>
          </Group>
          {intake.some((q) => !MAIN_FACTS.includes(q.key)) && (
            <details className="group rounded-xl border px-3.5 py-2.5 transition-colors duration-200 hover:border-primary-line open:border-primary-line">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[15px] font-semibold text-primary [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 transition-transform duration-200 group-open:rotate-90" />
                More answers (optional)
              </summary>
              <p className="mt-1 text-sm text-text-secondary">Some forms ask these. Answer now or Plato asks when one does.</p>
              <div className="flex flex-col divide-y divide-divider">
              {intake.filter((q) => !MAIN_FACTS.includes(q.key)).map((q) => (
                <Row key={q.key} label={q.question} id={`ans-${q.key}`}>
                  {q.options?.length ? (
                    <FormSelect id={`ans-${q.key}`} value={facts[q.key] ?? ""} onChange={(v) => setFacts((f) => ({ ...f, [q.key]: v }))} options={q.options.map((o) => ({ value: o, label: o }))} optional />
                  ) : (
                    <Input id={`ans-${q.key}`} type={q.type === "date" ? "date" : q.type === "number" ? "number" : "text"} value={facts[q.key] ?? ""} onChange={(e) => setFacts((f) => ({ ...f, [q.key]: e.target.value }))} />
                  )}
                </Row>
              ))}
              </div>
            </details>
          )}
          <Group icon={Ban} title="Things to avoid" hint="Jobs with any of these never reach you.">
            <AddInput id="avoid-company" placeholder="Companies, e.g. your current employer" onAdd={(v) => setAvoid((a) => [...new Set([...a, v])])} />
            <AddInput id="avoid-industry" placeholder="Industries, e.g. gambling, tobacco" onAdd={(v) => setAvoid((a) => [...new Set([...a, v])])} />
            <div className="flex flex-wrap gap-2">
              {[...new Set([...avoid, ...AVOID_SUGGESTIONS])].map((v) => {
                const on = avoid.includes(v)
                return (
                  <FilterChip key={v} on={on} onClick={() => setAvoid((a) => (on ? a.filter((x) => x !== v) : [...a, v]))}>
                    {on ? v : `+ ${v}`}
                  </FilterChip>
                )
              })}
            </div>
          </Group>
        </Column>
      </div>
      {/* The page is long; the same actions again where reading ends. */}
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex justify-end">{actions}</div>
    </div>
  )
}

const PERIODS = [
  { value: "MONTHLY", label: "per month" },
  { value: "YEARLY", label: "per year" },
]
const CHIP_REMOVE = "flex items-center gap-2 rounded-full border border-primary-line bg-primary-soft px-3.5 py-1.5 text-[15px] text-primary animate-in fade-in-0 zoom-in-95 duration-200"

// The three columns fade up one after another.
function Column({ index, tour, children }: { index: number; tour?: string; children: ReactNode }) {
  return (
    <section data-tour={tour} className={cn(CARD, "flex flex-col gap-6 p-5 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500")} style={{ animationDelay: `${index * 80}ms` }}>
      {children}
    </section>
  )
}
// A group's title with its icon, the same header every page uses, and the hint under it.
function Group({ icon, title, hint, children }: { icon: LucideIcon; title: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <SectionHeader icon={icon} accent="cobalt" title={title} />
        {hint && <p className="pl-[42px] text-[14.5px] text-text-secondary">{hint}</p>}
      </div>
      {children}
    </div>
  )
}
// A failed load or save: white with a thin red edge, never a red block.
function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-l-[3px] border-l-destructive bg-card p-3 text-sm text-destructive shadow-card animate-in fade-in-0 duration-200">
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  )
}
function Chips({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}
// One dropdown for the form. `optional` adds a "Choose" entry that clears the answer ("").
function FormSelect({ id, label, value, onChange, options, optional, className }: { id?: string; label?: string; value: string; onChange: (v: string) => void; options: readonly { value: string; label: string }[]; optional?: boolean; className?: string }) {
  const items = optional ? [{ value: null, label: "Choose" }, ...options] : options
  return (
    <Select items={items} value={value || null} onValueChange={(v) => onChange((v as string | null) ?? "")}>
      <SelectTrigger id={id} aria-label={label} className={cn("w-full", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value ?? ""} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
function Removable({ items, onRemove }: { items: string[]; onRemove: (v: string) => void }) {
  if (!items.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((v) => (
        <span key={v} className={CHIP_REMOVE}>
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onRemove(v)} className="-my-1.5 -mr-2 rounded-full p-1.5 transition-colors duration-200 hover:bg-primary/10">
            <X className="size-3.5" />
          </button>
        </span>
      ))}
    </div>
  )
}
function AddInput({ id, placeholder, hint, onAdd }: { id: string; placeholder: string; hint?: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState("")
  const add = () => {
    const t = v.trim()
    if (t) onAdd(t)
    setV("")
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      add()
    }
  }
  return (
    <InputGroup>
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <InputGroupInput id={id} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={onKey} onBlur={add} placeholder={placeholder} />
      {(hint || v) && (
        <InputGroupAddon align="inline-end">
          {hint ? <span className="text-xs font-normal text-text-tertiary">{hint}</span> : <Check className="text-primary" />}
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}
function Row({ label, tip, id, children }: { label: string; tip?: ReactNode; id: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-2 py-2.5 sm:grid-cols-[1fr_minmax(0,1fr)]">
      <span className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-[15px] text-text-secondary">
          {label}
        </label>
        {tip}
      </span>
      {children}
    </div>
  )
}

export { PreferencesStep }
