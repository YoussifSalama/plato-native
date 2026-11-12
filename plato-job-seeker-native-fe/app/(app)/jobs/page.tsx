"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion } from "motion/react"
import { Bookmark, ExternalLink, LayoutGrid, Rows3, X, ChevronLeft, ChevronRight, EyeOff, Plus, Send, Sparkles } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { PAGE } from "@/components/page-header"
import { Checkbox } from "@/components/ui/checkbox"
import { PillTabs, type PillTab } from "@/components/pill-tabs"
import { FilterChip, FilterSelect } from "@/components/filter-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { ExtensionApplyModal } from "@/components/extension-apply-modal"
import { InfoTip } from "@/components/info-tip"
import { EmptyState, MatchPill, MonoTile, PlatoNote } from "@/components/plato-ui"
import { getProfile } from "@/lib/documents/api"
import { createThread, getDiscoveryStats, getMatches, setHidden, setSaved, type DiscoveryStats, type JobMatch, type MatchFilters, type MatchTab, type ThreadSummary } from "@/lib/jobs/api"
import { APPLICATION_STATUS } from "@/lib/jobs/application-status"
import { threadHref, timeAgo } from "@/lib/jobs/links"
import { SearchesSidebar } from "./components/searches-sidebar"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"

// Jobs (owner screen 06): your searches on the left, every match across them on the right.
// Each search is a Plato chat thread (/jobs/[threadId]); "New search" starts one.
const PAGE_SIZE = 10
const REMOTE: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site", UNKNOWN: "" }
// Sources send FULL_TIME / Full Time / Full-time; show one form.
const jobType = (t: string | null) => (t ? t.replace(/[_\s]+/g, "-").toLowerCase().replace(/^(full|part)time/, "$1-time").replace(/^./, (c) => c.toUpperCase()) : null)
const POSTED = [
  [0, "Posted: any time"],
  [1, "Posted: past day"],
  [3, "Posted: past 3 days"],
  [7, "Posted: past week"],
  [30, "Posted: past month"],
] as const
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`)
type Filters = { local: boolean; remote: boolean; senior: boolean; posted: number; salary: boolean }

function JobsContent() {
  const router = useRouter()
  // "See roles" on Following opens this page for one company.
  const params = useSearchParams()
  const company = params.get("company")?.trim() || null
  // The tab lives in the URL (/jobs?tab=saved), so Back from a job or the review page lands on it again.
  const tabParam = params.get("tab")
  const tab: MatchTab = (["discover", "saved", "applied", "hidden"] as const).find((t) => t === tabParam) ?? "discover"
  const setTab = (next: MatchTab) => {
    const q = new URLSearchParams(params.toString())
    if (next === "discover") q.delete("tab")
    else q.set("tab", next)
    router.replace(q.toString() ? `/jobs?${q}` : "/jobs", { scroll: false })
  }
  // List or cards, remembered per browser (a personal layout choice).
  const [cards, setCards] = useState(false)
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration; the server can't know it
      setCards(localStorage.getItem("plato.jobs.view") === "cards")
    } catch {}
  }, [])
  const setView = (v: "list" | "cards") => {
    setCards(v === "cards")
    try {
      localStorage.setItem("plato.jobs.view", v)
    } catch {}
  }
  // Old links (/jobs?search=<id>) open the search's own page, the one place a search lives.
  const searchId = params.get("search")
  useEffect(() => {
    if (searchId) router.replace(threadHref(searchId))
  }, [searchId, router])
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [stats, setStats] = useState<DiscoveryStats | null>(null)
  const [appliedTotal, setAppliedTotal] = useState<number | null>(null)
  const [country, setCountry] = useState<string | null>(null)
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
    getDiscoveryStats()
      .then(setStats)
      .catch(() => setStats(null))
    // The Applied tab's count is what that tab lists (every status), not only the sent ones.
    getMatches({ tab: "applied", take: 1 })
      .then((r) => setAppliedTotal(r.total))
      .catch(() => setAppliedTotal(null))
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
  const TABS: PillTab<MatchTab>[] = [
    { key: "discover", label: "For you" },
    { key: "saved", label: "Saved", count: stats?.saved },
    { key: "applied", label: "Applied", count: appliedTotal ?? undefined },
    { key: "hidden", label: "Hidden" },
  ]
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  // Which screen the page tour explains: no searches yet, an empty tab, or a tab with jobs.
  const screen = items === null ? undefined : items.length === 0 ? (tab === "discover" && threads?.length === 0 ? "jobs.new" : `jobs.${tab}.empty`) : `jobs.${tab}`

  return (
    // Same partition as the review page: the page title across the top, then two cards (searches | jobs).
    <div className={PAGE} data-tour-state={screen}>
        <header data-tour="page-header" className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[260px] flex-1">
            <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">{company ? `Jobs at ${company}` : "All jobs"}</h1>
            <p className="mt-1.5 text-[15px] text-text-secondary">
              {items === null && !error ? "Loading your matches…" : tab === "discover" ? `${total} strong matches across all your searches, best first.` : tab === "hidden" ? "Jobs you marked not interested. Bring one back with the eye button." : `${total} jobs.`}
              {items !== null && tab !== "hidden" && (
                <InfoTip
                  className="mx-1"
                  text="The % on each job is how well its title and description match your roles, skills and experience, scaled to your own results: your strongest matches read close to 100%."
                  label="What match % means"
                />
              )}
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
          <span className="flex items-center gap-2">
            <Button data-ai="jobs.top-ten" onClick={() => void topTen()} className="gap-2">
              <Sparkles className="size-4" />
              Select my top 10
            </Button>
            <InfoTip text="Ticks the 10 best-matched jobs on this list that you haven't applied to yet. Nothing is sent until you press Apply or Tailor & apply." label="What Select my top 10 does" side="bottom" />
          </span>
        </header>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <SearchesSidebar activeId={null} onThreads={setThreads} />

      <main className="flex min-w-0 flex-col gap-4">

        <div data-tour="jobs-status" className="flex flex-wrap items-center gap-2">
          <PillTabs id="jobs-tabs" tabs={TABS} value={tab} onChange={(k) => change(() => setTab(k))} label="Jobs" dataAi="jobs.tab" />
          {company && (
            <button type="button" onClick={() => change(() => router.replace("/jobs"))} className="flex h-9 items-center gap-1.5 rounded-full border border-primary-line bg-primary-soft px-3.5 text-[13.5px] font-medium text-primary">
              At {company}
              <X className="size-3.5" aria-label="Show all companies" />
            </button>
          )}
          {country && (
            <span className="flex items-center gap-1">
              <FilterChip on={filters.local} onClick={() => change(() => setFilters((f) => ({ ...f, local: !f.local })))}>
                Can apply from {country}
              </FilterChip>
              <InfoTip text={`Hides jobs whose posting says it only takes applicants from regions that leave out ${country}. Jobs that state no restriction stay in, so check the note on on-site roles abroad.`} label={`What Can apply from ${country} does`} />
            </span>
          )}
          <FilterChip on={filters.remote} onClick={() => change(() => setFilters((f) => ({ ...f, remote: !f.remote })))}>
            Remote
          </FilterChip>
          <FilterChip on={filters.senior} onClick={() => change(() => setFilters((f) => ({ ...f, senior: !f.senior })))}>
            Senior
          </FilterChip>
          <FilterSelect label="Posted" value={String(filters.posted)} onChange={(v) => change(() => setFilters((f) => ({ ...f, posted: Number(v) })))} options={POSTED.map(([v, l]) => ({ value: String(v), label: l }))} />
          <FilterChip on={filters.salary} onClick={() => change(() => setFilters((f) => ({ ...f, salary: !f.salary })))}>
            Shows salary
          </FilterChip>
          <PillTabs id="jobs-view" className="ml-auto" label="Layout" dataAi="jobs.view" value={cards ? "cards" : "list"} onChange={(v) => setView(v)} tabs={[{ key: "list", label: "List", icon: Rows3 }, { key: "cards", label: "Cards", icon: LayoutGrid }]} />
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
          <div data-tour="jobs-empty">
          <EmptyState
            className="bg-card py-10"
            icon={tab === "saved" ? Bookmark : tab === "applied" ? Send : tab === "hidden" ? EyeOff : Sparkles}
            title={tab === "saved" ? "Nothing saved yet" : tab === "applied" ? "No applications yet" : tab === "hidden" ? "Nothing hidden" : "No matches here yet"}
            hint={tab === "saved" ? "Bookmark a job to keep it here." : tab === "applied" ? "Select jobs and Plato applies for you." : tab === "hidden" ? "Jobs you mark not interested land here." : "Start a search and Plato ranks every posting against your profile."}
            action={
              tab === "discover" && (
                <Button onClick={newSearch} disabled={creating} className="gap-2 rounded-xl">
                  <Plus className="size-4" />
                  New search
                </Button>
              )
            }
          />
          </div>
        )}

        {!!items?.length && (
          <motion.ul data-tour="jobs-table" variants={staggerContainer} initial="hidden" animate="show" className={cn(cards ? "grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3" : "flex flex-col gap-2.5")}>
            {items.map((m) => {
              const app = m.application_status ? APPLICATION_STATUS[m.application_status] : null
              const canApply = open(m)
              const elig = m.job.eligibility
              const meta = [...new Set([m.job.company, m.job.location, REMOTE[m.job.remote_type], m.job.posted_at && timeAgo(m.job.posted_at), jobType(m.job.job_type)].filter(Boolean))].join(" · ")
              // ponytail: disabled rows keep the box (dimmed) so the column stays aligned
              const check = <Checkbox aria-label={`Select ${m.job.title}`} disabled={!canApply} checked={selected.has(m.job.id)} onCheckedChange={() => toggleSel(m.job.id)} className="rounded-md bg-card hover:border-primary disabled:opacity-30" />
              const title = (
                <a href={m.job.url} target="_blank" rel="noreferrer" data-ai={`jobs.job:${m.job.id}`} className={cn("type-card-title hover:text-primary", cards && "line-clamp-2")}>
                  {m.job.title}
                </a>
              )
              const notes = (
                <div className="flex flex-wrap items-center gap-2">
                  <PlatoNote variant="inline">{m.reasons?.length ? `Matches your ${list(m.reasons)}` : m.match_label}</PlatoNote>
                  {elig && elig.status !== "open" && elig.note && <span className={cn("rounded-md px-1.5 py-px text-[12px] font-medium", elig.status === "restricted" ? "bg-warning-soft text-warning-ink" : elig.status === "relocation" ? "bg-info-soft text-info" : "bg-muted text-text-secondary")}>{elig.note}</span>}
                </div>
              )
              const actions = (
                <span className="ml-auto flex items-center gap-1">
                  <a href={m.job.url} target="_blank" rel="noreferrer" aria-label={`Open the ${m.job.title} posting`} title="Open the original posting" className="flex size-9 items-center justify-center rounded-full text-lavender transition-colors hover:bg-muted hover:text-primary">
                    <ExternalLink className="size-4" />
                  </a>
                  <button type="button" onClick={() => toggleSave(m)} aria-pressed={m.saved} aria-label={m.saved ? "Unsave job" : "Save job"} className={cn("flex size-9 items-center justify-center rounded-full transition-[colors,opacity] hover:bg-muted focus-visible:opacity-100", m.saved ? "text-primary" : "text-lavender hover:text-text-secondary [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100")}>
                    <Bookmark className={cn("size-4", m.saved && "fill-current")} />
                  </button>
                  <button type="button" onClick={() => toggleHide(m)} aria-label={m.hidden ? "Show again" : "Not interested"} title={m.hidden ? "Show again" : "Not interested"} className="flex size-9 items-center justify-center rounded-full text-lavender transition-[colors,opacity] hover:bg-muted hover:text-text-secondary focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                    <EyeOff className="size-4" />
                  </button>
                  {app && !canApply ? (
                    <span data-tour="jobs-row-status" className={cn("ml-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", app.tone.replace("text-warning", "text-warning-ink").replace("text-success", "text-success-ink"))} title={app.hint}>
                      {app.label}
                    </span>
                  ) : (
                    <Button data-ai={`jobs.apply:${m.job.id}`} onClick={() => setApply([m.job.id])} size="sm" className="ml-1 bg-primary-soft px-4 font-semibold text-primary shadow-none hover:bg-primary hover:text-primary-foreground">
                      Apply
                    </Button>
                  )}
                </span>
              )
              const shell = cn("group rounded-2xl border bg-card shadow-card transition-colors duration-200 hover:border-primary-line", selected.has(m.job.id) && "border-primary-line bg-primary-tint")
              return cards ? (
                <motion.li key={m.id} variants={fadeUpItem} className={cn(shell, "card-lift flex flex-col gap-3 p-4")}>
                  <div className="flex items-center gap-3">
                    {check}
                    <MonoTile name={m.job.company} />
                    <span className="ml-auto">
                      <MatchPill value={m.match_percent} />
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    {title}
                    <span className="line-clamp-2 type-meta text-text-secondary" title={m.job.location ?? undefined}>{meta}</span>
                  </div>
                  {notes}
                  <div className="mt-auto flex items-center border-t border-divider pt-3">{actions}</div>
                </motion.li>
              ) : (
                <motion.li key={m.id} variants={fadeUpItem} className={cn(shell, "flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap")}>
                  {check}
                  <MonoTile name={m.job.company} />
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                      {title}
                      <span className="max-w-full truncate type-meta text-text-secondary" title={m.job.location ?? undefined}>{meta}</span>
                    </p>
                    <div className="mt-1">{notes}</div>
                  </div>
                  <MatchPill value={m.match_percent} />
                  {actions}
                </motion.li>
              )
            })}
          </motion.ul>
        )}

        {/* The owner's bottom bar: what is selected, what to do with it, and the pages. */}
        {!!items?.length && (
          <div data-tour="jobs-bulk-bar" className="sticky bottom-[92px] z-10 flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-[0_18px_40px_-20px_rgb(0_58_110/0.35)] mr-12 sm:bottom-4 sm:mr-[200px]">
            {selected.size > 0 ? (
              <>
                <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-white tabular-nums">{selected.size}</span>
                <b>selected</b>
                <button type="button" onClick={() => setSelected(new Set())} className="text-sm text-text-secondary underline transition-colors duration-200 hover:text-foreground">
                  Clear
                </button>
                <Button data-ai="jobs.apply-selected" variant="outline" onClick={() => setApply([...selected])} className="rounded-xl bg-card px-5">
                  Apply
                </Button>
                <Button
                  data-ai="jobs.tailor-selected"
                  onClick={() => {
                    // The review page writes resumes one by one; hand it the names so the queue isn't "Job 5, Job 6…".
                    try {
                      sessionStorage.setItem("plato.review.jobs", JSON.stringify(Object.fromEntries((items ?? []).filter((m) => selected.has(m.job.id)).map((m) => [m.job.id, { title: m.job.title, company: m.job.company }]))))
                    } catch {}
                    router.push(`/jobs/review?ids=${[...selected].join(",")}`)
                  }}
                  className="rounded-xl px-5"
                >
                  Tailor & apply
                </Button>
              </>
            ) : (
              <span className="flex items-center gap-1.5 text-[13px] text-text-secondary">
                Tick jobs to apply to several at once. Plato writes a resume for each.
                <InfoTip text="Apply adds the jobs to your browser extension's queue straight away, and you pick the resume there. Tailor & apply first writes a resume for each job for you to review and approve before anything is queued." label="Apply vs Tailor & apply" />
              </span>
            )}
            <span className="ml-auto flex items-center gap-2 text-[13px] text-text-tertiary tabular-nums">
              {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + items.length} of {total}
              <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((n) => n - 1)} className="flex size-8 items-center justify-center rounded-lg border bg-card text-text-secondary transition-colors duration-200 hover:border-primary-line hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text-secondary">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage((n) => n + 1)} className="flex size-8 items-center justify-center rounded-lg border bg-card text-text-secondary transition-colors duration-200 hover:border-primary-line hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text-secondary">
                <ChevronRight className="size-4" />
              </button>
            </span>
          </div>
        )}
      </main>
      </div>

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

export default function JobsPage() {
  return (
    <Suspense>
      <JobsContent />
    </Suspense>
  )
}
