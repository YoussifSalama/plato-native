"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, ChevronDown, Eye, SlidersHorizontal, Loader2, MapPin, Plus, RefreshCw, Sparkles, Tag, X } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FilterChip } from "@/components/filter-controls"
import { checkSearch, createThread, getRun, listThreads, parseSearch, previewSearch, startSearch, type DiscoveryRun, type SearchFit, type SearchPreview, type ThreadSummary } from "@/lib/jobs/api"
import { JOBS_HOME, threadHref } from "@/lib/jobs/links"
import { getPreferences, savePreferences } from "@/lib/preferences/api"
import type { Preferences } from "@/lib/preferences/schema"
import { getProfile } from "@/lib/documents/api"
import { createAlert } from "@/lib/insights/api"
import { SearchProgressCard, useRunProgress } from "../components/search-progress-card"
import { formatTokens, getTokenEstimates } from "@/lib/credits/api"

// New search (owner design, 2026-11-13): one sentence fills the details, every detail stays editable, the preview
// updates as the seeker edits, Start runs the search. Replaces searching by chat. Pay, level and visa are saved to
// preferences (ranking and the pay check read them); the rest goes to the search itself.

const REGION = new Intl.DisplayNames(["en"], {
  type: "region",
  fallback: "none",
})
const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const ALL_COUNTRIES = [...A]
  .flatMap((a) => [...A].map((b) => a + b))
  .flatMap((c) => (REGION.of(c) ? [{ code: c, name: c === "AE" ? "UAE" : REGION.of(c)! }] : []))
  .sort((x, y) => x.name.localeCompare(y.name))
const nameOf = (code: string) => ALL_COUNTRIES.find((c) => c.code === code)?.name ?? code
const codeOf = (text: string | null | undefined) => {
  const t = (text ?? "").trim().toLowerCase()
  if (!t) return null
  const alias: Record<string, string> = {
    uae: "AE",
    emirates: "AE",
    "united arab emirates": "AE",
    ksa: "SA",
    saudi: "SA",
    uk: "GB",
    britain: "GB",
    england: "GB",
    usa: "US",
    us: "US",
    america: "US",
  }
  if (alias[t]) return alias[t]
  const last = t.split(",").at(-1)!.trim()
  return ALL_COUNTRIES.find((c) => [t, last].includes(c.name.toLowerCase()) || c.code.toLowerCase() === t)?.code ?? null
}
const SUGGESTED_COUNTRIES = ["SA", "AE", "QA", "KW", "EG"]
const LEVELS = [
  { value: "entry", label: "Junior / Entry" },
  { value: "mid", label: "Mid level" },
  { value: "senior", label: "Senior / Lead" },
] as const
const EMPLOYMENT = [
  { value: "full_time", label: "Full-time" },
  { value: "contract", label: "Contract" },
  { value: "part_time", label: "Part-time" },
  { value: "freelance", label: "Freelance" },
  { value: "internship", label: "Internship" },
]
const POSTED = [
  { value: 1, label: "Last 24 hours" },
  { value: 3, label: "3 days" },
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
]
const WORK = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
]
const CURRENCIES = ["USD", "EUR", "GBP", "SAR", "AED", "QAR", "KWD", "EGP", "CAD", "AUD", "INR"]

type Draft = {
  roles: string[]
  level: "entry" | "mid" | "senior" | null
  employment: string[]
  countries: string[]
  work: string[]
  home: string | null
  visa: boolean
  pay: number | null
  currency: string
  period: "MONTHLY" | "YEARLY"
  // Advanced search: each one is a hard rule the search applies to every job.
  posted: number | null
  include: string[]
  exclude: string[]
  companies: string[]
  salaryShown: boolean
  relocate: boolean
}
const ADVANCED: Pick<Draft, "posted" | "include" | "exclude" | "companies" | "salaryShown" | "relocate"> = {
  posted: null,
  include: [],
  exclude: [],
  companies: [],
  salaryShown: false,
  relocate: false,
}
const advancedCount = (d: Draft) => [d.posted, d.include.length, d.exclude.length, d.companies.length, d.salaryShown, d.relocate].filter(Boolean).length
const levelOf = (s: string | null | undefined): Draft["level"] => (s === "internship" || s === "entry" ? "entry" : s === "mid" ? "mid" : s ? "senior" : null)
const fromPrefs = (p: Preferences | null, home: string | null): Draft => ({
  roles: (p?.roles ?? []).slice(0, 2),
  level: levelOf(p?.seniority),
  employment: (p?.preferred_job_types ?? []).filter((t) => EMPLOYMENT.some((e) => e.value === t)),
  countries: [...new Set((p?.preferred_locations ?? []).map(codeOf).filter((c): c is string => !!c))],
  work: (p?.work_setup ?? []).filter((w) => WORK.some((x) => x.value === w)),
  home,
  visa: !!p?.visa_sponsorship_required,
  pay: p?.salary_min ?? null,
  currency: p?.salary_currency ?? "USD",
  period: p?.salary_period ?? "MONTHLY",
  ...ADVANCED,
  relocate: !!p?.willing_to_relocate,
})
// Everything the search enforces, as the server takes it (start, preview and the fit check share it).
const rulesOf = (d: Draft) => ({
  level: d.level,
  salary: d.pay ? { amount: d.pay, currency: d.currency, period: d.period } : null,
  residenceCountry: d.home,
  postedWithinDays: d.posted,
  includeKeywords: d.include,
  excludeKeywords: d.exclude,
  excludeCompanies: d.companies,
  salaryShownOnly: d.salaryShown,
  willingToRelocate: d.relocate,
})
// Kept in this tab (sessionStorage) so a refresh never loses what the seeker set up: the draft while editing, and the
// started search's draft under its run id. A per-tab convenience: the search itself lives on the server.
const DRAFT_KEY = (thread?: string) => `plato:new-search:draft:${thread ?? "new"}`
const RUN_KEY = (runId: string) => `plato:new-search:run:${runId}`
type Stored = { d: Draft; sentence: string }
const readStored = (key: string): Stored | null => {
  try {
    const v = sessionStorage.getItem(key)
    return v ? (JSON.parse(v) as Stored) : null
  } catch {
    return null
  }
}
const writeStored = (key: string, v: Stored | null) => {
  try {
    if (v) sessionStorage.setItem(key, JSON.stringify(v))
    else sessionStorage.removeItem(key)
  } catch {
    /* private window or storage off: the page still works, a refresh just starts fresh */
  }
}
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("")

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-b border-divider py-3 last:border-0 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
      <span className="pt-2 text-sm text-text-secondary">{label}</span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">{children}</div>
        {hint && <p className="text-xs text-text-tertiary">{hint}</p>}
      </div>
    </div>
  )
}

// Words or names the seeker adds one by one (Enter adds; × removes).
function Tags({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return (
    <>
      {values.map((v) => (
        <FilterChip key={v} on onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
          {v}
        </FilterChip>
      ))}
      {values.length < 10 && <AddPill placeholder={placeholder} onAdd={(t) => (onChange([...new Set([...values, t])]), true)} />}
    </>
  )
}

function AddPill({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => boolean }) {
  const [v, setV] = useState("")
  const [bad, setBad] = useState(false)
  return (
    <label className={cn("flex h-9 items-center gap-1.5 rounded-full border border-dashed bg-card px-3 text-sm focus-within:border-primary", bad && "border-destructive")}>
      <Plus className="size-3.5 shrink-0 text-text-tertiary" />
      <input
        value={v}
        onChange={(e) => (setV(e.target.value), setBad(false))}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !v.trim()) return
          e.preventDefault()
          if (onAdd(v.trim())) setV("")
          else setBad(true)
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-28 bg-transparent outline-none placeholder:text-text-tertiary"
      />
    </label>
  )
}

// One reason jobs were left out: how many, in plain words, and their share of what was found.
function LeftOut({ count, label, of }: { count: number; label: string; of: number }) {
  return (
    <li className="flex flex-col gap-1.5">
      <p className="text-sm text-foreground">
        <span className="font-semibold tabular-nums">{count.toLocaleString("en-US")}</span> {label}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-danger-soft transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, of * 100))}%` }} />
      </div>
    </li>
  )
}

export default function NewSearchPage() {
  const router = useRouter()
  const params = useSearchParams()
  const threadId = params.get("thread") ?? undefined // an empty search being set up, instead of a new one
  const runParam = params.get("run") // a search started here: a refresh picks its progress back up
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [d, setD] = useState<Draft>(fromPrefs(null, null))
  const [recent, setRecent] = useState<ThreadSummary[]>([])
  const [from, setFrom] = useState<string | null>(null)
  const [sentence, setSentence] = useState("")
  const [filling, setFilling] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [filled, setFilled] = useState<null | "sentence" | "profile">(null)
  // The fit check on Start: a search the profile can't land, why, and Plato's closer one.
  const [misfit, setMisfit] = useState<SearchFit | null>(null)
  // After Start the preview card becomes the search's live progress; the results open when it is done.
  const [restored, setRestored] = useState(false) // the draft was put back (or there was none): saving may begin
  const [running, setRunning] = useState<{
    run: DiscoveryRun
    threadId: string
  } | null>(null)
  const runProgress = useRunProgress(running?.run ?? null)
  const approvedKey = useRef<string | null>(null) // a search Plato itself proposed: not checked again
  const justFixed = useRef(false)
  const [preview, setPreview] = useState<SearchPreview | null>(null)
  const [watch, setWatch] = useState(true)
  const [tokens, setTokens] = useState<{
    cost: number
    balance: number
  } | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))

  useEffect(() => {
    Promise.all([getPreferences().catch(() => null), getProfile().catch(() => null), runParam ? getRun(runParam).catch(() => null) : null]).then(([p, prof, r]) => {
      setPrefs(p)
      // What the seeker had: the started search's details, else the draft they were editing, else the profile.
      const stored = readStored(runParam ? RUN_KEY(runParam) : DRAFT_KEY(threadId))
      const q = r?.query
      const fresh = fromPrefs(p, codeOf(prof?.location?.country))
      const draft = stored?.d ? { ...fresh, ...stored.d } : fresh // an older saved draft lacks the advanced fields
      setD(
        q && !stored
          ? {
              ...draft,
              roles: (q.requestedTitles?.length ? q.requestedTitles : q.titles).slice(0, 8),
              countries: q.countries ?? draft.countries,
              work: q.remoteTypes.filter((w) => WORK.some((x) => x.value === w)),
              employment: (q.jobTypes ?? draft.employment).filter((t) => EMPLOYMENT.some((e) => e.value === t)),
            }
          : draft,
      )
      const said = stored?.sentence || q?.sentence // this tab's copy, else the one saved with the search
      if (said) {
        lastParsed.current = said.trim() // already read: no AI call to put it back
        setSentence(said)
      }
      if (r?.thread_id) setRunning({ run: r, threadId: r.thread_id })
      setRestored(true)
    })
    listThreads()
      .then((ts) => setRecent(ts.filter((t) => t.discovery_runs[0]?.query?.titles?.length).slice(0, 2)))
      .catch(() => undefined)
    getTokenEstimates()
      .then((e) =>
        setTokens({
          cost: e.estimates.find((x) => x.action === "deep_search")?.about ?? 0,
          balance: e.balance,
        }),
      )
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on load: after Start the address changes and nothing must reload
  }, [])

  // "Start from": an earlier search's details, or the roles on the profile.
  function startFrom(t: ThreadSummary | "profile") {
    if (t === "profile") {
      setFrom("profile")
      return set({ roles: (prefs?.roles ?? []).slice(0, 3) })
    }
    const q = t.discovery_runs[0]!.query
    setFrom(t.id)
    set({
      roles: (q.requestedTitles?.length ? q.requestedTitles : q.titles).slice(0, 3),
      countries: q.countries?.length ? q.countries : d.countries,
      work: q.remoteTypes?.filter((w) => WORK.some((x) => x.value === w)) ?? d.work,
    })
  }

  useEffect(() => {
    if (restored && !running) writeStored(DRAFT_KEY(threadId), { d, sentence })
  }, [d, sentence, restored, running, threadId])

  // The sentence fills the details shortly after the seeker stops typing (and at once on Enter).
  const lastParsed = useRef("")
  // polish: the AI assistant in the box rewrites the sentence clearly as well (the fields are filled either way).
  async function fill(text = sentence, polish = false) {
    const t = text.trim()
    if (t.length < 8 || (!polish && t === lastParsed.current)) return
    lastParsed.current = t
    setFilling(true)
    setError(null)
    try {
      const p = await parseSearch(t, polish) // polish: the CV completes a short sentence
      setD((x) => ({
        ...x,
        ...(p.roles.length && { roles: p.roles }),
        ...(p.seniority && {
          level: p.seniority === "lead" ? "senior" : p.seniority,
        }),
        ...(p.jobTypes.length && {
          employment: p.jobTypes.filter((j) => EMPLOYMENT.some((e) => e.value === j)),
        }),
        ...(p.countries.length && { countries: p.countries }),
        ...(p.remoteTypes.length && { work: p.remoteTypes }),
        ...(p.visaSponsorshipRequired !== null && {
          visa: p.visaSponsorshipRequired,
        }),
        ...(p.salary && {
          pay: p.salary.amount,
          currency: p.salary.currency,
          period: p.salary.period,
        }),
      }))
      setFilled("sentence")
      if (polish && p.polished) {
        lastParsed.current = p.polished // the rewritten sentence is already read
        setSentence(p.polished)
      }
      setFrom(null)
    } catch {
      setError("Plato could not read that sentence. Pick the details below instead.")
    } finally {
      setFilling(false)
    }
  }
  useEffect(() => {
    const t = setTimeout(() => void fill(), 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-armed on every keystroke; fill reads the latest sentence
  }, [sentence])

  // Live preview over Plato's own index: no AI, no tokens.
  const key = JSON.stringify(d)
  useEffect(() => {
    if (!d.roles.length) return
    const t = setTimeout(() => {
      previewSearch({
        titles: d.roles,
        countries: d.countries,
        remoteTypes: d.work,
        jobTypes: d.employment,
        visaSponsorshipRequired: d.visa,
        ...rulesOf(d),
      })
        .then(setPreview)
        .catch(() => setPreview(null))
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key covers the fields the preview reads
  }, [key])

  const roleSuggestions = useMemo(() => [...new Set([...(prefs?.roles ?? [])])].filter((r) => !d.roles.includes(r)).slice(0, 3), [prefs, d.roles])
  const countryChoices = useMemo(() => [...new Set([...d.countries, ...SUGGESTED_COUNTRIES])], [d.countries])
  // The name the sidebar will list (the server names a search by its first two roles).
  const savesAs = d.roles.length ? d.roles.slice(0, 2).join(", ") : null
  const money = (n: number) => `${d.currency === "USD" ? "$" : `${d.currency} `}${n.toLocaleString("en-US")}`
  const canStart = d.roles.length > 0 && !starting
  const pv = d.roles.length ? preview : null

  useEffect(() => {
    if (justFixed.current) {
      approvedKey.current = key
      justFixed.current = false
    }
  }, [key])

  // Start: first, does this search fit the profile? A search it can't land spends tokens on results the seeker can't
  // use, so they are told, with Plato's closer search one press away. The check failing never blocks the search.
  async function start() {
    if (approvedKey.current !== key) {
      setStarting(true)
      setError(null)
      const fit = await checkSearch({
        sentence,
        roles: d.roles,
        level: d.level,
        employment: d.employment,
        countries: d.countries,
        remoteTypes: d.work,
        visaSponsorshipRequired: d.visa,
        salary: d.pay ? { amount: d.pay, currency: d.currency, period: d.period } : null,
        advanced: {
          residenceCountry: d.home,
          postedWithinDays: d.posted,
          includeKeywords: d.include,
          excludeKeywords: d.exclude,
          excludeCompanies: d.companies,
          salaryShownOnly: d.salaryShown,
          willingToRelocate: d.relocate,
        },
      }).catch(() => null)
      if (fit && !fit.fits) {
        setStarting(false)
        return setMisfit(fit)
      }
    }
    await run()
  }

  // "Fix it with Plato AI": the whole form and the description, from the profile; the seeker reviews, then starts.
  function applyFix(f: SearchFit) {
    const s = f.suggestion
    setMisfit(null)
    if (!s) return
    justFixed.current = true
    lastParsed.current = s.sentence.trim() // the sentence below is Plato's: no need to read it again
    setSentence(s.sentence)
    setD((x) => ({
      ...x,
      roles: s.roles,
      level: s.level,
      employment: s.employment.filter((e) => EMPLOYMENT.some((m) => m.value === e)),
      countries: s.countries,
      work: s.remoteTypes,
      visa: s.visaSponsorshipRequired,
      ...(s.salary && {
        pay: s.salary.amount,
        currency: s.salary.currency,
        period: s.salary.period,
      }),
    }))
    setFilled("profile")
    setFrom(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function run() {
    setMisfit(null)
    setStarting(true)
    setError(null)
    try {
      if (prefs) {
        const { source: _source, ...rest } = prefs
        void _source
        await savePreferences({
          ...rest,
          salary_min: d.pay,
          salary_currency: d.currency,
          salary_period: d.period,
          seniority: d.level ?? rest.seniority,
          visa_sponsorship_required: d.visa,
        })
      }
      const id = threadId ?? (await createThread()).id
      const started = await startSearch({
        threadId: id,
        titles: d.roles,
        ...(sentence.trim() && { sentence: sentence.trim() }),
        ...(d.countries.length && { countries: d.countries }),
        ...(d.work.length && { remoteTypes: d.work }),
        ...(d.employment.length && { jobTypes: d.employment }),
        visaSponsorshipRequired: d.visa,
        ...rulesOf(d),
      })
      // "Alert me about new matches": new matches for this role land on Home (a job alert per role, where it's wanted).
      if (watch)
        await Promise.all(
          d.roles.slice(0, 2).map((title) =>
            createAlert({
              kind: "FIELD",
              title,
              location: d.countries.length === 1 ? nameOf(d.countries[0]!) : null,
              remote_only: d.work.length === 1 && d.work[0] === "remote",
            }).catch(() => undefined),
          ),
        )
      setRunning({ run: started, threadId: id })
      // The address carries the search, so a refresh shows its progress again instead of an empty form.
      writeStored(RUN_KEY(started.id), { d, sentence })
      writeStored(DRAFT_KEY(threadId), null)
      router.replace(`/jobs/search?thread=${id}&run=${started.id}`, { scroll: false })
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (e) {
      setError(e instanceof Error ? e.message : "The search could not start. Try again.")
      setStarting(false)
    }
  }

  return (
    <div className={PAGE}>
      <PageHeader
        crumbs={[{ label: "Jobs", href: JOBS_HOME }]}
        title={running && savesAs ? `${savesAs} search` : "New search"}
        description={
          running ? "Plato is searching every job site. You can leave and come back; it keeps going." : "Say it in one sentence. I fill in the details below, and you can change any of them."
        }
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="mb-3 flex items-center gap-2.5 text-base font-semibold">
              <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary">
                <Sparkles className="size-4" />
              </span>
              Describe the job
              {filling && <Loader2 className="size-4 animate-spin text-primary" aria-label="Filling in the details" />}
            </h2>
            <div className="relative">
              <Textarea
                value={sentence}
                onChange={(e) => setSentence(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), void fill())}
                rows={2}
                maxLength={600}
                placeholder="Presales or solutions consulting in Saudi or the UAE. Hybrid or remote, full-time, at least $3,000 a month."
                aria-label="Describe the job"
                className="resize-none rounded-xl border-primary-line pb-11 text-[15px] focus-visible:border-primary"
              />
              {/* The AI assistant in the box: a clearer sentence, and every field it states filled in. */}
              <button
                type="button"
                onClick={() => void fill(sentence, true)}
                disabled={filling || sentence.trim().length < 8}
                className="absolute right-2.5 bottom-2.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-primary-soft px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                {filling ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                Polish with AI
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-text-tertiary">Start from</span>
              {recent.map((t) => (
                <FilterChip key={t.id} on={from === t.id} onClick={() => startFrom(t)}>
                  {(t.title ?? "Search").replace(/ search$/i, "")}
                </FilterChip>
              ))}
              {(prefs?.roles.length ?? 0) > 0 && (
                <FilterChip on={from === "profile"} onClick={() => startFrom("profile")}>
                  Roles like my last job
                </FilterChip>
              )}
            </div>
          </section>

          <section className="rounded-2xl border bg-card px-5 pt-4 pb-2 shadow-card">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Search details</h2>
              {filled && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
                  <Sparkles className="size-3" /> {filled === "profile" ? "Filled in by Plato from your profile" : "Filled in from your sentence"}
                </span>
              )}
            </div>
            <Row label="Roles">
              {d.roles.map((r) => (
                <FilterChip key={r} on onClick={() => set({ roles: d.roles.filter((x) => x !== r) })} aria-label={`Remove ${r}`}>
                  {r}
                </FilterChip>
              ))}
              {roleSuggestions.map((r) => (
                <FilterChip key={r} on={false} onClick={() => set({ roles: [...d.roles, r].slice(0, 8) })}>
                  {r}
                </FilterChip>
              ))}
              {d.roles.length < 8 && <AddPill placeholder="Add a role" onAdd={(t) => (set({ roles: [...new Set([...d.roles, t])] }), true)} />}
            </Row>
            <Row label="Level" hint="Jobs clearly titled above or below it are left out. None picked: any level.">
              {LEVELS.map((l) => (
                <FilterChip key={l.value} on={d.level === l.value} onClick={() => set({ level: d.level === l.value ? null : l.value })}>
                  {l.label}
                </FilterChip>
              ))}
            </Row>
            <Row label="Employment" hint="None picked: any kind. Jobs that don’t say are kept.">
              {EMPLOYMENT.map((e) => (
                <FilterChip key={e.value} on={d.employment.includes(e.value)} onClick={() => set({ employment: toggle(d.employment, e.value) })}>
                  {e.label}
                </FilterChip>
              ))}
            </Row>
            <Row label="Work in" hint="None picked: anywhere.">
              {countryChoices.map((c) => (
                <FilterChip key={c} on={d.countries.includes(c)} onClick={() => set({ countries: toggle(d.countries, c) })}>
                  {nameOf(c)}
                </FilterChip>
              ))}
              <AddPill
                placeholder="Add a country"
                onAdd={(t) => {
                  const c = codeOf(t)
                  if (c) set({ countries: [...new Set([...d.countries, c])] })
                  return !!c
                }}
              />
            </Row>
            <Row label="How you work" hint="None picked: any setup.">
              {WORK.map((w) => (
                <FilterChip key={w.value} on={d.work.includes(w.value)} onClick={() => set({ work: toggle(d.work, w.value) })}>
                  {w.label}
                </FilterChip>
              ))}
            </Row>
            <Row label="Live in & visa" hint="Remote jobs open only to other regions are left out. With sponsorship needed, jobs that say they won’t sponsor are left out.">
              <Select
                items={ALL_COUNTRIES.map((c) => ({
                  value: c.code,
                  label: c.name,
                }))}
                value={d.home ?? ""}
                onValueChange={(v) =>
                  v &&
                  set({
                    home: v,
                    ...(d.countries.length && d.countries.every((c) => c === v) && { visa: false }),
                  })
                }
              >
                <SelectTrigger aria-label="Where you live" className="h-9 gap-1.5 rounded-full px-3 font-semibold">
                  <MapPin className="size-4 text-text-tertiary" />
                  <SelectValue placeholder="Where you live" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {ALL_COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FilterChip on={d.visa} onClick={() => set({ visa: true })}>
                Need visa sponsorship
              </FilterChip>
              <FilterChip on={!d.visa} onClick={() => set({ visa: false })}>
                Don&apos;t need it
              </FilterChip>
            </Row>
            <Row label="Minimum pay" hint="Jobs that state lower pay are left out; jobs that don’t state pay are kept.">
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={d.pay ?? ""}
                onChange={(e) =>
                  set({
                    pay: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="e.g. 3000"
                aria-label="Minimum pay"
                className="h-9 w-28 rounded-xl text-sm font-semibold tabular-nums"
              />
              <Select
                items={[...new Set([d.currency, ...CURRENCIES])].map((c) => ({
                  value: c,
                  label: c,
                }))}
                value={d.currency}
                onValueChange={(v) => v && set({ currency: v })}
              >
                <SelectTrigger aria-label="Currency" className="h-9 rounded-xl font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([d.currency, ...CURRENCIES])].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(["MONTHLY", "YEARLY"] as const).map((p) => (
                <FilterChip key={p} on={d.period === p} onClick={() => set({ period: p })}>
                  {p === "MONTHLY" ? "per month" : "per year"}
                </FilterChip>
              ))}
            </Row>

            {/* Advanced search: folded by default; every rule is enforced by the search on each job. */}
            <div className="border-t border-divider">
              <button type="button" onClick={() => setAdvancedOpen((o) => !o)} aria-expanded={advancedOpen} className="flex w-full items-center justify-between gap-2 py-3.5 text-left">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <SlidersHorizontal className="size-4 text-primary" />
                  Advanced search
                  {advancedCount(d) > 0 && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">{advancedCount(d)} on</span>}
                </span>
                <ChevronDown className={cn("size-4 text-text-tertiary transition-transform", advancedOpen && "rotate-180")} />
              </button>
              {advancedOpen && (
                <div className="-mt-1 pb-1">
                  <Row label="Posted within" hint="Older postings are left out. Postings with no date are kept.">
                    {POSTED.map((p) => (
                      <FilterChip key={p.value} on={d.posted === p.value} onClick={() => set({ posted: d.posted === p.value ? null : p.value })}>
                        {p.label}
                      </FilterChip>
                    ))}
                  </Row>
                  <Row label="Must include" hint="At least one of these words in the title or description, e.g. a skill or tool.">
                    <Tags values={d.include} onChange={(include) => set({ include })} placeholder="Add a keyword" />
                  </Row>
                  <Row label="Leave out" hint="Jobs whose title has any of these words, e.g. “PHP” or “Sales”.">
                    <Tags values={d.exclude} onChange={(exclude) => set({ exclude })} placeholder="Add a word" />
                  </Row>
                  <Row label="Skip companies" hint="No jobs from these companies.">
                    <Tags values={d.companies} onChange={(companies) => set({ companies })} placeholder="Add a company" />
                  </Row>
                  <Row label="Pay shown">
                    <FilterChip on={d.salaryShown} onClick={() => set({ salaryShown: !d.salaryShown })}>
                      Only jobs that show a salary
                    </FilterChip>
                  </Row>
                  <Row label="Relocation" hint="On: on-site jobs anywhere in the countries above, not only near you.">
                    <FilterChip on={d.relocate} onClick={() => set({ relocate: !d.relocate })}>
                      I can relocate
                    </FilterChip>
                  </Row>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-5">
          {running ? (
            <SearchProgressCard run={running.run} progress={runProgress} onDone={() => router.push(threadHref(running.threadId))} />
          ) : (
            <section className="rounded-2xl border bg-card p-5 shadow-card" aria-live="polite">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold tracking-[0.08em] text-text-tertiary uppercase">Live preview</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
                  <RefreshCw className="size-3" /> Updates as you edit
                </span>
              </div>
              {pv ? (
                <>
                  <p className="mt-3 flex items-baseline gap-2.5">
                    <span className="text-5xl font-semibold tracking-tight text-primary tabular-nums">{pv.canTake.toLocaleString("en-US")}</span>
                    <span className="text-[15px] text-text-secondary">jobs fit everything you picked</span>
                  </p>
                  <p className="mt-1 text-sm text-text-tertiary">
                    out of {pv.found.toLocaleString("en-US")} Plato already knows for {d.roles.length === 1 ? "this role" : "these roles"}
                  </p>
                  {(() => {
                    const share = (n: number) => (pv.found ? n / pv.found : 0)
                    const rows = [
                      { n: pv.relocate, label: "are in other countries or a work setup you didn’t pick" },
                      { n: pv.payBelow, label: `pay less than ${d.pay ? money(d.pay) : "your minimum"}` },
                      { n: pv.noVisa, label: "say they won’t sponsor a visa" },
                      { n: pv.other, label: "don’t meet your advanced rules" },
                    ].filter((r) => r.n > 0)
                    return rows.length ? (
                      <div className="mt-4 border-t border-divider pt-4">
                        <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-text-tertiary uppercase">Left out by your choices</p>
                        <ul className="flex flex-col gap-3.5">
                          {rows.map((r) => (
                            <LeftOut key={r.label} count={r.n} label={r.label} of={share(r.n)} />
                          ))}
                        </ul>
                      </div>
                    ) : null
                  })()}
                  {pv.top.length > 0 && (
                    <div className="mt-4 border-t border-divider pt-4">
                      <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-text-tertiary uppercase">Some of them</p>
                      <ul className="flex flex-col gap-2.5">
                        {pv.top.slice(0, 3).map((j) => (
                          <li key={j.id} className="flex items-center gap-3 text-sm">
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-xs font-semibold text-primary">{initials(j.company)}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-foreground">{j.title}</span>
                              <span className="block truncate text-xs text-text-tertiary">{[j.company, j.location].filter(Boolean).join(" · ")}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="mt-4 text-xs text-text-tertiary">From jobs Plato already knows. The search checks every job site, so it usually finds more.</p>
                </>
              ) : (
                <p className="mt-3 text-sm text-text-secondary">{d.roles.length ? "Counting…" : "Add a role, or describe the job above, to see how many jobs fit."}</p>
              )}
            </section>
          )}

          <section className="flex flex-col rounded-2xl border bg-card px-5 py-2 shadow-card">
            <label className="flex cursor-pointer items-center gap-3 py-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-text-secondary">
                <Eye className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Alert me about new matches</span>
                <span className="block text-xs text-text-tertiary">Follows these roles: new jobs that fit come to Home and your email digest, no need to search again.</span>
              </span>
              <Switch checked={watch} onCheckedChange={setWatch} aria-label="Alert me about new matches" />
            </label>
          </section>
        </aside>
      </div>

      <footer className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4">
        <Button variant="ghost" onClick={() => router.push(threadId ? threadHref(threadId) : JOBS_HOME)}>
          Cancel
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : (
            savesAs && (
              <p className="flex items-center gap-1.5 text-sm text-text-tertiary">
                <Tag className="size-4" />
                Saves as “{savesAs}”{tokens?.cost ? ` · ≈ ${formatTokens(tokens.cost)} tokens` : ""}
                {tokens ? ` · you have ${formatTokens(tokens.balance)}` : ""}
              </p>
            )
          )}
          <Button onClick={() => void start()} disabled={!canStart} className="h-11 gap-2 rounded-full px-6 text-[15px]">
            {starting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {running ? "Searching…" : "Start search"}
          </Button>
        </div>
      </footer>
      <MisfitDialog fit={misfit} tokens={tokens?.cost ?? null} onFix={applyFix} onProceed={() => void run()} onClose={() => setMisfit(null)} />
    </div>
  )
}

function MisfitDialog({ fit, tokens, onFix, onProceed, onClose }: { fit: SearchFit | null; tokens: number | null; onFix: (f: SearchFit) => void; onProceed: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (fit && !el.open) el.showModal()
    if (!fit && el.open) el.close()
  }, [fit])
  return (
    <dialog
      ref={ref}
      aria-labelledby="misfit-title"
      onCancel={(e) => (e.preventDefault(), onClose())}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(520px,calc(100vw-2rem))] rounded-2xl border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
    >
      {fit && (
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning-ink">
              <AlertTriangle className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="misfit-title" className="text-lg font-semibold">
                This search doesn&apos;t match your profile
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Plato would search for jobs your profile is unlikely to land. If you go ahead, the search still uses your tokens
                {tokens ? ` (about ${formatTokens(tokens)})` : ""}.
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-text-tertiary hover:bg-muted">
              <X className="size-4" />
            </button>
          </div>
          {fit.reasons.length > 0 && (
            <ul className="flex flex-col gap-1.5 rounded-xl border border-warning-line bg-warning-soft/60 px-4 py-3 text-sm text-foreground">
              {fit.reasons.map((r) => (
                <li key={r} className="flex gap-2">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-warning-ink" />
                  {r}
                </li>
              ))}
            </ul>
          )}
          {fit.suggestion && (
            <p className="text-sm text-text-secondary">
              Plato can set up a search that fits you instead: <span className="font-medium text-foreground">{fit.suggestion.roles.join(", ")}</span>. You can review every detail before it starts.
            </p>
          )}
          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onProceed} className="rounded-full">
              Search anyway
            </Button>
            {fit.suggestion && (
              <Button onClick={() => onFix(fit)} className="gap-2 rounded-full">
                <Sparkles className="size-4" />
                Fix it with Plato AI
              </Button>
            )}
          </div>
        </div>
      )}
    </dialog>
  )
}
