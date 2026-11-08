"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { Bookmark, Briefcase, Check, EyeOff, Loader2, Plus, Sparkles } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ExtensionApplyModal } from "@/components/extension-apply-modal"
import { MatchPill, MonoTile, PlatoNote, Segmented } from "@/components/plato-ui"
import { getInsights } from "@/lib/insights/api"
import { createThread, getDiscoveryStats, getMatches, listThreads, setHidden, setSaved, type DiscoveryStats, type JobMatch, type MatchFilters, type MatchTab, type ThreadSummary } from "@/lib/jobs/api"
import { APPLICATION_STATUS } from "@/lib/jobs/application-status"
import { runTitle, threadHref, timeAgo } from "@/lib/jobs/links"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"

// Jobs (screen 06): your searches on the left, every match across them on the right.
// Each search is a Plato chat thread (/jobs/[threadId]); "New search" starts one.
const PAGE_SIZE = 20
const REMOTE: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site", UNKNOWN: "" }
const GROUPS = ["Today", "Yesterday", "Previous 7 days", "Older"] as const
const groupOf = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = (today.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 864e5
  return diff <= 0 ? "Today" : diff <= 1 ? "Yesterday" : diff <= 7 ? "Previous 7 days" : "Older"
}
const jobsIn = (t: ThreadSummary) => {
  const run = t.discovery_runs[0]
  return run ? (run.progress?.ranked ?? run.matched) : 0
}
type Filters = { remote: boolean; senior: boolean; recent: boolean }

export default function JobsPage() {
  const router = useRouter()
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [stats, setStats] = useState<DiscoveryStats | null>(null)
  const [following, setFollowing] = useState<string[]>([])
  const [tab, setTab] = useState<MatchTab>("discover")
  const [filters, setFilters] = useState<Filters>({ remote: false, senior: false, recent: false })
  const [items, setItems] = useState<JobMatch[] | null>(null)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
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
      .then((i) => setFollowing(i.alerts.filter((a) => a.kind === "COMPANY" && a.company).map((a) => a.company as string)))
      .catch(() => setFollowing([]))
  }, [])

  const query = useMemo<MatchFilters>(() => ({ tab, sort: "best", ...(filters.remote && { remoteType: "REMOTE" as const }), ...(filters.senior && { level: "senior" as const }), ...(filters.recent && { postedWithinDays: 7 }) }), [tab, filters])
  useEffect(() => {
    let alive = true
    getMatches({ ...query, take: PAGE_SIZE })
      .then((r) => {
        if (!alive) return
        setItems(r.items)
        setTotal(r.total)
        setError(null)
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load jobs"))
    return () => {
      alive = false
    }
  }, [query])

  async function more() {
    setLoadingMore(true)
    try {
      const r = await getMatches({ ...query, skip: items?.length ?? 0, take: PAGE_SIZE })
      setItems((cur) => [...(cur ?? []), ...r.items])
    } finally {
      setLoadingMore(false)
    }
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
  async function hide(m: JobMatch) {
    setItems((cur) => cur?.filter((x) => x.id !== m.id) ?? cur)
    setTotal((n) => n - 1)
    await setHidden(m.job.id, true).catch(() => undefined)
  }
  const open = (m: JobMatch) => !m.application_status || m.application_status === "FAILED"
  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const topTen = () => setSelected(new Set((items ?? []).filter(open).slice(0, 10).map((m) => m.job.id)))

  const grouped = GROUPS.map((g) => ({ g, ts: (threads ?? []).filter((t) => groupOf(t.updated_at) === g) })).filter((x) => x.ts.length)

  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
      {/* Searches: each one is a Plato conversation that keeps running. */}
      <aside data-tour="jobs-toolbar" className="flex flex-col gap-2 px-4 pt-3 pb-4 sm:px-6 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pr-2 lg:pl-8">
        <Button data-ai="jobs.new-search" variant="outline" onClick={newSearch} disabled={creating} className="h-11 justify-start gap-2 rounded-xl bg-card text-[15px]">
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          New search
        </Button>
        <span className="flex items-center justify-between rounded-xl border bg-card px-3 py-2.5 shadow-card">
          <span className="flex items-center gap-2 font-semibold">
            <Briefcase className="size-4" />
            All jobs
          </span>
          {stats && <span className="text-[13px] font-bold text-primary tabular-nums">{stats.shortlisted}</span>}
        </span>
        <Link href="/following" data-ai="jobs.following" className="flex flex-col gap-2 rounded-xl border border-primary-line bg-primary-tint/80 p-3 transition-colors hover:bg-primary-soft">
          <span className="flex items-center justify-between font-semibold">
            Following
            {following.length > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">{following.length}</span>}
          </span>
          {following.length ? (
            <span className="flex gap-1">
              {following.slice(0, 5).map((c) => (
                <MonoTile key={c} name={c} size="sm" className="size-7 rounded-md text-[9px]" />
              ))}
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
                  <Link key={t.id} href={threadHref(t.id)} data-ai={`jobs.search:${t.id}`} className="flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-white/60">
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

      <main className="flex min-w-0 flex-col gap-4 px-4 pt-3 pb-10 sm:px-6 lg:pr-8 lg:pl-4">
        <header data-tour="page-header" className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[260px] flex-1">
            <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">All jobs</h1>
            <p className="mt-1.5 text-[15px] text-text-secondary">
              {stats ? `${stats.shortlisted} matches across all your searches, best first.` : "Every match across your searches, best first."}
              {stats?.hidden ? ` ${stats.hidden} hidden as not interested.` : ""}
            </p>
          </div>
          <Button data-ai="jobs.top-ten" onClick={topTen} disabled={!items?.some(open)} className="h-12 gap-2 rounded-xl px-5 text-[15px]">
            <Sparkles className="size-4" />
            Select my top 10
          </Button>
        </header>

        <div data-tour="jobs-status" className="flex flex-wrap items-center gap-2">
          <Segmented<MatchTab>
            value={tab}
            onChange={(t) => (setTab(t), setSelected(new Set()), setItems(null))}
            options={[
              { value: "discover", label: "For you" },
              { value: "saved", label: `Saved${stats ? ` · ${stats.saved}` : ""}` },
              { value: "applied", label: "Applied" },
            ]}
          />
          {(
            [
              ["remote", "Remote"],
              ["senior", "Senior"],
              ["recent", "Posted this week"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={filters[k]} onClick={() => (setFilters((f) => ({ ...f, [k]: !f[k] })), setItems(null))} className={cn("flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors", filters[k] ? "border-primary-line bg-primary-soft text-primary" : "bg-card text-foreground hover:border-primary-line")}>
              {filters[k] && <Check className="size-3.5" />}
              {label}
            </button>
          ))}
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
          <div className="flex flex-col items-start gap-3 rounded-[22px] border bg-card p-6 shadow-card sm:flex-row sm:items-center">
            <PlatoNote variant="headline" className="flex-1">
              {tab === "saved" ? "Nothing saved yet. Bookmark a job to keep it here." : tab === "applied" ? "No applications yet. Select jobs and Plato applies for you." : "No matches here yet. Start a search and Plato ranks every posting against your profile."}
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
                <motion.li key={m.id} variants={fadeUpItem} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3.5 shadow-card transition-colors hover:border-primary-line sm:flex-nowrap">
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
                      <PlatoNote variant="inline">{m.match_label}</PlatoNote>
                      {elig && elig.status !== "open" && elig.note && <span className="rounded-md bg-warning-soft px-1.5 py-px text-[12.5px] font-semibold text-warning-ink">{elig.note}</span>}
                    </div>
                  </div>
                  <MatchPill value={m.match_percent} />
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => toggleSave(m)} aria-pressed={m.saved} aria-label={m.saved ? "Unsave job" : "Save job"} className={cn("flex size-9 items-center justify-center rounded-full transition-colors hover:bg-muted", m.saved ? "text-primary" : "text-lavender hover:text-text-secondary")}>
                      <Bookmark className={cn("size-4", m.saved && "fill-current")} />
                    </button>
                    <button type="button" onClick={() => hide(m)} aria-label="Not interested" title="Not interested" className="flex size-9 items-center justify-center rounded-full text-lavender transition-colors hover:bg-muted hover:text-text-secondary">
                      <EyeOff className="size-4" />
                    </button>
                    {app && !canApply ? (
                      <span className={cn("ml-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", app.tone.replace("text-warning", "text-warning-ink").replace("text-success", "text-success-ink"))} title={app.hint}>
                        {app.label}
                      </span>
                    ) : (
                      <Button data-ai={`jobs.apply:${m.job.id}`} onClick={() => setApply([m.job.id])} className="ml-1 rounded-xl px-5">
                        Apply
                      </Button>
                    )}
                  </span>
                </motion.li>
              )
            })}
          </motion.ul>
        )}

        {!!items?.length &&
          (selected.size > 0 ? (
            <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-[0_18px_40px_-20px_rgb(0_58_110/0.45)]">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-white tabular-nums">{selected.size}</span>
              <b>selected</b>
              <button type="button" onClick={() => setSelected(new Set())} className="text-sm text-text-secondary underline hover:text-foreground">
                Clear
              </button>
              <span className="flex-1" />
              <span className="hidden text-[13px] text-text-secondary sm:inline">Plato writes a resume for each job. Nothing is sent until you confirm.</span>
              <Button data-ai="jobs.apply-selected" onClick={() => setApply([...selected])} className="rounded-xl px-5">
                Apply to {selected.size}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[13px] text-text-tertiary">
              <span>
                Showing {items.length} of {total}
              </span>
              {items.length < total && (
                <Button variant="outline" onClick={more} disabled={loadingMore} className="rounded-xl bg-card">
                  {loadingMore && <Loader2 className="size-4 animate-spin" />}
                  Show more
                </Button>
              )}
            </div>
          ))}
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
