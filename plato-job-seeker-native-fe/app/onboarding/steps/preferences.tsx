"use client"

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react"
import { ArrowRight, Check, X } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { PreferencesSkeleton } from "@/components/onboarding-skeletons"
import { createAlert, deleteAlert, getInsights, type JobAlert } from "@/lib/insights/api"
import { getIntake, saveIntake, type IntakeItem } from "@/lib/jobs/api"
import { AVAILABILITY, YEARS_EXPERIENCE } from "@/lib/preference-options"
import { getPreferences, savePreferences } from "@/lib/preferences/api"
import type { Preferences } from "@/lib/preferences/schema"

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
const AVOID_SUGGESTIONS = ["Commission-only pay", "Night shifts", "Travel over 50%", "Unpaid test tasks", "Agencies and recruiters"]
// things_to_avoid is one text field: the chips are stored as a "; " list.
const splitAvoid = (s: string | null) => (s ?? "").split(/[;\n]/).map((x) => x.trim()).filter(Boolean)

function PreferencesStep({ onContinue, onBack }: { onContinue: () => void; onBack?: () => void }) {
  const [p, setP] = useState<Preferences | null>(null)
  const [intake, setIntake] = useState<IntakeItem[]>([])
  const [facts, setFacts] = useState<Record<string, string>>({})
  const [alerts, setAlerts] = useState<JobAlert[]>([])
  const [avoid, setAvoid] = useState<string[]>([])
  const [period, setPeriod] = useState<"month" | "year">("month")
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
  }, [])

  if (!p) return error ? <p className="text-destructive">{error}</p> : <PreferencesSkeleton />
  const set = (patch: Partial<Preferences>) => setP((cur) => (cur ? { ...cur, ...patch } : cur))
  const toggle = (key: "preferred_job_types" | "work_setup", v: string) => set({ [key]: p[key].includes(v) ? p[key].filter((x) => x !== v) : [...p[key], v] })
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
    const monthly = (v: number | null) => (v && period === "year" ? Math.round(v / 12) : v)
    try {
      await savePreferences({
        roles: p.roles,
        preferred_locations: p.preferred_locations,
        work_setup: p.work_setup,
        preferred_job_types: p.preferred_job_types,
        preferred_industries: p.preferred_industries,
        salary_min: monthly(p.salary_min),
        salary_max: monthly(p.salary_max),
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-[280px] flex-1">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-tight sm:text-[36px]">What kind of job should Plato find you?</h1>
          <p className="mt-1.5 text-[16.5px] text-text-secondary">We filled in what we could from your CV. Adjust anything, and Plato only brings you jobs that match.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-3">
            {onBack && (
              <Button variant="outline" onClick={onBack} className="h-12 rounded-xl bg-card px-6 text-[16px]">
                Back
              </Button>
            )}
            <Button data-ai="onboarding.continue" onClick={save} disabled={saving} className="h-12 gap-2 rounded-xl px-7 text-[16px]">
              {saving ? "Saving…" : "Continue"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
          <span className="text-sm text-text-secondary">You can change these any time in your profile.</span>
        </div>
      </header>
      {error && <p className="rounded-xl border border-destructive/30 bg-danger-soft p-3 text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        {/* What job */}
        <Column>
          <Group title={<>Job titles you&apos;re interested in{p.source === "AI_SUGGESTED" && <span className="text-sm font-medium text-success-ink"> · suggested from your CV</span>}</>}>
            <Removable items={p.roles} onRemove={(v) => set({ roles: p.roles.filter((x) => x !== v) })} />
            <AddInput id="pref-title" placeholder="Add a job title" hint="Enter" onAdd={(v) => set({ roles: [...new Set([...p.roles, v])] })} />
          </Group>
          <Group title="Experience level">
            <Chips>
              {LEVELS.map(([v, l]) => (
                <Chip key={v} on={level === v} onClick={() => set({ seniority: v })}>
                  {l}
                </Chip>
              ))}
            </Chips>
          </Group>
          <Group title="Job type" hint="Pick all that work for you.">
            <Chips>
              {JOB_TYPES.map(([v, l]) => (
                <Chip key={v} on={p.preferred_job_types.includes(v)} onClick={() => toggle("preferred_job_types", v)}>
                  {l}
                </Chip>
              ))}
            </Chips>
          </Group>
          <Group title="Work style">
            <Chips>
              {STYLES.map(([v, l]) => (
                <Chip key={v} on={p.work_setup.includes(v)} onClick={() => toggle("work_setup", v)}>
                  {l}
                </Chip>
              ))}
            </Chips>
          </Group>
        </Column>

        {/* Where and for how much */}
        <Column>
          <Group title="Where">
            <Removable items={p.preferred_locations} onRemove={(v) => set({ preferred_locations: p.preferred_locations.filter((x) => x !== v) })} />
            <AddInput id="pref-where" placeholder="Add a city or country, e.g. Dubai" onAdd={(v) => set({ preferred_locations: [...new Set([...p.preferred_locations, v])] })} />
          </Group>
          <Group title="Salary" hint="Put on every application that asks. Jobs clearly below your minimum are skipped.">
            <label htmlFor="pref-salary" className="text-sm font-semibold">
              Expected salary
            </label>
            <div className="flex gap-2">
              <input id="pref-salary" inputMode="numeric" value={p.salary_max ?? ""} onChange={(e) => set({ salary_max: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })} className={cn(INPUT, "min-w-0 flex-1 font-semibold")} />
              <select aria-label="Currency" value={p.salary_currency ?? "USD"} onChange={(e) => set({ salary_currency: e.target.value })} className={cn(INPUT, "w-24")}>
                {[...new Set([p.salary_currency ?? "USD", ...CURRENCIES])].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value as "month" | "year")} className={cn(INPUT, "w-32")}>
                <option value="month">per month</option>
                <option value="year">per year</option>
              </select>
            </div>
            <label htmlFor="pref-min" className="text-sm font-semibold">
              Minimum you&apos;d accept
            </label>
            <input id="pref-min" inputMode="numeric" value={p.salary_min ?? ""} onChange={(e) => set({ salary_min: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })} className={cn(INPUT, "max-w-[220px]")} />
          </Group>
          <Group title="Companies you'd love to work for" hint="Plato tells you when they post a role that fits.">
            <div className="flex flex-wrap gap-2">
              {alerts.map((a) => (
                <span key={a.id} className={CHIP_REMOVE}>
                  {a.company}
                  <button type="button" aria-label={`Stop following ${a.company}`} onClick={() => void unfollow(a)}>
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
            <AddInput id="pref-company" placeholder="Add a company" onAdd={(v) => void follow(v)} />
          </Group>
        </Column>

        {/* Answers for your applications */}
        <Column>
          <Group title="Answers for your applications" hint="Set once, so Plato never stops to ask you.">
            <div className="flex flex-col divide-y divide-divider">
              <Row label="Notice period" id="ans-notice">
                <select id="ans-notice" value={p.availability ?? ""} onChange={(e) => set({ availability: e.target.value || null })} className={INPUT}>
                  <option value="">Choose</option>
                  {AVAILABILITY.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label="Need visa sponsorship?" id="ans-visa">
                <select id="ans-visa" value={p.visa_sponsorship_required ? "yes" : "no"} onChange={(e) => set({ visa_sponsorship_required: e.target.value === "yes" })} className={INPUT}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </Row>
              <Row label="Willing to relocate?" id="ans-relocate">
                <select id="ans-relocate" value={p.willing_to_relocate ? "yes" : "no"} onChange={(e) => set({ willing_to_relocate: e.target.value === "yes" })} className={INPUT}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </Row>
              {/* Two the apply worker requires (backend apply/readiness.ts); not in the mock-up. */}
              <Row label="Years of experience" id="ans-years">
                <select id="ans-years" value={p.years_experience ?? ""} onChange={(e) => set({ years_experience: e.target.value || null })} className={INPUT}>
                  <option value="">Choose</option>
                  {YEARS_EXPERIENCE.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label} years
                    </option>
                  ))}
                </select>
              </Row>
              <Row label="Allowed to work in" id="ans-auth">
                <input id="ans-auth" value={p.work_authorization.join(", ")} onChange={(e) => set({ work_authorization: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="e.g. Egypt" className={INPUT} />
              </Row>
              {intake.map((q) => (
                <Row key={q.key} label={q.question} id={`ans-${q.key}`}>
                  {q.options?.length ? (
                    <select id={`ans-${q.key}`} value={facts[q.key] ?? ""} onChange={(e) => setFacts((f) => ({ ...f, [q.key]: e.target.value }))} className={INPUT}>
                      <option value="">Choose</option>
                      {q.options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input id={`ans-${q.key}`} type={q.type === "date" ? "date" : q.type === "number" ? "number" : "text"} value={facts[q.key] ?? ""} onChange={(e) => setFacts((f) => ({ ...f, [q.key]: e.target.value }))} className={INPUT} />
                  )}
                </Row>
              ))}
            </div>
          </Group>
          <Group title="Things to avoid" hint="Jobs with any of these never reach you.">
            <AddInput id="avoid-company" placeholder="Companies, e.g. your current employer" onAdd={(v) => setAvoid((a) => [...new Set([...a, v])])} />
            <AddInput id="avoid-industry" placeholder="Industries, e.g. gambling, tobacco" onAdd={(v) => setAvoid((a) => [...new Set([...a, v])])} />
            <div className="flex flex-wrap gap-2">
              {[...new Set([...avoid, ...AVOID_SUGGESTIONS])].map((v) => {
                const on = avoid.includes(v)
                return (
                  <button key={v} type="button" aria-pressed={on} onClick={() => setAvoid((a) => (on ? a.filter((x) => x !== v) : [...a, v]))} className={cn("rounded-full border px-3.5 py-1.5 text-[14.5px] transition-colors", on ? "border-[#f8c5c0] bg-danger-soft text-destructive" : "border-dashed text-foreground hover:border-primary-line")}>
                    {on ? v : `+ ${v}`}
                  </button>
                )
              })}
            </div>
          </Group>
        </Column>
      </div>
    </div>
  )
}

const INPUT = "h-11 w-full rounded-xl border bg-card px-3.5 text-[15px] outline-none focus:border-primary focus:ring-3 focus:ring-primary/12"
const CHIP_REMOVE = "flex items-center gap-2 rounded-full border border-primary-line bg-primary-soft px-3.5 py-1.5 text-[15px] text-primary"

function Column({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-6 rounded-[22px] border bg-card p-5">{children}</section>
}
function Group({ title, hint, children }: { title: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <h2 className="text-[17px] font-bold">{title}</h2>
        {hint && <p className="text-[14.5px] text-text-secondary">{hint}</p>}
      </div>
      {children}
    </div>
  )
}
function Chips({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("rounded-full border px-4 py-2 text-[15px] font-medium transition-colors", on ? "border-primary bg-primary text-white" : "bg-card text-foreground hover:border-primary-line")}>
      {children}
    </button>
  )
}
function Removable({ items, onRemove }: { items: string[]; onRemove: (v: string) => void }) {
  if (!items.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((v) => (
        <span key={v} className={CHIP_REMOVE}>
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onRemove(v)}>
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
    <span className="relative flex items-center">
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <input id={id} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={onKey} onBlur={add} placeholder={placeholder} className={cn(INPUT, "pr-16 placeholder:text-text-tertiary")} />
      {hint && <span className="pointer-events-none absolute right-3.5 text-xs text-text-tertiary">{hint}</span>}
      {v && !hint && <Check className="pointer-events-none absolute right-3.5 size-4 text-primary" />}
    </span>
  )
}
function Row({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-2 py-2.5 sm:grid-cols-[1fr_minmax(0,1fr)]">
      <label htmlFor={id} className="text-[15px] text-text-secondary">
        {label}
      </label>
      {children}
    </div>
  )
}

export { PreferencesStep }
