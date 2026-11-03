"use client"

import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Briefcase, Building2, Globe2, Loader2, MapPin, Pause, Play, Plus, Search, Sparkles, X } from "lucide-react"
import { cn } from "cn"
import { CompanyAvatar } from "@/components/company-avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { searchCompanies, type CompanySuggestion, type InsightsOverview, type JobAlert, type NewAlert } from "@/lib/insights/api"
import { ease, spring } from "@/lib/motion-system"

type Actions = {
  add: (a: NewAlert) => Promise<boolean>
  toggle: (a: JobAlert) => void
  remove: (a: JobAlert) => void
}

const planName = (p: string) => p[0].toUpperCase() + p.slice(1)

// How many of the plan's alerts are in use, as a small bar. Full means a gentle way to more.
function Allowance({ used, limit, plan, noun }: { used: number; limit: number; plan: string; noun: string }) {
  const reduced = !!useReducedMotion()
  const full = used >= limit
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-tertiary">
          <span className="font-semibold text-foreground tabular-nums">{used}</span> of {limit} {noun} on {planName(plan)}
        </span>
        {full && (
          <Link href="/tokens" data-ai={`insights.upgrade.${noun}`} className="font-semibold text-primary hover:underline">
            Get more with a bigger plan
          </Link>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div className={cn("h-full rounded-full", full ? "bg-warning" : "bg-primary")} initial={{ width: reduced ? `${Math.min(100, (used / limit) * 100)}%` : 0 }} animate={{ width: `${Math.min(100, (used / limit) * 100)}%` }} transition={{ duration: reduced ? 0 : 0.6, ease: ease.out }} />
      </div>
    </div>
  )
}

function Card({ icon: Icon, title, body, children }: { icon: typeof Briefcase; title: string; body: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-xl border bg-card p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon className="size-5" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="text-sm text-text-secondary">{body}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function RowActions({ a, actions }: { a: JobAlert; actions: Actions }) {
  const name = a.kind === "FIELD" ? a.title : a.company
  return (
    <span className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
      <button type="button" data-ai={`insights.alert.${a.paused ? "resume" : "pause"}:${a.id}`} onClick={() => actions.toggle(a)} title={a.paused ? "Resume" : "Pause"} aria-label={`${a.paused ? "Resume" : "Pause"} ${name}`} className="flex size-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-muted hover:text-foreground">
        {a.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
      </button>
      <button type="button" data-ai={`insights.alert.stop:${a.id}`} onClick={() => actions.remove(a)} title="Stop this alert" aria-label={`Stop ${name}`} className="flex size-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-destructive/10 hover:text-destructive">
        <X className="size-4" />
      </button>
    </span>
  )
}

const sentLabel = (n: number) => (n ? `${n} job${n === 1 ? "" : "s"} sent so far` : "Nothing sent yet")

export function FieldAlerts({ data, roles, actions }: { data: InsightsOverview | null; roles: string[]; actions: Actions }) {
  const reduced = !!useReducedMotion()
  const [title, setTitle] = useState("")
  const [location, setLocation] = useState("")
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const alerts = data?.alerts.filter((a) => a.kind === "FIELD") ?? []
  const full = !!data && data.used.field >= data.limits.field
  const taken = new Set(alerts.map((a) => a.title?.toLowerCase()))
  const ideas = roles.filter((r) => !taken.has(r.toLowerCase())).slice(0, 4)

  const submit = async (e?: FormEvent, preset?: string) => {
    e?.preventDefault()
    const t = (preset ?? title).trim()
    if (t.length < 2 || busy) return
    setBusy(true)
    const ok = await actions.add({ kind: "FIELD", title: t, location: location.trim() || null, remote_only: remoteOnly })
    setBusy(false)
    if (ok) {
      setTitle("")
      setLocation("")
      setRemoteOnly(false)
    }
  }

  return (
    <Card icon={Briefcase} title="Roles you want" body="New openings for these roles, from any search on Plato and the boards we watch.">
      {!data ? (
        <ListSkeleton />
      ) : (
        <>
          <ul className="flex flex-col">
            <AnimatePresence initial={false}>
              {alerts.map((a) => (
                <motion.li key={a.id} layout={!reduced} initial={reduced ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 12 }} transition={spring.settle} className={cn("group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-primary-tint", a.paused && "opacity-60")}>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
                    <Briefcase className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{a.title}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-text-tertiary">
                      {a.remote_only ? (
                        <span className="flex items-center gap-1"><Globe2 className="size-3" />Remote only</span>
                      ) : a.location ? (
                        <span className="flex items-center gap-1"><MapPin className="size-3" />{a.location} or remote</span>
                      ) : (
                        <span>Anywhere</span>
                      )}
                      <span aria-hidden>·</span>
                      <span>{a.paused ? "Paused" : sentLabel(a.sent)}</span>
                    </span>
                  </span>
                  <RowActions a={a} actions={actions} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          {full ? null : (
            <form onSubmit={submit} className="flex flex-col gap-2.5 rounded-lg border border-dashed bg-primary-tint/40 p-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="flex flex-1 items-center gap-2 rounded-md border bg-card px-3 focus-within:border-primary/50 focus-within:ring-3 focus-within:ring-primary/10">
                  <Briefcase className="size-4 shrink-0 text-text-tertiary" />
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A role, like Product Designer" aria-label="Role" maxLength={80} data-ai="insights.field.title" className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-text-tertiary" />
                </label>
                <label className={cn("flex items-center gap-2 rounded-md border bg-card px-3 focus-within:border-primary/50 focus-within:ring-3 focus-within:ring-primary/10 sm:w-48", remoteOnly && "opacity-50")}>
                  <MapPin className="size-4 shrink-0 text-text-tertiary" />
                  <input value={location} onChange={(e) => setLocation(e.target.value)} disabled={remoteOnly} placeholder="City or country" aria-label="Where (optional)" maxLength={80} data-ai="insights.field.location" className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-text-tertiary" />
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
                  <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} className="size-4 accent-[var(--primary)]" data-ai="insights.field.remote" />
                  Remote only
                </label>
                <button type="submit" disabled={title.trim().length < 2 || busy} data-ai="insights.field.add" className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-[transform,opacity] hover:opacity-90 active:scale-[0.98] disabled:opacity-50">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Add alert
                </button>
              </div>
              {ideas.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="flex items-center gap-1 text-xs text-text-tertiary"><Sparkles className="size-3 text-primary" />From your profile:</span>
                  {ideas.map((r) => (
                    <button key={r} type="button" onClick={() => submit(undefined, r)} disabled={busy} data-ai={`insights.field.idea:${r}`} className="rounded-full border bg-card px-2.5 py-0.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary">
                      + {r}
                    </button>
                  ))}
                </div>
              )}
            </form>
          )}
          <Allowance used={data.used.field} limit={data.limits.field} plan={data.plan} noun="roles" />
        </>
      )}
    </Card>
  )
}

export function CompanyFollows({ data, actions }: { data: InsightsOverview | null; actions: Actions }) {
  const reduced = !!useReducedMotion()
  const [q, setQ] = useState("")
  const [found, setFound] = useState<{ q: string; list: CompanySuggestion[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const follows = data?.alerts.filter((a) => a.kind === "COMPANY") ?? []
  const full = !!data && data.used.company >= data.limits.company
  const term = q.trim()

  // Names from the jobs Plato has seen, a moment after typing stops.
  useEffect(() => {
    if (term.length < 2) return
    const t = setTimeout(() => {
      searchCompanies(term)
        .then((list) => setFound({ q: term, list }))
        .catch(() => setFound({ q: term, list: [] }))
    }, 250)
    return () => clearTimeout(t)
  }, [term])
  const followed = new Set(follows.map((f) => f.company?.toLowerCase()))
  const suggestions = term.length >= 2 && found?.q === term ? found.list.filter((s) => !followed.has(s.name.toLowerCase())) : []

  const follow = async (name: string) => {
    if (busy || name.trim().length < 2) return
    setBusy(true)
    const ok = await actions.add({ kind: "COMPANY", company: name.trim() })
    setBusy(false)
    if (ok) setQ("")
  }

  return (
    <Card icon={Building2} title="Companies you follow" body="Every new opening at these companies, whatever the role.">
      {!data ? (
        <ListSkeleton />
      ) : (
        <>
          {follows.length > 0 && (
            <ul className="flex flex-col">
              <AnimatePresence initial={false}>
                {follows.map((a) => (
                  <motion.li key={a.id} layout={!reduced} initial={reduced ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 12 }} transition={spring.settle} className={cn("group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-primary-tint", a.paused && "opacity-60")}>
                    <CompanyAvatar name={a.company ?? "?"} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{a.company}</span>
                      <span className="block text-xs text-text-tertiary">{a.paused ? "Paused" : sentLabel(a.sent)}</span>
                    </span>
                    <RowActions a={a} actions={actions} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}

          {!full && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void follow(suggestions[0]?.name ?? term)
              }}
              className="relative flex flex-col gap-2"
            >
              <label className="flex items-center gap-2 rounded-md border bg-card px-3 focus-within:border-primary/50 focus-within:ring-3 focus-within:ring-primary/10">
                <Search className="size-4 shrink-0 text-text-tertiary" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Follow a company, like Stripe" aria-label="Company name" maxLength={80} data-ai="insights.company.search" className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-text-tertiary" />
                {busy && <Loader2 className="size-4 shrink-0 animate-spin text-primary" />}
              </label>
              <AnimatePresence>
                {term.length >= 2 && (
                  <motion.ul initial={reduced ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15, ease: ease.out }} className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-[0_18px_40px_-28px_rgba(0,91,167,0.55)]">
                    {suggestions.map((s) => (
                      <li key={s.key}>
                        <button type="button" onClick={() => follow(s.name)} data-ai={`insights.company.pick:${s.name}`} className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-primary-tint">
                          <CompanyAvatar name={s.name} size={28} />
                          <span className="flex-1 truncate text-sm font-medium text-foreground">{s.name}</span>
                          <span className="text-xs text-text-tertiary">{s.jobs} recent job{s.jobs === 1 ? "" : "s"}</span>
                        </button>
                      </li>
                    ))}
                    {!suggestions.some((s) => s.name.toLowerCase() === term.toLowerCase()) && (
                      <li>
                        <button type="button" onClick={() => follow(term)} data-ai="insights.company.follow-typed" className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-primary-tint">
                          <span className="flex size-7 items-center justify-center rounded-md bg-primary-soft text-primary"><Plus className="size-3.5" /></span>
                          Follow <span className="font-semibold text-foreground">“{term}”</span>
                        </button>
                      </li>
                    )}
                  </motion.ul>
                )}
              </AnimatePresence>
            </form>
          )}
          {follows.length === 0 && term.length < 2 && <p className="rounded-lg bg-primary-tint p-3 text-sm text-text-secondary">Follow the places you&apos;d love to work. When they post anything new, it comes in your next digest.</p>}
          <Allowance used={data.used.company} limit={data.limits.company} plan={data.plan} noun="companies" />
        </>
      )}
    </Card>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
      <Skeleton className="h-10 w-full rounded-md" />
    </div>
  )
}
