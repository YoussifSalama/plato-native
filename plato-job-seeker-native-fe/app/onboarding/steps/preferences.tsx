"use client"

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react"
import { ArrowRight, Check, X } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { PreferencesSkeleton } from "@/components/onboarding-skeletons"
import { createAlert, deleteAlert, getInsights, type JobAlert } from "@/lib/insights/api"
import { getIntake, saveIntake, type IntakeItem } from "@/lib/jobs/api"
import { AVAILABILITY, YEARS_EXPERIENCE } from "@/lib/preference-options"
import { estimatePreferences, getPreferences, savePreferences } from "@/lib/preferences/api"
import type { PreferenceEstimate, Preferences } from "@/lib/preferences/schema"
import { getProfile } from "@/lib/documents/api"
import { PlatoMark } from "@/components/plato-orb"

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

  if (!p) return error ? <p className="text-destructive">{error}</p> : <PreferencesSkeleton />
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-[280px] flex-1">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-tight sm:text-[36px]">What kind of job should Plato find you?</h1>
          <p className="mt-1.5 text-[16.5px] text-text-secondary">We filled in what we could from your CV. Adjust anything, and Plato only brings you jobs that match.</p>
          {estimate && p.roles.length > 0 && (
            <p className="mt-2 flex items-center gap-2 text-[15px] text-text-secondary" aria-live="polite">
              <PlatoMark size={20} />
              <span>
                With these settings Plato sees about <b className="text-primary">{estimate.openJobs.toLocaleString()} open jobs</b> for you right now.
                {extra && extra > 0 && missingWork ? ` Adding ${missingWork === "hybrid" ? "Hybrid" : "Remote"} would add about ${extra.toLocaleString()}.` : ""}
              </span>
            </p>
          )}
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
              <input id="pref-salary" inputMode="numeric" value={p.salary_max?.toLocaleString("en-US") ?? ""} onChange={(e) => set({ salary_max: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })} className={cn(INPUT, "min-w-0 flex-1 font-semibold")} />
              <select aria-label="Currency" value={p.salary_currency ?? "USD"} onChange={(e) => set({ salary_currency: e.target.value })} className={cn(INPUT, "w-24")}>
                {[...new Set([p.salary_currency ?? "USD", ...CURRENCIES])].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select aria-label="Period" value={p.salary_period ?? "MONTHLY"} onChange={(e) => set({ salary_period: e.target.value as "MONTHLY" | "YEARLY" })} className={cn(INPUT, "w-32")}>
                <option value="MONTHLY">per month</option>
                <option value="YEARLY">per year</option>
              </select>
            </div>
            <label htmlFor="pref-min" className="text-sm font-semibold">
              Minimum you&apos;d accept
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input id="pref-min" inputMode="numeric" value={p.salary_min?.toLocaleString("en-US") ?? ""} onChange={(e) => set({ salary_min: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })} className={cn(INPUT, "max-w-[220px] flex-1")} />
              {fact("salary_negotiable") && (
                <label className="flex items-center gap-2 text-[15px] font-medium">
                  <input type="checkbox" checked={facts.salary_negotiable === "Yes"} onChange={(e) => setFacts((f) => ({ ...f, salary_negotiable: e.target.checked ? "Yes" : "No" }))} className="size-5 accent-primary" />
                  Open to negotiation
                </label>
              )}
            </div>
            {estimate?.salary && (
              <div className="flex gap-2.5 rounded-xl border border-primary-line bg-primary-tint px-3.5 py-3 text-sm">
                <PlatoMark size={20} className="mt-px" />
                <span>
                  About ${estimate.salary.typical.min.toLocaleString()} to ${estimate.salary.typical.max.toLocaleString()} a month is the usual range for {countryNames(estimate.salary.market)}.{" "}
                  {estimate.salary.verdict === "ok" ? "Your number sits inside it." : estimate.salary.verdict === "low" ? "Your number is below it, so you may be underselling yourself." : "Your number is above it, which may filter out most jobs."}
                </span>
              </div>
            )}
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
                <select id="ans-visa" value={visa} onChange={(e) => set(e.target.value === "no" ? { visa_sponsorship_required: false, sponsorship_note: null } : e.target.value === "outside" ? { visa_sponsorship_required: true, sponsorship_note: `Only for jobs outside ${country}` } : { visa_sponsorship_required: true, sponsorship_note: null })} className={INPUT}>
                  <option value="no">No</option>
                  <option value="outside">Only outside {country}</option>
                  <option value="yes">Yes</option>
                </select>
              </Row>
              <Row label="Willing to relocate?" id="ans-relocate">
                <select id="ans-relocate" value={relocate} onChange={(e) => {
                  const r = RELOCATE.find(([v]) => v === e.target.value) ?? RELOCATE[0]
                  set({ willing_to_relocate: r[2], relocation_note: r[3] })
                }} className={INPUT}>
                  {RELOCATE.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Row>
              {fact("travel") && (
                <Row label="Travel" id="ans-travel">
                  <select id="ans-travel" value={facts.travel ?? ""} onChange={(e) => setFacts((f) => ({ ...f, travel: e.target.value }))} className={INPUT}>
                    <option value="">Choose</option>
                    {fact("travel")!.options?.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </Row>
              )}
              {fact("earliest_start_date") && (
                <Row label="Earliest start date" id="ans-start">
                  <input id="ans-start" type="date" value={facts.earliest_start_date ?? ""} onChange={(e) => setFacts((f) => ({ ...f, earliest_start_date: e.target.value }))} className={INPUT} />
                </Row>
              )}
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
            </div>
          </Group>
          {intake.some((q) => !MAIN_FACTS.includes(q.key)) && (
            <details className="group rounded-xl border px-3.5 py-2.5">
              <summary className="cursor-pointer text-[15px] font-semibold text-primary">More answers (optional)</summary>
              <p className="mt-1 text-sm text-text-secondary">Some forms ask these. Answer now or Plato asks when one does.</p>
              <div className="flex flex-col divide-y divide-divider">
              {intake.filter((q) => !MAIN_FACTS.includes(q.key)).map((q) => (
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
            </details>
          )}
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
  return <section className="flex flex-col gap-6 rounded-2xl border bg-card p-5">{children}</section>
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
