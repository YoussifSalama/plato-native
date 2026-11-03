"use client"

import { Fragment, useCallback, useEffect, useMemo, useState, type MouseEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { ArrowRight, ArrowUpDown, Bookmark, ChevronDown, ChevronRight, CircleDashed, ExternalLink, EyeOff, Loader2, MapPin, Plus, Search, Send, Sparkles, X } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CompanyAvatar } from "@/components/company-avatar"
import { ExtensionApplyModal } from "@/components/extension-apply-modal"
import { createThread, getMatches, listThreads, setHidden, setSaved, type DiscoveryRun, type JobMatch, type ThreadSummary } from "@/lib/jobs/api"
import { APPLICATION_STATUS } from "@/lib/jobs/application-status"
import { runTitle, threadHref, timeAgo } from "@/lib/jobs/links"
import { NotificationBell } from "./components/notification-bell"

// Jobs: every search the seeker ran, as one table they can search, filter and
// sort. A row opens its search; the chevron shows its best jobs right here,
// each with the actions the results page has. Analytics live on Home (/).

type Status = "all" | "RUNNING" | "DONE" | "FAILED" | "IDLE"
type Since = "any" | "7" | "30" | "90"
type Sort = "updated" | "created" | "jobs" | "title"

const STATUS: Record<Exclude<Status, "all">, { label: string; tone: string }> = {
  RUNNING: { label: "Searching", tone: "bg-info-soft text-info" },
  DONE: { label: "Ready", tone: "bg-success-soft text-success" },
  FAILED: { label: "Failed", tone: "bg-destructive/10 text-destructive" },
  IDLE: { label: "Not started", tone: "bg-muted text-text-secondary" },
}
const SORTS: { value: Sort; label: string }[] = [
  { value: "updated", label: "Last activity" },
  { value: "created", label: "Newest first" },
  { value: "jobs", label: "Most jobs" },
  { value: "title", label: "Name A–Z" },
]
const SINCE: { value: Since; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
]
const TOP_N = 5

// One flat row per search: its latest run carries the status and the numbers.
type Row = { thread: ThreadSummary; run: DiscoveryRun | undefined; status: Exclude<Status, "all">; name: string; roles: string; where: string; jobs: number; fetched: number }
function toRow(t: ThreadSummary): Row {
  const run = t.discovery_runs[0]
  const where = [...(run?.query.locations ?? []), ...(run?.query.remoteTypes?.includes("REMOTE") ? ["Remote"] : [])]
  return {
    thread: t,
    run,
    status: run?.status ?? "IDLE",
    name: t.title ?? (run ? runTitle(run) : "New search"),
    roles: run ? (run.query.requestedTitles?.length ? run.query.requestedTitles : run.query.titles).join(", ") : "",
    where: [...new Set(where)].join(" · "),
    jobs: run ? (run.progress?.ranked ?? run.matched) : 0,
    fetched: run?.fetched ?? 0,
  }
}

const PILL = "flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-[13px] font-medium whitespace-nowrap text-text-secondary transition-colors hover:bg-muted"
const PILL_ON = "border-primary/40 bg-primary-soft text-primary hover:bg-primary-soft"

export default function JobsPage() {
  const router = useRouter()
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [q, setQ] = useState("")
  const [status, setStatus] = useState<Status>("all")
  const [since, setSince] = useState<Since>("any")
  const [sort, setSort] = useState<Sort>("updated")
  const [open, setOpen] = useState<Set<string>>(new Set())
  // "Last N days" counts from when the page loaded.
  const [now] = useState(() => Date.now())

  useEffect(() => {
    listThreads()
      .then(setThreads)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your searches"))
  }, [])

  async function newSearch() {
    setCreating(true)
    try {
      const t = await createThread()
      router.push(threadHref(t.id))
    } finally {
      setCreating(false)
    }
  }

  const all = useMemo(() => (threads ?? []).map(toRow), [threads])
  const counts = useMemo(() => {
    const c: Record<Status, number> = { all: all.length, RUNNING: 0, DONE: 0, FAILED: 0, IDLE: 0 }
    all.forEach((r) => c[r.status]++)
    return c
  }, [all])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const after = since === "any" ? 0 : now - Number(since) * 86_400_000
    return all
      .filter((r) => status === "all" || r.status === status)
      .filter((r) => !after || new Date(r.thread.updated_at).getTime() >= after)
      .filter((r) => !needle || `${r.name} ${r.roles} ${r.where}`.toLowerCase().includes(needle))
      .sort((a, b) =>
        sort === "title"
          ? a.name.localeCompare(b.name)
          : sort === "jobs"
            ? b.jobs - a.jobs
            : sort === "created"
              ? b.thread.created_at.localeCompare(a.thread.created_at)
              : b.thread.updated_at.localeCompare(a.thread.updated_at),
      )
  }, [all, q, status, since, sort, now])
  const filtered = q.trim() !== "" || status !== "all" || since !== "any"
  const clear = () => (setQ(""), setStatus("all"), setSince("any"))
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="flex flex-1 flex-col gap-5 px-6 py-6 lg:pr-6 lg:pl-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">Job search</span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Your searches</h1>
          <p className="mt-1 text-sm text-text-secondary">Every search you ran. Open one for its full results, or expand it to see its best jobs here.</p>
        </div>
        <div className="flex items-center gap-3.5">
          <Button data-ai="jobs.new-search" onClick={newSearch} disabled={creating} className="gap-2 rounded-full px-5">
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            New search
          </Button>
          <NotificationBell />
        </div>
      </header>

      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <section className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-card">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b p-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="relative flex min-w-[220px] flex-1 items-center">
              <Search className="pointer-events-none absolute left-3.5 size-4 text-text-tertiary" />
              <input
                data-ai="jobs.filter.q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, role or location"
                aria-label="Search your searches"
                className="h-9 w-full rounded-full border bg-background pr-9 pl-10 text-sm text-foreground outline-none placeholder:text-text-tertiary focus:border-primary/50 focus:ring-3 focus:ring-ring/15"
              />
              {q && (
                <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2.5 flex size-5 items-center justify-center rounded-full text-text-tertiary hover:bg-muted hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </label>
            <span className="relative">
              <select data-ai="jobs.filter.since" value={since} onChange={(e) => setSince(e.target.value as Since)} aria-label="Active since" className={cn(PILL, "appearance-none pr-8", since !== "any" && PILL_ON)}>
                {SINCE.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-text-tertiary" />
            </span>
            <span className="relative">
              <ArrowUpDown className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-text-tertiary" />
              <select data-ai="jobs.sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className={cn(PILL, "appearance-none pr-8 pl-9")}>
                {SORTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-text-tertiary" />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Status">
            {(["all", "RUNNING", "DONE", "FAILED", "IDLE"] as Status[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={status === k} data-ai={`jobs.status.${k.toLowerCase()}`} onClick={() => setStatus(k)} className={cn(PILL, "h-8 px-3", status === k && PILL_ON)}>
                {k === "all" ? "All" : STATUS[k].label}
                <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular-nums", status === k ? "bg-primary/10" : "bg-muted")}>{counts[k]}</span>
              </button>
            ))}
            {filtered && (
              <button type="button" onClick={clear} data-ai="jobs.filter.clear" className="ml-auto text-xs font-semibold text-primary hover:underline">
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-primary-tint/60 text-left text-xs font-semibold text-text-tertiary">
                <th className="w-12 py-3 pl-4" aria-label="Expand" />
                <th className="py-3 pr-4">Search</th>
                <th className="py-3 pr-4">Status</th>
                <th className="hidden py-3 pr-4 lg:table-cell">Where</th>
                <th className="py-3 pr-4 text-right">Jobs ready</th>
                <th className="hidden py-3 pr-4 text-right md:table-cell">Fetched</th>
                <th className="py-3 pr-4">Last activity</th>
                <th className="w-12 py-3 pr-4" aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {threads === null &&
                !error &&
                Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} className="border-b border-divider">
                    <td colSpan={8} className="px-4 py-3.5">
                      <Skeleton className="h-9 w-full" />
                    </td>
                  </tr>
                ))}
              {rows.map((r) => (
                <SearchRow key={r.thread.id} row={r} open={open.has(r.thread.id)} onToggle={() => toggle(r.thread.id)} onOpen={() => router.push(threadHref(r.thread.id))} />
              ))}
            </tbody>
          </table>
        </div>

        {threads?.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Sparkles className="size-5" />
            </span>
            <p className="text-sm font-semibold text-foreground">No searches yet</p>
            <p className="max-w-sm text-sm text-text-secondary">Tell Plato what you&apos;re after and it will search LinkedIn, Indeed, Google Jobs, ZipRecruiter, Glassdoor and more for you.</p>
            <Button data-ai="jobs.first-search" onClick={newSearch} disabled={creating} className="mt-1 gap-2 rounded-full">
              Start your first search
              <ArrowRight className="size-4" />
            </Button>
          </div>
        )}
        {!!threads?.length && rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
            <p className="text-sm font-semibold text-foreground">No search matches these filters</p>
            <button type="button" onClick={clear} className="text-sm font-semibold text-primary hover:underline">
              Clear filters
            </button>
          </div>
        )}
        {!!rows.length && (
          <p className="border-t px-4 py-3 text-xs text-text-tertiary">
            Showing {rows.length} of {all.length} search{all.length === 1 ? "" : "es"}
          </p>
        )}
      </section>
    </div>
  )
}

// Clicks on the row open the search, except clicks on its own controls.
const fromControl = (e: MouseEvent) => !!(e.target as HTMLElement).closest("a,button,input,select")

function SearchRow({ row, open, onToggle, onOpen }: { row: Row; open: boolean; onToggle: () => void; onOpen: () => void }) {
  const { thread, run, status } = row
  const s = STATUS[status]
  return (
    <Fragment>
      <tr onClick={(e) => !fromControl(e) && onOpen()} className={cn("group cursor-pointer border-b border-divider transition-colors hover:bg-primary-tint", open && "bg-primary-tint")}>
        <td className="py-3 pl-4">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? `Hide top jobs for ${row.name}` : `Show top jobs for ${row.name}`}
            data-ai={`jobs.expand:${thread.id}`}
            disabled={status === "IDLE"}
            className="flex size-8 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-primary-soft hover:text-primary disabled:opacity-30"
          >
            <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90 text-primary")} />
          </button>
        </td>
        <td className="max-w-[340px] py-3 pr-4">
          <Link href={threadHref(thread.id)} data-ai={`jobs.search:${thread.id}`} className="block truncate font-semibold text-foreground hover:text-primary">
            {row.name}
          </Link>
          <span className="block truncate text-xs text-text-tertiary">{row.roles || "Open it to tell Plato what you want"}</span>
        </td>
        <td className="py-3 pr-4">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", s.tone)}>
            {status === "RUNNING" ? <Loader2 className="size-3 animate-spin" /> : status === "IDLE" ? <CircleDashed className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}
            {s.label}
          </span>
        </td>
        <td className="hidden max-w-[200px] py-3 pr-4 lg:table-cell">
          {row.where ? (
            <span className="flex items-center gap-1.5 truncate text-text-secondary">
              <MapPin className="size-3.5 shrink-0 text-text-tertiary" />
              <span className="truncate">{row.where}</span>
            </span>
          ) : (
            <span className="text-text-tertiary">—</span>
          )}
        </td>
        <td className="py-3 pr-4 text-right font-semibold text-foreground tabular-nums">{run ? row.jobs : "—"}</td>
        <td className="hidden py-3 pr-4 text-right text-text-secondary tabular-nums md:table-cell">{run ? row.fetched.toLocaleString() : "—"}</td>
        <td className="py-3 pr-4 whitespace-nowrap text-text-secondary">{timeAgo(thread.updated_at)}</td>
        <td className="py-3 pr-4">
          <ChevronRight className="ml-auto size-4 text-lavender transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
        </td>
      </tr>
      <AnimatePresence initial={false}>
        {open && (
          <tr className="border-b border-divider bg-primary-tint/50">
            <td colSpan={8} className="p-0">
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                <TopJobs threadId={thread.id} running={status === "RUNNING"} total={row.jobs} />
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </Fragment>
  )
}

// Fetched once per search the first time it is expanded.
const cache = new Map<string, JobMatch[]>()

function TopJobs({ threadId, running, total }: { threadId: string; running: boolean; total: number }) {
  const [items, setItems] = useState<JobMatch[] | null>(() => cache.get(threadId) ?? null)
  const [failed, setFailed] = useState(false)
  const [apply, setApply] = useState<string | null>(null)

  useEffect(() => {
    if (cache.has(threadId)) return
    getMatches({ threadId, tab: "discover", sort: "best", take: TOP_N })
      .then((r) => {
        cache.set(threadId, r.items)
        setItems(r.items)
      })
      .catch(() => setFailed(true))
  }, [threadId])

  const update = useCallback(
    (next: JobMatch[]) => {
      cache.set(threadId, next)
      setItems(next)
    },
    [threadId],
  )

  async function toggleSave(m: JobMatch) {
    const prev = items ?? []
    update(prev.map((x) => (x.id === m.id ? { ...x, saved: !m.saved } : x)))
    try {
      await setSaved(m.job.id, !m.saved)
    } catch {
      update(prev)
    }
  }
  async function hide(m: JobMatch) {
    const prev = items ?? []
    update(prev.filter((x) => x.id !== m.id))
    try {
      await setHidden(m.job.id, true)
    } catch {
      update(prev)
    }
  }

  return (
    <div className="flex flex-col gap-3 py-4 pr-4 pl-16">
      <ExtensionApplyModal open={!!apply} count={1} req={{ jobIds: apply ? [apply] : [], threadId }} onClose={() => setApply(null)} />
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Top {TOP_N} matches</p>
        <Link href={threadHref(threadId)} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          {total > TOP_N ? `All ${total} jobs` : "Open search"}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
      {items === null && !failed && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[62px] rounded-md" />
          ))}
        </div>
      )}
      {failed && <p className="text-sm text-destructive">Could not load the jobs for this search.</p>}
      {items?.length === 0 && <p className="text-sm text-text-tertiary">{running ? "Plato is still ranking jobs for this search. Check back in a moment." : "No jobs in this search yet."}</p>}
      <ul className="flex flex-col gap-2">
        {items?.map((m, i) => {
          const app = m.application_status ? APPLICATION_STATUS[m.application_status] : null
          const locked = !!m.application_status && m.application_status !== "FAILED"
          return (
            <li key={m.id} className="group/job flex items-center gap-3 rounded-md border bg-card p-3 shadow-card transition-colors hover:border-primary-line">
              <span className="w-4 text-center text-xs font-semibold text-text-tertiary tabular-nums">{i + 1}</span>
              <CompanyAvatar name={m.job.company} domain={m.job.company_domain} size={38} />
              <a href={m.job.url} target="_blank" rel="noreferrer" data-ai={`jobs.top-job:${m.job.id}`} className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate font-semibold text-foreground group-hover/job:text-primary">
                  <span className="truncate">{m.job.title}</span>
                  <ExternalLink className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/job:opacity-60" />
                </span>
                <span className="block truncate text-xs text-text-tertiary">
                  {m.job.company}
                  {m.job.location ? ` · ${m.job.location}` : ""}
                  {m.job.remote_type === "REMOTE" ? " · Remote" : m.job.remote_type === "HYBRID" ? " · Hybrid" : ""}
                </span>
              </a>
              <span className={cn("hidden shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums sm:inline", m.match_label === "Excellent match" ? "bg-success-soft text-success" : m.match_label === "Strong match" ? "bg-info-soft text-info" : "bg-muted text-text-secondary")}>{m.match_percent}%</span>
              <span className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => toggleSave(m)} aria-pressed={m.saved} title={m.saved ? "Saved" : "Save"} aria-label={m.saved ? "Unsave job" : "Save job"} className={cn("flex size-8 items-center justify-center rounded-full transition-colors hover:bg-muted", m.saved ? "text-primary" : "text-lavender hover:text-text-secondary")}>
                  <Bookmark className={cn("size-4", m.saved && "fill-current")} />
                </button>
                <button type="button" onClick={() => hide(m)} title="Not interested" aria-label="Not interested" className="flex size-8 items-center justify-center rounded-full text-lavender transition-colors hover:bg-muted hover:text-text-secondary">
                  <EyeOff className="size-4" />
                </button>
                {app && locked ? (
                  <span className={cn("ml-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", app.tone)} title={app.hint}>
                    {app.label}
                  </span>
                ) : (
                  <Button size="sm" onClick={() => setApply(m.job.id)} data-ai={`jobs.top-apply:${m.job.id}`} className="ml-1 gap-1.5 rounded-full">
                    <Send className="size-3.5" />
                    Apply
                  </Button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
