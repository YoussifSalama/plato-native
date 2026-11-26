"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { ArrowLeft, ArrowRight, Briefcase, Check, FileText, Loader2, Lock, MapPin, Plus, Search, Sparkles, Upload } from "lucide-react"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { FilterChip } from "@/components/filter-controls"
import { PlatoMark } from "@/components/plato-orb"
import { AnalyzingModal } from "@/components/analyzing-modal"
import { getGuest, getGuestSearch, pickGuestJobs, startGuestSearch, uploadGuestCv, type GuestJob, type GuestSearch, type GuestSearchInput, type GuestView } from "@/lib/jobs/guest"

// Owner request 2026-11-26: a first search with no account. CV first (the search is planned and ranked from it), then
// the search (filled in from the CV), LinkedIn only. Two jobs open; the locked cards are drawn from nothing: the server
// sends only their count, so no style change can reveal a job. The device is known by a cookie, so signup or login on
// it moves the CV, profile and search onto the account.

const REGION = new Intl.DisplayNames(["en"], { type: "region" })
const SUGGESTED = ["SA", "AE", "QA", "KW", "EG", "GB", "US", "CA", "DE"]
const countryName = (c: string) => (c === "AE" ? "UAE" : (REGION.of(c) ?? c))
const WORK = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
] as const
const LEVELS = [
  { value: "entry", label: "Junior / Entry" },
  { value: "mid", label: "Mid level" },
  { value: "senior", label: "Senior / Lead" },
] as const
const STEPS = ["Your CV", "Role", "Where & level"]
const EMPTY: GuestSearchInput = { roles: [], countries: [], remoteTypes: [], level: null }
const toggle = <T,>(list: T[], v: T, max = 9) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v].slice(-max))

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="theme-app min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link href="/search" className="flex items-center gap-2.5">
          <PlatoMark size={32} />
          <span className="text-lg font-semibold">Plato</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
            Log in
          </Link>
          <Link href="/signup" className={buttonVariants({ className: "rounded-full" })}>
            Sign up free
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-28 sm:px-6">{children}</main>
    </div>
  )
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2">
      {STEPS.map((s, i) => (
        <li key={s} className="flex flex-1 items-center gap-2">
          <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold", i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary-soft text-primary ring-2 ring-primary" : "bg-muted text-text-tertiary")}>
            {i < step ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className={cn("hidden text-sm font-medium sm:inline", i === step ? "text-foreground" : "text-text-tertiary")}>{s}</span>
          {i < STEPS.length - 1 && <span className={cn("h-px flex-1", i < step ? "bg-primary" : "bg-divider")} />}
        </li>
      ))}
    </ol>
  )
}

function CvStep({ guest, onUploaded }: { guest: GuestView | null; onUploaded: (g: GuestView) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function send(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      onUploaded(await uploadGuestCv(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.")
    } finally {
      setBusy(false)
    }
  }
  const p = guest?.profile
  return (
    <>
      <h2 className="text-lg font-semibold">Start with your CV</h2>
      <p className="mb-4 text-sm text-text-tertiary">Plato reads it to pick the right roles and rank every job against you. No account needed yet.</p>
      <div
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => (e.preventDefault(), setOver(false), void send(e.dataTransfer.files?.[0]))}
        className={cn("flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors", over ? "border-primary bg-primary-soft" : guest?.cv ? "border-primary-line bg-primary-tint" : "border-border")}
      >
        <span className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary">{busy ? <Loader2 className="size-6 animate-spin" /> : guest?.cv ? <FileText className="size-6" /> : <Upload className="size-6" />}</span>
        {guest?.cv ? (
          <div>
            <p className="font-medium">{guest.cv.name}</p>
            {p && <p className="mt-1 text-sm text-text-secondary">{[p.title && p.company ? `${p.title} at ${p.company}` : p.title, p.location].filter(Boolean).join(" · ")}</p>}
          </div>
        ) : (
          <div>
            <p className="font-medium">Drag and drop your CV here</p>
            <p className="text-sm text-text-tertiary">PDF or DOCX, up to 10MB</p>
          </div>
        )}
        <Button variant={guest?.cv ? "outline" : "default"} onClick={() => input.current?.click()} disabled={busy} className="rounded-full">
          {guest?.cv ? "Use another CV" : "Upload CV"}
        </Button>
        <input ref={input} type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => (void send(e.target.files?.[0]), (e.target.value = ""))} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      {p && p.skills.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-text-tertiary">Plato read</span>
          {p.skills.map((s) => (
            <span key={s} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
              {s}
            </span>
          ))}
        </div>
      )}
      <AnalyzingModal open={busy} />
    </>
  )
}

function SearchForm({ guest, setGuest, onStarted }: { guest: GuestView | null; setGuest: (g: GuestView) => void; onStarted: (s: GuestSearch) => void }) {
  const [step, setStep] = useState(guest?.cv ? 1 : 0)
  const [d, setD] = useState<GuestSearchInput>(guest?.draft ?? EMPTY)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<GuestSearchInput>) => setD((x) => ({ ...x, ...patch }))
  const typed = text.trim()
  // A typed role counts without pressing Enter.
  const roles = typed.length >= 2 && !d.roles.includes(typed) ? [...d.roles, typed].slice(-2) : d.roles
  const countries = [...new Set([...d.countries, ...SUGGESTED])]
  const canNext = step === 0 ? !!guest?.cv : step === 1 ? roles.length > 0 : true

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      onStarted(await startGuestSearch({ ...d, roles }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "The search could not start. Try again.")
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">Find your next job in a minute</h1>
      <p className="mt-2 mb-8 text-center text-text-secondary">Upload your CV and Plato searches LinkedIn for the jobs that fit you.</p>
      <section className="rounded-2xl border bg-card p-5 shadow-card sm:p-6">
        <Stepper step={step} />
        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
          {step === 0 && <CvStep guest={guest} onUploaded={(g) => (setGuest(g), g.draft && setD(g.draft), setStep(1))} />}
          {step === 1 && (
            <>
              <h2 className="text-lg font-semibold">What job are you looking for?</h2>
              <p className="mb-4 text-sm text-text-tertiary">Filled in from your CV. Up to two roles.</p>
              <label className="flex h-12 items-center gap-2 rounded-xl border bg-card px-3 focus-within:border-primary">
                <Search className="size-4 text-text-tertiary" />
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || typed.length < 2) return
                    e.preventDefault()
                    set({ roles })
                    setText("")
                  }}
                  maxLength={80}
                  placeholder={d.roles.length >= 2 ? "Two roles picked" : "Add a role, e.g. Backend Engineer"}
                  aria-label="Add a role"
                  className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-text-tertiary"
                />
                <Plus className="size-4 text-text-tertiary" />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {d.roles.map((r) => (
                  <FilterChip key={r} on onClick={() => set({ roles: d.roles.filter((x) => x !== r) })} aria-label={`Remove ${r}`}>
                    {r}
                  </FilterChip>
                ))}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h2 className="text-lg font-semibold">Where do you want to work?</h2>
              <p className="mb-4 text-sm text-text-tertiary">Up to two countries. None picked: anywhere.</p>
              <div className="flex flex-wrap gap-2">
                {countries.map((c) => (
                  <FilterChip key={c} on={d.countries.includes(c)} onClick={() => set({ countries: toggle(d.countries, c, 2) })}>
                    {countryName(c)}
                  </FilterChip>
                ))}
              </div>
              <p className="mt-6 mb-3 text-sm font-medium">How do you want to work?</p>
              <div className="flex flex-wrap gap-2">
                {WORK.map((w) => (
                  <FilterChip key={w.value} on={d.remoteTypes.includes(w.value)} onClick={() => set({ remoteTypes: toggle(d.remoteTypes, w.value) })}>
                    {w.label}
                  </FilterChip>
                ))}
              </div>
              <p className="mt-6 mb-3 text-sm font-medium">Your level</p>
              <div className="flex flex-wrap gap-2">
                {LEVELS.map((l) => (
                  <FilterChip key={l.value} on={d.level === l.value} onClick={() => set({ level: d.level === l.value ? null : l.value })}>
                    {l.label}
                  </FilterChip>
                ))}
              </div>
            </>
          )}
        </motion.div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-divider pt-4">
          <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0 || busy} className="gap-1.5">
            <ArrowLeft className="size-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => (step === 1 && (set({ roles }), setText("")), setStep(step + 1))} disabled={!canNext} className="gap-1.5 rounded-full px-5">
              Next <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={() => void submit()} disabled={busy || !roles.length} className="h-11 gap-2 rounded-full px-6">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Find jobs
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}

const LOADING = ["Planning the job titles your CV fits", "Searching LinkedIn", "Leaving out old and off-target jobs", "Ranking every job against your CV"]

function Searching({ roles }: { roles: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, LOADING.length - 1)), 9000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="mx-auto max-w-xl rounded-2xl border bg-card p-6 text-center shadow-card sm:p-8" aria-live="polite">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
        <Loader2 className="size-7 animate-spin" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold">Searching for {roles.join(" and ") || "your jobs"}</h1>
      <p className="mt-1 text-sm text-text-secondary">This takes about a minute. You can keep this page open.</p>
      <div className="mx-auto mt-6 h-1.5 max-w-sm overflow-hidden rounded-full bg-muted">
        <motion.div className="h-full rounded-full bg-primary" initial={{ width: "5%" }} animate={{ width: "92%" }} transition={{ duration: 70, ease: "easeOut" }} />
      </div>
      <ul className="mx-auto mt-6 flex max-w-sm flex-col gap-3 text-left">
        {LOADING.map((s, n) => (
          <li key={s} className={cn("flex items-center gap-3 text-sm transition-colors", n <= i ? "text-foreground" : "text-text-tertiary")}>
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", n < i ? "bg-primary text-primary-foreground" : n === i ? "bg-primary-soft text-primary" : "bg-muted")}>
              {n < i ? <Check className="size-3.5" /> : n === i ? <Loader2 className="size-3.5 animate-spin" /> : null}
            </span>
            {s}
          </li>
        ))}
      </ul>
    </div>
  )
}

const WORK_LABEL: Record<GuestJob["remote_type"], string | null> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site", UNKNOWN: null }

function JobCard({ job, picked, onPick }: { job: GuestJob; picked: boolean; onPick: () => void }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-4 rounded-2xl border bg-card p-5 shadow-card transition-colors", picked ? "border-primary ring-2 ring-primary/20" : "hover:border-primary-line")}>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-sm font-semibold text-primary">{job.company.slice(0, 2).toUpperCase()}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">{job.title}</span>
        <span className="mt-0.5 block text-sm text-text-secondary">{job.company}</span>
        <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-tertiary">
          {job.location && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" />
              {job.location}
            </span>
          )}
          {WORK_LABEL[job.remote_type] && (
            <span className="flex items-center gap-1">
              <Briefcase className="size-3.5" />
              {WORK_LABEL[job.remote_type]}
            </span>
          )}
          {job.posted_at && <span>Posted {new Date(job.posted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
        </span>
      </span>
      <input type="checkbox" checked={picked} onChange={onPick} aria-label={`Pick ${job.title} at ${job.company}`} className="mt-1 size-5 shrink-0 accent-primary" />
    </label>
  )
}

// A locked job: placeholder bars only. There is no job text in the page to unblur.
function LockedCard() {
  return (
    <div aria-hidden className="flex items-start gap-4 rounded-2xl border bg-card p-5 shadow-card blur-[3px] select-none">
      <span className="size-11 shrink-0 rounded-xl bg-muted" />
      <span className="flex flex-1 flex-col gap-2 pt-1">
        <span className="h-4 w-3/5 rounded bg-muted" />
        <span className="h-3 w-2/5 rounded bg-muted" />
        <span className="h-3 w-1/3 rounded bg-muted" />
      </span>
    </div>
  )
}

function Results({ search, picked: initial, onAgain }: { search: GuestSearch; picked: string[]; onAgain: () => void }) {
  const router = useRouter()
  const [picked, setPicked] = useState(initial)
  const [going, setGoing] = useState(false)
  // The picks are kept on the server (this device's guest), so signup or login saves them on the account.
  async function go(to: "/signup" | "/login") {
    setGoing(true)
    await pickGuestJobs(picked).catch(() => undefined)
    router.push(to)
  }
  if (!search.total)
    return (
      <div className="mx-auto max-w-xl rounded-2xl border bg-card p-8 text-center shadow-card">
        <h1 className="text-2xl font-semibold">No jobs found this time</h1>
        <p className="mt-2 text-sm text-text-secondary">Try another role, or more countries.</p>
        <Button onClick={onAgain} className="mt-6 rounded-full">
          Change the search
        </Button>
      </div>
    )
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold sm:text-3xl">
        Plato found <span className="text-primary tabular-nums">{search.total.toLocaleString("en-US")}</span> jobs for {search.roles.join(" and ")}
      </h1>
      <p className="mt-1 mb-6 text-text-secondary">Your two best matches are below. Pick the ones you like, then create a free account to see them all and apply.</p>
      <div className="flex flex-col gap-3">
        {search.open.map((j) => (
          <JobCard key={j.id} job={j} picked={picked.includes(j.id)} onPick={() => setPicked(toggle(picked, j.id))} />
        ))}
      </div>
      {search.locked > 0 && (
        <div className="relative mt-3">
          <div className="flex flex-col gap-3">
            {Array.from({ length: Math.min(search.locked, 4) }, (_, n) => (
              <LockedCard key={n} />
            ))}
          </div>
          <div className="absolute inset-0 grid place-items-center p-4">
            <div className="max-w-sm rounded-2xl border bg-card p-6 text-center shadow-xl">
              <span className="mx-auto grid size-11 place-items-center rounded-xl bg-primary-soft text-primary">
                <Lock className="size-5" />
              </span>
              <p className="mt-3 font-semibold">{search.locked.toLocaleString("en-US")} more jobs are waiting</p>
              <p className="mt-1 text-sm text-text-secondary">Sign up free to see every job and apply. Your CV and this search come with you.</p>
              <Button onClick={() => void go("/signup")} disabled={going} className="mt-4 w-full rounded-full">
                See all jobs
              </Button>
            </div>
          </div>
        </div>
      )}
      <footer className="fixed inset-x-0 bottom-0 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="text-sm text-text-secondary">{picked.length ? `${picked.length} selected. Sign up to apply.` : "Pick a job, or sign up to see them all."}</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => void go("/login")} disabled={going}>
              I have an account
            </Button>
            <Button onClick={() => void go("/signup")} disabled={going} className="gap-1.5 rounded-full px-5">
              {going ? <Loader2 className="size-4 animate-spin" /> : null}
              Continue <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default function PublicSearchPage() {
  const [guest, setGuest] = useState<GuestView | null | undefined>(undefined) // undefined: still loading
  const [search, setSearch] = useState<GuestSearch | null>(null)
  const [editing, setEditing] = useState(false)

  // This device's guest, if any: a refresh (or coming back later) lands where the visitor was.
  useEffect(() => {
    getGuest()
      .then((g) => (setGuest(g), setSearch(g?.search ?? null)))
      .catch(() => setGuest(null))
  }, [])

  // A running search: poll until it is done.
  const runningId = search?.status === "RUNNING" ? search.id : null
  useEffect(() => {
    if (!runningId) return
    const t = setInterval(() => {
      getGuestSearch(runningId)
        .then((s) => s.status !== "RUNNING" && setSearch(s))
        .catch(() => undefined)
    }, 2500)
    return () => clearInterval(t)
  }, [runningId])

  let body: ReactNode
  if (guest === undefined) body = <Loader2 className="mx-auto mt-24 size-6 animate-spin text-primary" aria-label="Loading" />
  else if (!search || editing) body = <SearchForm guest={guest} setGuest={setGuest} onStarted={(s) => (setSearch(s), setEditing(false))} />
  else if (search.status === "RUNNING") body = <Searching roles={search.roles} />
  else if (search.status === "FAILED")
    body = (
      <div className="mx-auto max-w-xl rounded-2xl border bg-card p-8 text-center shadow-card">
        <h1 className="text-2xl font-semibold">The search did not finish</h1>
        <p className="mt-2 text-sm text-text-secondary">LinkedIn did not answer this time. Try again in a moment.</p>
        <Button onClick={() => setEditing(true)} className="mt-6 rounded-full">
          Try again
        </Button>
      </div>
    )
  else body = <Results search={search} picked={guest?.picked ?? []} onAgain={() => setEditing(true)} />
  return <Shell>{body}</Shell>
}
