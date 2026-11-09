"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { motion } from "motion/react"
import { Bookmark, Briefcase, Check, X, ChevronDown, ChevronLeft, ChevronRight, EyeOff, Loader2, Plus, Sparkles } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ExtensionApplyModal } from "@/components/extension-apply-modal"
import { MatchPill, MonoTile, PlatoNote } from "@/components/plato-ui"
import { getProfile } from "@/lib/documents/api"
import { getDigests, getInsights } from "@/lib/insights/api"
import { createThread, getDiscoveryStats, getMatches, listThreads, setHidden, setSaved, type DiscoveryStats, type JobMatch, type MatchFilters, type MatchTab, type ThreadSummary } from "@/lib/jobs/api"
import { APPLICATION_STATUS } from "@/lib/jobs/application-status"
import { runTitle, threadHref, timeAgo } from "@/lib/jobs/links"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"

// Jobs (owner screen 06): your searches on the left, every match across them on the right.
// Each search is a Plato chat thread (/jobs/[threadId]); "New search" starts one.
const PAGE_SIZE = 10
const REMOTE: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site", UNKNOWN: "" }
const GROUPS = ["Today", "Yesterday", "Previous 7 days", "Older"] as const
const POSTED = [
  [0, "Posted: any time"],
  [1, "Posted: past day"],
  [3, "Posted: past 3 days"],
  [7, "Posted: past week"],
  [30, "Posted: past month"],
] as const
const groupOf = (iso: string) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = (today.getTime() - new Date(iso).setHours(0, 0, 0, 0)) / 864e5
  return diff <= 0 ? "Today" : diff <= 1 ? "Yesterday" : diff <= 7 ? "Previous 7 days" : "Older"
}
const jobsIn = (t: ThreadSummary) => {
  const run = t.discovery_runs[0]
  return run ? (run.progress?.ranked ?? run.matched) : 0
}
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`)
type Filters = { local: boolean; remote: boolean; senior: boolean; posted: number; salary: boolean }

function JobsContent() {
  const router = useRouter()
  // "See roles" on Following opens this page for one company.
  const company = useSearchParams().get("company")?.trim() || null
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [stats, setStats] = useState<DiscoveryStats | null>(null)
  const [following, setFollowing] = useState<string[]>([])
  const [followingNew, setFollowingNew] = useState(0)
  const [followedRoles, setFollowedRoles] = useState(0)
  const [country, setCountry] = useState<string | null>(null)
  const [tab, setTab] = useState<MatchTab>("discover")
  const [filters, setFilters] = useState<Filters>({ local: true, remote: false, senior: false, posted: 0, salary: false })
  const [items, setItems] = useState<JobMatch[] | null>(null)
  const [total, setTotal] = useState(0)
  const [elsewhere, setElsewhere] = useState(0)
  const [page, setPage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [apply, setApply] = useState<string[] | null>(null)

  useEffect(() => {
    listThreads()
      .then(setThreads)
      .catch(() => setThreads([]))
    getDiscoveryStats()
      .then(setStats)
      .catch(() => setStats(null))
    getInsights()
      .then((i) => {
        setFollowing(i.alerts.filter((a) => a.kind === "COMPANY" && a.company).map((a) => a.company as string))
        setFollowedRoles(i.alerts.filter((a) => a.kind === "FIELD").length)
      })
      .catch(() => setFollowing([]))
    getDigests(1)
      .then((d) => setFollowingNew(d[0]?.jobs.filter((j) => !j.closed).length ?? 0))
      .catch(() => setFollowingNew(0))
    getProfile()
      .then((p) => setCountry(p.location?.country ?? null))
      .catch(() => setCountry(null))
  }, [])

  // "Can apply from Egypt" hides jobs that only take applicants from elsewhere (on by default).
  const query = useMemo<MatchFilters>(
    () => ({
      tab,
      sort: "best",
      ...(filters.local && country && { acceptsCountry: country }),
      ...(filters.remote && { remoteType: "REMOTE" as const }),
      ...(filters.senior && { level: "senior" as const }),
      ...(filters.posted > 0 && { postedWithinDays: filters.posted }),
      ...(filters.salary && { hasSalary: true }),
      ...(company && { q: company }),
    }),
    [tab, filters, country, company],
  )
  useEffect(() => {
    let alive = true
    getMatches({ ...query, skip: page * PAGE_SIZE, take: PAGE_SIZE })
      .then((r) => {
        if (!alive) return
        setItems(r.items)
        setTotal(r.total)
        setError(null)
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load jobs"))
    // How many the country filter hides, for "14 hidden because they don't accept applicants from Egypt".
    if (query.acceptsCountry)
      getMatches({ ...query, acceptsCountry: undefined, take: 1 })
        .then((r) => alive && setElsewhere(r.total))
        .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [query, page])

  const change = (fn: () => void) => {
    fn()
    setPage(0)
    setItems(null)
    setSelected(new Set())
  }
  async function newSearch() {
    setCreating(true)
    try {
      const t = await createThread()
      router.push(threadHref(t.id))
    } finally {
      setCreating(false)
    }
  }
  async function toggleSave(m: JobMatch) {
    setItems((cur) => cur?.map((x) => (x.id === m.id ? { ...x, saved: !m.saved } : x)) ?? cur)
    await setSaved(m.job.id, !m.saved).catch(() => setItems((cur) => cur?.map((x) => (x.id === m.id ? { ...x, saved: m.saved } : x)) ?? cur))
  }
  async function toggleHide(m: JobMatch) {
    setItems((cur) => cur?.filter((x) => x.id !== m.id) ?? cur)
    setTotal((n) => n - 1)
    await setHidden(m.job.id, !m.hidden).catch(() => undefined)
  }
  const open = (m: JobMatch) => !m.application_status || m.application_status === "FAILED"
  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  // The 10 best on the list that can still be applied to (the list is sorted best first).
  const topTen = async () => {
    const r = await getMatches({ ...query, tab: "discover", take: 30 }).catch(() => null)
    setSelected(new Set((r?.items ?? items ?? []).filter(open).slice(0, 10).map((m) => m.job.id)))
  }
  const hidden = query.acceptsCountry && elsewhere > total ? elsewhere - total : 0
  const grouped = GROUPS.map((g) => ({ g, ts: (threads ?? []).filter((t) => groupOf(t.updated_at) === g) })).filter((x) => x.ts.length)
  const appliedCount = stats ? Object.values(stats.applications).reduce((n, c) => n + (c ?? 0), 0) : null
  const TABS: { key: MatchTab; label: string }[] = [
    { key: "discover", label: "For you" },
    { key: "saved", label: `Saved${stats ? ` · ${stats.saved}` : ""}` },
    { key: "applied", label: `Applied${appliedCount !== null ? ` · ${appliedCount}` : ""}` },
    { key: "hidden", label: "Hidden" },
  ]
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
      {/* Searches: each one is a Plato conversation that keeps running. */}
      <aside data-tour="jobs-toolbar" className="flex flex-col gap-2 border-r-0 px-4 pt-4 pb-4 sm:px-6 lg:sticky lg:top-[73px] lg:max-h-[calc(100dvh-73px)] lg:overflow-y-auto lg:border-r lg:pr-4 lg:pl-5">
        <Button data-ai="jobs.new-search" variant="outline" onClick={newSearch} disabled={creating} className="h-11 justify-start gap-2 rounded-xl bg-card text-[15px]">
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          New search
        </Button>
        <span className="flex items-center justify-between rounded-xl border bg-card px-3 py-2.5">
          <span className="flex items-center gap-2 font-semibold">
            <Briefcase className="size-4" />
            All jobs
          </span>
          {stats?.newThisWeek ? <span className="text-[13px] font-bold text-primary tabular-nums">+{stats.newThisWeek}</span> : null}
        </span>
        <Link href="/following" data-ai="jobs.following" className="flex flex-col gap-2 rounded-xl border border-primary-line bg-primary-tint p-3 transition-colors hover:bg-primary-soft">
          <span className="flex items-center justify-between font-semibold">
            Following
            {followingNew > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">{followingNew} new</span>}
          </span>
          {following.length ? (
            <span className="flex items-center gap-1">
              {following.slice(0, 5).map((c) => (
                <MonoTile key={c} name={c} size="sm" className="size-7 rounded-md text-[9px]" />
              ))}
              {followedRoles > 0 && <span className="ml-1.5 text-[13px] text-text-secondary">+{followedRoles} role{followedRoles === 1 ? "" : "s"}</span>}
            </span>
          ) : (
            <span className="text-xs text-text-secondary">Follow companies to hear when they hire.</span>
          )}
        </Link>
        <nav aria-label="Your searches" className="hidden flex-col gap-3 pt-2 lg:flex">
          {threads === null && <Skeleton className="h-40 rounded-xl" />}
          {grouped.map(({ g, ts }) => (
            <div key={g} className="flex flex-col gap-0.5">
              <p className="eyebrow px-2.5 pb-1">{g}</p>
              {ts.map((t) => {
                const run = t.discovery_runs[0]
                const n = jobsIn(t)
                return (
                  <Link key={t.id} href={threadHref(t.id)} data-ai={`jobs.search:${t.id}`} className="flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-card">
                    <span className="line-clamp-2">{t.title ?? (run ? runTitle(run) : "New search")}</span>
                    {run?.status === "RUNNING" ? <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" /> : n > 0 && <span className="shrink-0 text-[13px] font-bold text-primary tabular-nums">{n}</span>}
                  </Link>
                )
              })}
            </div>
          ))}
          {threads?.length === 0 && <p className="px-2.5 text-sm text-text-secondary">No searches yet.</p>}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-col gap-4 px-4 pt-4 pb-10 sm:px-6 lg:pr-8 lg:pl-6">
        <header data-tour="page-header" className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[260px] flex-1">
            <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">{company ? `Jobs at ${company}` : "All jobs"}</h1>
            <p className="mt-1.5 text-[15px] text-text-secondary">
              {tab === "discover" ? `${total} strong matches across all your searches, best first.` : tab === "hidden" ? "Jobs you marked not interested. Bring one back with the eye button." : `${total} jobs.`}
              {tab === "discover" && hidden > 0 && (
                <>
                  {` ${hidden} hidden because they don't accept applicants from ${country}. `}
                  <button type="button" onClick={() => change(() => setFilters((f) => ({ ...f, local: false })))} className="font-semibold text-primary hover:underline">
                    Show them
                  </button>
                </>
              )}
            </p>
          </div>
          <Button data-ai="jobs.top-ten" onClick={() => void topTen()} className="h-12 gap-2 rounded-xl px-5 text-[15px]">
            <Sparkles className="size-4" />
            Select my top 10
          </Button>
        </header>

        <div data-tour="jobs-status" className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Jobs" className="flex items-center gap-1 border-r border-foreground/10 pr-2">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} data-ai={`jobs.tab.${t.key}`} onClick={() => change(() => setTab(t.key))} className={cn("rounded-xl px-3.5 py-2 text-[15px] transition-colors", tab === t.key ? "bg-foreground font-semibold text-white" : "text-foreground hover:bg-card")}>
                {t.label}
              </button>
            ))}
          </div>
          {company && (
            <button type="button" onClick={() => change(() => router.replace("/jobs"))} className="flex h-9 items-center gap-1.5 rounded-full border border-primary-line bg-primary-soft px-3.5 text-[13.5px] font-medium text-primary">
              At {company}
              <X className="size-3.5" aria-label="Show all companies" />
            </button>
          )}
          {country && (
            <Chip on={filters.local} onClick={() => change(() => setFilters((f) => ({ ...f, local: !f.local })))}>
              Can apply from {country}
            </Chip>
          )}
          <Chip on={filters.remote} onClick={() => change(() => setFilters((f) => ({ ...f, remote: !f.remote })))}>
            Remote
          </Chip>
          <Chip on={filters.senior} onClick={() => change(() => setFilters((f) => ({ ...f, senior: !f.senior })))}>
            Senior
          </Chip>
          <label className={cn("relative flex h-9 items-center rounded-full border text-[13.5px] font-medium", filters.posted ? "border-primary-line bg-primary-soft text-primary" : "bg-card")}>
            <span className="sr-only">Posted</span>
            <select value={filters.posted} onChange={(e) => change(() => setFilters((f) => ({ ...f, posted: Number(e.target.value) })))} className="h-full appearance-none bg-transparent pr-8 pl-3.5 outline-none">
              {POSTED.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 size-3.5" />
          </label>
          <label className={cn("relative flex h-9 items-center rounded-full border text-[13.5px] font-medium", filters.salary ? "border-primary-line bg-primary-soft text-primary" : "bg-card")}>
            <span className="sr-only">Salary</span>
            <select value={filters.salary ? "1" : "0"} onChange={(e) => change(() => setFilters((f) => ({ ...f, salary: e.target.value === "1" })))} className="h-full appearance-none bg-transparent pr-8 pl-3.5 outline-none">
              <option value="0">Salary</option>
              <option value="1">Shows salary</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 size-3.5" />
          </label>
        </div>

        {error && <p className="rounded-xl border border-destructive/30 bg-danger-soft p-3 text-sm text-destructive">{error}</p>}
        {items === null && !error && (
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-[78px] rounded-2xl" />
            ))}
          </div>
        )}
        {items?.length === 0 && (
          <div className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-6 sm:flex-row sm:items-center">
            <PlatoNote variant="headline" className="flex-1">
              {tab === "saved" ? "Nothing saved yet. Bookmark a job to keep it here." : tab === "applied" ? "No applications yet. Select jobs and Plato applies for you." : tab === "hidden" ? "Nothing hidden." : "No matches here yet. Start a search and Plato ranks every posting against your profile."}
            </PlatoNote>
            {tab === "discover" && (
              <Button onClick={newSearch} disabled={creating} className="gap-2 rounded-xl">
                <Plus className="size-4" />
                New search
              </Button>
            )}
          </div>
        )}

        {!!items?.length && (
          <motion.ul data-tour="jobs-table" variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-2.5">
            {items.map((m) => {
              const app = m.application_status ? APPLICATION_STATUS[m.application_status] : null
              const canApply = open(m)
              const elig = m.job.eligibility
              return (
                <motion.li key={m.id} variants={fadeUpItem} className="group flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3.5 transition-colors hover:border-primary-line sm:flex-nowrap">
                  <input type="checkbox" aria-label={`Select ${m.job.title}`} disabled={!canApply} checked={selected.has(m.job.id)} onChange={() => toggleSel(m.job.id)} className="size-5 shrink-0 accent-primary disabled:opacity-30" />
                  <MonoTile name={m.job.company} />
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <a href={m.job.url} target="_blank" rel="noreferrer" data-ai={`jobs.job:${m.job.id}`} className="text-base font-bold tracking-tight hover:text-primary">
                        {m.job.title}
                      </a>
                      <span className="text-[13px] text-text-secondary">{[...new Set([m.job.company, m.job.location, REMOTE[m.job.remote_type], m.job.posted_at && timeAgo(m.job.posted_at), m.job.job_type].filter(Boolean))].join(" · ")}</span>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <PlatoNote variant="inline">{m.reasons?.length ? `Matches your ${list(m.reasons)}` : m.match_label}</PlatoNote>
                      {elig && elig.status !== "open" && elig.note && <span className="rounded-md bg-warning-soft px-1.5 py-px text-[12.5px] font-semibold text-warning-ink">{elig.note}</span>}
                    </div>
                  </div>
                  <MatchPill value={m.match_percent} />
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => toggleSave(m)} aria-pressed={m.saved} aria-label={m.saved ? "Unsave job" : "Save job"} className={cn("flex size-9 items-center justify-center rounded-full transition-[colors,opacity] hover:bg-muted focus-visible:opacity-100", m.saved ? "text-primary" : "text-lavender opacity-0 group-hover:opacity-100 hover:text-text-secondary")}>
                      <Bookmark className={cn("size-4", m.saved && "fill-current")} />
                    </button>
                    <button type="button" onClick={() => toggleHide(m)} aria-label={m.hidden ? "Show again" : "Not interested"} title={m.hidden ? "Show again" : "Not interested"} className="flex size-9 items-center justify-center rounded-full text-lavender opacity-0 transition-[colors,opacity] group-hover:opacity-100 hover:bg-muted hover:text-text-secondary focus-visible:opacity-100">
                      <EyeOff className="size-4" />
                    </button>
                    {app && !canApply ? (
                      <span className={cn("ml-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", app.tone.replace("text-warning", "text-warning-ink").replace("text-success", "text-success-ink"))} title={app.hint}>
                        {app.label}
                      </span>
                    ) : (
                      <Button data-ai={`jobs.apply:${m.job.id}`} onClick={() => setApply([m.job.id])} className="ml-1 h-10 rounded-lg px-5 font-semibold">
                        Apply
                      </Button>
                    )}
                  </span>
                </motion.li>
              )
            })}
          </motion.ul>
        )}

        {/* The owner's bottom bar: what is selected, what to do with it, and the pages. */}
        {!!items?.length && (
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-[0_18px_40px_-20px_rgb(0_58_110/0.35)] sm:mr-[200px]">
            {selected.size > 0 ? (
              <>
                <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-white tabular-nums">{selected.size}</span>
                <b>selected</b>
                <button type="button" onClick={() => setSelected(new Set())} className="text-sm text-text-secondary underline hover:text-foreground">
                  Clear
                </button>
                <Button data-ai="jobs.apply-selected" variant="outline" onClick={() => setApply([...selected])} className="rounded-xl bg-card px-5">
                  Apply
                </Button>
                <Button data-ai="jobs.tailor-selected" onClick={() => router.push(`/jobs/review?ids=${[...selected].join(",")}`)} className="rounded-xl px-5">
                  Tailor & apply
                </Button>
              </>
            ) : (
              <span className="text-[13px] text-text-secondary">Tick jobs to apply to several at once. Plato writes a resume for each.</span>
            )}
            <span className="ml-auto flex items-center gap-2 text-[13px] text-text-tertiary tabular-nums">
              {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + items.length} of {total}
              <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((n) => n - 1)} className="flex size-8 items-center justify-center rounded-lg border bg-card disabled:opacity-40">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage((n) => n + 1)} className="flex size-8 items-center justify-center rounded-lg border bg-card disabled:opacity-40">
                <ChevronRight className="size-4" />
              </button>
            </span>
          </div>
        )}
      </main>

      <ExtensionApplyModal
        open={!!apply}
        count={apply?.length ?? 0}
        req={{ jobIds: apply ?? [] }}
        onClose={() => {
          setApply(null)
          setSelected(new Set())
        }}
      />
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors", on ? "border-primary-line bg-primary-soft text-primary" : "bg-card text-foreground hover:border-primary-line")}>
      {on && <Check className="size-3.5" />}
      {children}
    </button>
  )
}

export default function JobsPage() {
  return (
    <Suspense>
      <JobsContent />
    </Suspense>
  )
}
