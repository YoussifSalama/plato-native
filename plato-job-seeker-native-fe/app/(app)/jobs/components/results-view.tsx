"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ExtensionApplyModal } from "@/components/extension-apply-modal"
import { AnimatePresence, motion } from "motion/react"
import {
  Bookmark,
  Bot,
  Briefcase,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Clock,
  Copy,
  Inbox,
  ListChecks,
  ExternalLink,
  EyeOff,
  FileSpreadsheet,
  Globe,
  Loader2,
  MapPin,
  MoreHorizontal,
  Sparkles,
  Star,
  TriangleAlert,
  Undo2,
  UserRound,
  X,
  Zap,
} from "lucide-react"
import { cn } from "cn"
import { Checkbox } from "@/components/ui/checkbox"
import { FilterChip, FilterSelect } from "@/components/filter-controls"
import { SOURCE_LABEL, type JobSourceName, exportMatches, getFacets, getMatches,  setHidden, setSaved, attributionLabel, type DiscoveryRun, type Facets, type JobMatch, type JobTypeKey, type MatchFilters, type MatchLevel, type MatchSort, type MatchTab, type UiCommand } from "@/lib/jobs/api"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"
import { CompanyAvatar } from "@/components/company-avatar"
import { APPLICATION_STATUS, applicationHref, applicationReason } from "@/lib/jobs/application-status"
import { Skeleton } from "@/components/ui/skeleton"
import { CARD, EmptyState, Kpi, SectionHeader, StatIcon } from "@/components/plato-ui"
import { InfoTip } from "@/components/info-tip"

const PAGE_SIZE = 10
const TOP_N = 15

const ANY = "any"
type Opt = { value: string; label: string }
// The shared FilterSelect takes plain labels, so the facet count rides in the label.
const opt = (value: string, label: string, count?: number): Opt => ({ value, label: count === undefined ? label : `${label} · ${count}` })
const SORT_OPTIONS: { value: MatchSort; label: string }[] = [
  { value: "best", label: "Best match" },
  { value: "newest", label: "Newest" },
  { value: "salary", label: "Highest salary" },
  { value: "company", label: "Company A–Z" },
]
const TAB_EMPTY: Record<MatchTab, string> = {
  discover: "No jobs match these filters. Try clearing them or ask Plato to search again.",
  saved: "Nothing saved yet — tap the bookmark on a job to keep it here.",
  applied: "You haven't asked Plato to apply to anything yet.",
  recommended: "No recommendations yet — run a search first.",
  hidden: "Nothing hidden. Jobs you mark “not interested” go here.",
}

function timeAgo(iso: string | null) {
  if (!iso) return "Recently posted"
  const days = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000))
  return days === 0 ? "Posted today" : `Posted ${days} day${days === 1 ? "" : "s"} ago`
}
function remoteLabel(t: JobMatch["job"]["remote_type"]) {
  return t === "UNKNOWN" ? null : t === "ONSITE" ? "On-site" : t[0] + t.slice(1).toLowerCase()
}
function jobTypeLabel(t: string | null) {
  if (!t) return null
  const s = t.toLowerCase()
  if (s.includes("full")) return "Full-time"
  if (s.includes("part")) return "Part-time"
  if (s.includes("contract")) return "Contract"
  if (s.includes("intern")) return "Internship"
  return t
}
function salaryLabel(j: JobMatch["job"]) {
  if (!j.salary_min && !j.salary_max) return null
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n))
  const range = [j.salary_min, j.salary_max].filter((n): n is number => !!n).map(fmt).join("–")
  return `${range} ${j.salary_currency ?? ""}`.trim()
}

function MatchBadge({ label }: { label: JobMatch["match_label"] }) {
  return (
    <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", label === "Excellent match" ? "bg-success-soft text-success" : label === "Strong match" ? "bg-info-soft text-info" : "bg-muted text-text-secondary")}>
      {label}
    </span>
  )
}

function IconButton({ className, active, ...props }: React.ComponentProps<"button"> & { active?: boolean }) {
  return <button type="button" className={cn("flex size-[30px] items-center justify-center rounded-md transition-colors duration-200 hover:bg-primary-soft", active ? "text-primary" : "text-lavender hover:text-primary", className)} {...props} />
}

// Pill style for the row's action buttons (Export, Clear), matching the shared filter pills.
const PILL = "flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-[13.5px] font-medium whitespace-nowrap text-foreground transition-colors duration-200 hover:border-primary-line"

// Per-row actions behind the "…" button.
function RowMenu({ match, onSave, onHide }: { match: JobMatch; onSave: () => void; onHide: () => void }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])
  const item = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors duration-150 hover:bg-muted/60"
  return (
    <div ref={ref} className="relative">
      <IconButton aria-label="More actions" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="size-4" />
      </IconButton>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="absolute top-full right-0 z-20 mt-1 w-52 rounded-lg border bg-card p-1.5 shadow-[0_16px_40px_-20px_rgba(14,27,44,0.35)]">
            {match.application_id && (
              <Link href={applicationHref(match.application_id)} className={item} onClick={() => setOpen(false)}>
                <ClipboardList className="size-4 text-muted-foreground" />
                Open application
              </Link>
            )}
            <a href={match.job.apply_url ?? match.job.url} target="_blank" rel="noreferrer" className={item} onClick={() => setOpen(false)}>
              <ExternalLink className="size-4 text-muted-foreground" />
              Open posting
            </a>
            <button type="button" className={item} onClick={() => { onSave(); setOpen(false) }}>
              <Bookmark className={cn("size-4", match.saved ? "fill-primary text-primary" : "text-muted-foreground")} />
              {match.saved ? "Remove from saved" : "Save job"}
            </button>
            <button
              type="button"
              className={item}
              onClick={() => {
                void navigator.clipboard?.writeText(match.job.url).then(() => {
                  setCopied(true)
                  setTimeout(() => {
                    setCopied(false)
                    setOpen(false)
                  }, 900)
                })
              }}
            >
              <Copy className="size-4 text-muted-foreground" />
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button type="button" className={cn(item, !match.hidden && "text-destructive hover:bg-destructive/5")} onClick={() => { onHide(); setOpen(false) }}>
              {match.hidden ? <Undo2 className="size-4" /> : <EyeOff className="size-4" />}
              {match.hidden ? "Show again" : "Not interested"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function JobRow({ match, selected, highlight, position, onToggle, onSave, onHide }: { match: JobMatch; selected: boolean; highlight: boolean; position: number; searchId: string; onToggle: () => void; onSave: () => void; onHide: () => void }) {
  const { job } = match
  const remote = remoteLabel(job.remote_type)
  const where = job.location ? `${job.location}${remote ? ` (${remote})` : ""}` : remote
  const type = jobTypeLabel(job.job_type)
  const tags = [salaryLabel(job), job.easy_apply ? "Easy apply" : null].filter(Boolean) as string[]
  const credit = attributionLabel(job.source)
  const eligible = job.eligibility
  const router = useRouter()
  const [prepping, setPrepping] = useState(false)
  // Opens the interview flow with this job chosen; it asks the round, chat or voice and the style.
  const mock = () => {
    setPrepping(true)
    router.push(`/career/interviews/new?${new URLSearchParams({ target: "job", job: job.id, jt: job.title, jc: job.company })}`)
  }
  const app = match.application_status ? APPLICATION_STATUS[match.application_status] : null
  // Already with Plato (queued / applying / applied) → not selectable; a failed
  // attempt can be picked again to retry.
  const locked = !!match.application_status && match.application_status !== "FAILED"
  return (
    <motion.li id={`job-row-${position}`} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: match.hidden ? 0.55 : 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className={cn("group/row -mx-5 flex items-center gap-4 border-b border-divider px-5 py-4 transition-colors duration-200 last:border-b-0 hover:bg-primary-tint", highlight && "bg-primary-tint ring-2 ring-primary/40")}>
      <Checkbox
        checked={selected}
        disabled={locked}
        onCheckedChange={onToggle}
        aria-label={locked ? `${job.title} is already with Plato` : `Select ${job.title}`}
        title={locked ? `Already ${app?.label.toLowerCase()} — can't be selected again` : undefined}
        className="size-[18px] rounded-[5px] border-[1.5px] border-[#D5DEE8] disabled:opacity-40"
      />
      <CompanyAvatar name={job.company} domain={job.company_domain} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <a href={job.url} data-ai={`results.job:${position}`} target="_blank" rel="noreferrer" className="truncate text-base font-semibold text-foreground transition-colors duration-200 hover:text-primary">
            {job.title}
          </a>
          <MatchBadge label={match.match_label} />
          {app &&
            (match.application_id ? (
              <Link data-tour="results-row-status" href={applicationHref(match.application_id)} title="Open the application" className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap hover:underline", app.tone)}>
                {app.label}
              </Link>
            ) : (
              <span data-tour="results-row-status" className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", app.tone)}>{app.label}</span>
            ))}
        </div>
        <p className="mt-0.5 truncate text-sm text-text-secondary">{job.company}</p>
        {/* Say what happened, not just a status word. */}
        {match.application_status && ["FAILED", "NEEDS_INPUT", "NEEDS_USER_VERIFICATION", "EXPIRED", "SKIPPED"].includes(match.application_status) && (
          <p className={cn("mt-1 line-clamp-2 text-xs", match.application_status === "FAILED" ? "text-destructive" : "text-text-secondary")}>
            {applicationReason({ status: match.application_status, error: match.application_error })}
            {match.application_id && (
              <>
                {" "}
                <Link href={applicationHref(match.application_id)} className="font-medium text-primary hover:underline">
                  See what happened
                </Link>
              </>
            )}
          </p>
        )}
        <div className="mt-2 flex items-center gap-4 overflow-hidden text-[13px] whitespace-nowrap text-muted-foreground">
          {where && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {where}
            </span>
          )}
          {type && (
            <span className="flex items-center gap-1.5">
              <Briefcase className="size-3.5" />
              {type}
            </span>
          )}
          {job.remote_type !== "UNKNOWN" && !job.location && (
            <span className="flex items-center gap-1.5">
              <UserRound className="size-3.5" />
              {remote}
            </span>
          )}
        </div>
        {tags.length > 0 && (
          <div className="mt-2.5 flex items-center gap-2 overflow-hidden whitespace-nowrap">
            {tags.map((t) => (
              <span key={t} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                {t}
              </span>
            ))}
          </div>
        )}
        {/* Can you take it? Worked out from the posting's own stated regions. */}
        {eligible && (
          <p className={cn("mt-2 flex items-center gap-1.5 text-xs", eligible.status === "open" ? "text-success" : eligible.status === "unknown" ? "text-text-tertiary" : "text-warning")}>
            {eligible.status === "open" ? <CircleCheck className="size-3.5" /> : eligible.status === "unknown" ? <Globe className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
            <span className="truncate">{eligible.note}</span>
          </p>
        )}
        {/* Where it was found is a footnote, not the headline. */}
        <p className="mt-1.5 text-[11px] text-text-tertiary">
          <a href={job.url} target="_blank" rel="noreferrer" className="hover:text-text-secondary hover:underline">
            Original posting{credit ? ` · via ${credit}` : ""} ↗
          </a>
        </p>
      </div>
      <div className="hidden w-[116px] shrink-0 text-right sm:block">
        <span className="inline-block rounded-full bg-success-soft px-3 py-1 text-[13px] font-bold whitespace-nowrap text-success-ink tabular-nums">{match.match_percent}% match</span>
        <div className="mt-2 text-xs text-text-tertiary">{timeAgo(job.posted_at)}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <IconButton data-ai={`results.mock-interview:${position}`} aria-label="Practise the interview for this job" title={prepping ? "Opening the interview practice…" : "Practise the interview for this job"} disabled={prepping} onClick={mock}>
          {prepping ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
        </IconButton>
        <IconButton data-ai={`results.save:${position}`} aria-label={match.saved ? "Remove from saved" : "Save job"} aria-pressed={match.saved} active={match.saved} onClick={onSave}>
          <Bookmark className={cn("size-4", match.saved && "fill-current")} />
        </IconButton>
        <RowMenu match={match} onSave={onSave} onHide={onHide} />
      </div>
    </motion.li>
  )
}

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 6) return Array.from({ length: total }, (_, i) => i)
  const set = new Set([0, 1, 2, current - 1, current, current + 1, total - 1].filter((n) => n >= 0 && n < total))
  const sorted = [...set].sort((a, b) => a - b)
  const out: (number | "…")[] = []
  sorted.forEach((n, i) => {
    if (i && n - (sorted[i - 1] as number) > 1) out.push("…")
    out.push(n)
  })
  return out
}

type Query = { filters: MatchFilters; sort: MatchSort; page: number }
const EMPTY_QUERY: Query = { filters: {}, sort: "best", page: 0 }

function ResultsView({ run, threadId, tab, q, command, onState }: { run: DiscoveryRun; threadId: string; tab: MatchTab; q: string; command: UiCommand | null; onState?: (s: { items: JobMatch[]; filters: MatchFilters; sort: MatchSort }) => void }) {
  const [query, setQuery] = useState<Query>(EMPTY_QUERY)
  const { filters, sort, page } = query
  const [data, setData] = useState<{ total: number; items: JobMatch[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [selected, setSelected] = useState<Map<string, JobMatch>>(new Map())
  const [showAllSelected, setShowAllSelected] = useState(false)
  const applying = null // "Apply" only opens the connect modal now; the extension does the applying
  const [notice, setNotice] = useState<string | null>(null)
  // 1-based row the assistant pointed at; cleared after a few seconds.
  const [focusPos, setFocusPos] = useState<number | null>(null)
  // Applying submits real applications, so it is confirmed first. `forced`: asked for by the
  // assistant, which can never skip the dialog; a seeker can opt out of it for the buttons only.
  const [confirm, setConfirm] = useState<{ req: { top?: number; jobIds?: string[] }; count: number } | null>(null) // the "Apply with Plato" modal

  // Every query change flips loading on in the event handler (not the effect).
  function update(patch: Partial<Query>) {
    setLoading(true)
    setQuery((prev) => ({ ...prev, page: 0, ...patch }))
  }
  const setPage = (p: number) => update({ page: p })

  // Commands from the assistant, each applied once (adjust-state-during-render, not an effect).
  const [seenCommand, setSeenCommand] = useState<number | null>(null)
  if (command && command.id !== seenCommand) {
    setSeenCommand(command.id)
    const e = command.event
    if (e.type === "apply_filter") update({ filters: { ...filters, ...e.filters }, ...(e.sort && { sort: e.sort }) })
    else if (e.type === "remove_filter") update({ filters: e.keys === "all" ? {} : Object.fromEntries(Object.entries(filters).filter(([k]) => !(e.keys as string[]).includes(k))) })
    else if (e.type === "propose_apply") {
      const ok = (e.positions ?? []).map((n) => data?.items[n - 1]).filter((m): m is JobMatch => !!m && (!m.application_status || m.application_status === "FAILED"))
      if (e.positions && !ok.length) setNotice("None of those jobs can be applied to: they are not on screen or are already with Plato.")
      else setConfirm({ req: e.positions ? { jobIds: ok.map((m) => m.job.id) } : { top: e.top }, count: e.positions ? ok.length : (e.top ?? 0) })
    } else if (e.position > (data?.items.length ?? 0)) setNotice(`There is no job #${e.position} on screen.`)
    else setFocusPos(e.position)
  }
  // What is on screen, for the page to hand to the assistant with each message.
  useEffect(() => {
    onState?.({ items: data?.items ?? [], filters, sort })
  }, [data, filters, sort, onState])
  useEffect(() => {
    if (!focusPos) return
    document.getElementById(`job-row-${focusPos}`)?.scrollIntoView({ block: "center", behavior: "smooth" })
    const t = setTimeout(() => setFocusPos(null), 3500)
    return () => clearTimeout(t)
  }, [focusPos])
  const setFilter = <K extends keyof MatchFilters>(key: K, value: MatchFilters[K]) => update({ filters: { ...filters, [key]: value } })
  const activeFilterCount = Object.values(filters).filter((v) => v !== undefined && v !== false).length

  // Options come from the data itself: only values that exist, with the
  // count the filter will return.
  useEffect(() => {
    getFacets(threadId, tab).then(setFacets).catch(() => setFacets(null))
  }, [threadId, tab])
  const [exporting, setExporting] = useState(false)
  const locationOptions = [opt(ANY, "Location"), ...(facets?.locations ?? []).map((l) => opt(l.value, l.label, l.count))]
  const sourceOptions = [opt(ANY, "Source"), ...(facets?.sources ?? []).map((s) => opt(s.value, SOURCE_LABEL[s.value] ?? s.value, s.count))]
  const jobTypeOptions = [opt(ANY, "Job type"), ...(facets?.jobTypes ?? []).map((t) => opt(t.value, t.label, t.count))]
  const levelOptions = [opt(ANY, "Experience level"), ...(facets?.levels ?? []).map((l) => opt(l.value, l.label, l.count))]
  const postedLabel = (d: number) => (d === 1 ? "Last 24 hours" : `Last ${d} days`)
  const postedOptions = [opt(ANY, "Posted"), ...(facets?.posted ?? []).filter((p) => p.count > 0).map((p) => opt(String(p.value), postedLabel(p.value), p.count))]
  const salaryOptions = [
    opt(ANY, "Salary"),
    ...(facets && facets.salary.hasSalary > 0 ? [opt("has", "Has salary info", facets.salary.hasSalary)] : []),
    ...(facets?.salary.atLeast ?? []).filter((s) => s.count > 0).map((s) => opt(String(s.value), `≥ ${s.value / 1000}K`, s.count)),
  ]

  // Tab or search text changes come from the header; reset paging for them.
  const tabRef = useRef(tab)
  const qRef = useRef(q)
  useEffect(() => {
    if (tabRef.current !== tab || qRef.current !== q) {
      tabRef.current = tab
      qRef.current = q
      setLoading(true)
      setQuery((prev) => ({ ...prev, page: 0 }))
    }
  }, [tab, q])

  useEffect(() => {
    let cancelled = false
    getMatches({ ...filters, sort, tab, q: q || undefined, threadId, skip: page * PAGE_SIZE, take: PAGE_SIZE })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters, sort, tab, q, page, threadId])

  const stats = useMemo(() => {
    const items = data?.items ?? []
    return { total: data?.total ?? 0, excellent: items.filter((m) => m.match_percent >= 90).length, strength: items[0]?.match_percent ?? 0 }
  }, [data])

  function patchItem(jobId: string, patch: Partial<JobMatch>) {
    setData((d) => (d ? { ...d, items: d.items.map((m) => (m.job.id === jobId ? { ...m, ...patch } : m)) } : d))
    setSelected((prev) => {
      if (!prev.has(jobId)) return prev
      const next = new Map(prev)
      next.set(jobId, { ...next.get(jobId)!, ...patch })
      return next
    })
  }
  async function toggleSaved(m: JobMatch) {
    patchItem(m.job.id, { saved: !m.saved })
    try {
      await setSaved(m.job.id, !m.saved)
      if (tab === "saved" && m.saved) setData((d) => (d ? { ...d, total: d.total - 1, items: d.items.filter((x) => x.job.id !== m.job.id) } : d))
    } catch {
      patchItem(m.job.id, { saved: m.saved })
    }
  }
  async function toggleHidden(m: JobMatch) {
    patchItem(m.job.id, { hidden: !m.hidden })
    try {
      await setHidden(m.job.id, !m.hidden)
      if (!m.hidden && (tab === "discover" || tab === "recommended")) {
        setData((d) => (d ? { ...d, total: d.total - 1, items: d.items.filter((x) => x.job.id !== m.job.id) } : d))
        setSelected((prev) => {
          const next = new Map(prev)
          next.delete(m.job.id)
          return next
        })
        setNotice("Hidden from your results. You can still find it under the … menu on other tabs.")
        setTimeout(() => setNotice(null), 3500)
      }
    } catch {
      patchItem(m.job.id, { hidden: m.hidden })
    }
  }
  function toggleSelected(m: JobMatch) {
    if (m.application_status && m.application_status !== "FAILED") return
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(m.job.id)) next.delete(m.job.id)
      else next.set(m.job.id, m)
      return next
    })
  }

  // Both CTAs queue applications server-side (top N = best across the whole
  // conversation, not just this page) and land on Applications.
  function askApply(mode: "top" | "selected") {
    const req = mode === "top" ? { top: TOP_N } : { jobIds: [...selected.keys()] }
    setConfirm({ req, count: mode === "top" ? Math.min(TOP_N, stats.total) : selected.size })
  }

  const pages = Math.max(1, Math.ceil(stats.total / PAGE_SIZE))
  const selectedIds = [...selected.keys()]
  const selectedList = [...selected.values()]
  const from = stats.total ? page * PAGE_SIZE + 1 : 0
  const to = Math.min((page + 1) * PAGE_SIZE, stats.total)
  const heroTitle = tab === "saved" ? `${stats.total} saved job${stats.total === 1 ? "" : "s"}` : tab === "applied" ? `${stats.total} application${stats.total === 1 ? "" : "s"} with Plato` : tab === "recommended" ? `${stats.total} recommendations across all your searches` : `I found ${stats.total} great matches for you!`

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-5">
      <ExtensionApplyModal open={!!confirm} count={confirm?.count ?? 0} req={{ ...(confirm?.req ?? {}), threadId }} onClose={() => setConfirm(null)} />
      <motion.div data-tour="results-summary" variants={fadeUpItem} className={cn(CARD, "relative isolate flex flex-wrap items-center justify-between gap-5 overflow-hidden p-5 sm:p-6")}>
        {/* The Home hero's soft brand glow, led by the Jobs azure. */}
        <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_120%_at_0%_0%,color-mix(in_oklch,var(--azure)_10%,transparent),transparent_60%),radial-gradient(50%_90%_at_100%_100%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_65%)]" />
        <div className="flex items-start gap-4">
          <StatIcon icon={Sparkles} accent="azure" className="size-12 rounded-2xl [&_svg]:size-6" />
          <div className="flex flex-col gap-1.5">
            <p className="type-section-title text-foreground">{heroTitle}</p>
            <p className="text-sm text-muted-foreground">
              {tab === "discover"
                ? `I analyzed ${run.fetched.toLocaleString()} jobs for this search, based on your profile and preferences.`
                : tab === "saved"
                  ? "Jobs you bookmarked, from every search you've run."
                  : tab === "applied"
                    ? "Everything you asked me to apply to, from every search."
                    : "Strong and excellent fits from all your searches, minus anything you hid or already applied to."}
            </p>
            <p className="text-[11px] text-text-tertiary">Listings are collected from public sources and link to the original posting. Plato is not the employer.</p>
            <div className="mt-2 -ml-4 flex flex-wrap items-center gap-x-2">
              <Kpi icon={Check} accent="cobalt" index={0} value={stats.total} label="Strong matches" />
              <Kpi
                icon={CircleCheck}
                accent="green"
                index={1}
                value={stats.excellent}
                label={
                  <span className="flex items-center gap-1.5">
                    Excellent matches
                    <InfoTip text="Jobs on this page at 90% match or more. 75–89% shows as Strong match." label="What an excellent match is" />
                  </span>
                }
              />
              <Kpi
                icon={Zap}
                accent="azure"
                index={2}
                value={`${stats.strength}%`}
                label={
                  <span className="flex items-center gap-1.5">
                    Profile match strength
                    <InfoTip text="The match % of the first job in the list. Match % is how well a job's title and description fit your roles, skills and experience, scaled so your strongest matches read close to 100%." label="What profile match strength means" />
                  </span>
                }
              />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button type="button" data-ai="results.apply-top" disabled={!!applying || !stats.total} onClick={() => askApply("top")} className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold whitespace-nowrap text-primary-foreground shadow-brand transition-colors duration-200 hover:bg-primary-hover disabled:opacity-60">
            {applying === "top" ? <Loader2 className="size-4 animate-spin" /> : <Star className="size-4 fill-current" />}
            Apply to top {TOP_N} jobs
          </button>
          <button type="button" data-ai="results.apply-selected" disabled={!!applying || !selectedIds.length} onClick={() => askApply("selected")} className="rounded-full bg-primary-soft px-5 py-2.5 text-sm font-semibold whitespace-nowrap text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground disabled:opacity-60 disabled:hover:bg-primary-soft disabled:hover:text-primary">
            {applying === "selected" ? "Queuing…" : selectedIds.length ? `Apply to ${selectedIds.length} selected` : "Let me select jobs"}
          </button>
          <p className="flex items-center justify-end gap-1.5 text-right text-xs text-text-tertiary">
            I&apos;ll handle the applications and keep you updated.
            <InfoTip text={`Apply to top ${TOP_N} adds the ${TOP_N} best-matched jobs in this search that aren't already with Plato to your browser extension's queue. Nothing is sent until you start it in the extension.`} label={`What Apply to top ${TOP_N} does`} side="bottom" />
          </p>
        </div>
      </motion.div>

      <AnimatePresence>
        {notice && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="status" className="rounded-xl border border-l-4 border-l-primary bg-card px-4 py-2.5 text-sm text-text-secondary shadow-card">
            {notice}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="flex flex-col items-start gap-5 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4 self-stretch">
          <motion.div variants={fadeUpItem} data-ai="results.filters" className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <FilterSelect label="Location" value={filters.location ?? ANY} options={locationOptions} onChange={(v) => setFilter("location", v === ANY ? undefined : v)} className="max-w-56" />
              <FilterSelect label="Job type" value={filters.jobType ?? ANY} options={jobTypeOptions} onChange={(v) => setFilter("jobType", v === ANY ? undefined : (v as JobTypeKey))} />
              <FilterSelect label="Source" value={filters.source ?? ANY} options={sourceOptions} onChange={(v) => setFilter("source", v === ANY ? undefined : (v as JobSourceName))} />
              <FilterSelect label="Posted" value={filters.postedWithinDays ? String(filters.postedWithinDays) : ANY} options={postedOptions} onChange={(v) => setFilter("postedWithinDays", v === ANY ? undefined : Number(v))} />
              <FilterSelect label="Experience level" value={filters.level ?? ANY} options={levelOptions} onChange={(v) => setFilter("level", v === ANY ? undefined : (v as MatchLevel))} />
              <FilterSelect
                label="Salary"
                value={filters.hasSalary ? "has" : filters.salaryMin ? String(filters.salaryMin) : ANY}
                options={salaryOptions}
                onChange={(v) => update({ filters: { ...filters, hasSalary: v === "has" ? true : undefined, salaryMin: v !== ANY && v !== "has" ? Number(v) : undefined } })}
              />
              <FilterChip on={filters.remoteType === "REMOTE"} onClick={() => setFilter("remoteType", filters.remoteType === "REMOTE" ? undefined : "REMOTE")}>
                Remote{facets ? ` (${facets.remote})` : ""}
              </FilterChip>
              {filters.salaryCurrency && (
                <span title="Only jobs that show pay in these currencies">
                  <FilterChip on onClick={() => setFilter("salaryCurrency", undefined)}>
                    Paid in {filters.salaryCurrency.replaceAll(",", " / ")} <X className="size-3.5" />
                  </FilterChip>
                </span>
              )}
              {filters.acceptsCountry && (
                <span className="flex items-center gap-1">
                  <FilterChip on onClick={() => setFilter("acceptsCountry", undefined)}>
                    Open to {filters.acceptsCountry} <X className="size-3.5" />
                  </FilterChip>
                  <InfoTip text={`Hides jobs whose posting says it only takes applicants from regions that leave out ${filters.acceptsCountry}. Jobs that state no restriction stay in.`} label={`What Open to ${filters.acceptsCountry} does`} />
                </span>
              )}
              {activeFilterCount > 0 && (
                <button type="button" onClick={() => update({ filters: {} })} className={cn(PILL, "text-primary")}>
                  <X className="size-3.5" />
                  Clear {activeFilterCount}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-[13px] whitespace-nowrap text-muted-foreground">
              <button
                type="button"
                disabled={exporting || !data?.total}
                onClick={() => {
                  setExporting(true)
                  exportMatches({ ...filters, sort, tab, q: q || undefined, threadId }, `plato-jobs-${tab}-${new Date().toISOString().slice(0, 10)}.xlsx`)
                    .catch(() => {})
                    .finally(() => setExporting(false))
                }}
                title="Download this list as an Excel sheet"
                className={cn(PILL, "gap-1.5 disabled:opacity-50")}
              >
                {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />}
                Export
              </button>
              Sort by:
              <FilterSelect label="Sort by" value={sort} options={SORT_OPTIONS} defaultValue={SORT_OPTIONS[0].value} onChange={(v) => update({ sort: v })} />
            </div>
          </motion.div>

          <motion.div data-tour="results-list" variants={fadeUpItem} className={cn(CARD, "px-5 py-1")}>
            {loading && !data ? (
              <ul aria-busy="true">
                {Array.from({ length: 5 }, (_, i) => (
                  <li key={i} className="flex items-center gap-4 border-b border-divider py-4 last:border-b-0">
                    <Skeleton className="size-[18px] rounded-[5px]" />
                    <Skeleton className="size-11 rounded-lg" />
                    <div className="flex flex-1 flex-col gap-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/5" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-7 w-24 rounded-full" />
                  </li>
                ))}
              </ul>
            ) : data?.items.length ? (
              <ul className={cn("transition-opacity", loading && "opacity-60")}>
                <AnimatePresence initial={false}>
                  {data.items.map((m, i) => (
                    <JobRow key={m.id} match={m} searchId={run.id} position={i + 1} highlight={focusPos === i + 1} selected={selected.has(m.job.id)} onToggle={() => toggleSelected(m)} onSave={() => toggleSaved(m)} onHide={() => toggleHidden(m)} />
                  ))}
                </AnimatePresence>
              </ul>
            ) : (
              <EmptyState icon={Inbox} title={TAB_EMPTY[tab]} className="my-4 border-divider" />
            )}
          </motion.div>

          <motion.div variants={fadeUpItem} className="flex flex-wrap items-center justify-between gap-3 px-1 pb-5">
            <span className="text-[13px] text-muted-foreground">
              Showing {from} to {to} of {stats.total} jobs
            </span>
            <div className="flex items-center gap-1.5">
              <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous" className="flex size-[30px] items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors duration-200 hover:border-primary-line hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground">
                <ChevronLeft className="size-3" />
              </button>
              {pageNumbers(page, pages).map((p, i) =>
                p === "…" ? (
                  <span key={`e${i}`} className="flex size-[30px] items-center justify-center text-[13px] text-muted-foreground">…</span>
                ) : (
                  <button key={p} type="button" onClick={() => setPage(p)} aria-current={p === page ? "page" : undefined} className={cn("flex size-[30px] items-center justify-center rounded-md text-[13px] tabular-nums transition-colors duration-200", p === page ? "bg-primary font-semibold text-primary-foreground" : "font-medium text-text-secondary hover:bg-primary-soft hover:text-primary")}>
                    {p + 1}
                  </button>
                ),
              )}
              <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Next" className="flex size-[30px] items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors duration-200 hover:border-primary-line hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground">
                <ChevronRight className="size-3" />
              </button>
            </div>
          </motion.div>
        </div>

        <motion.aside variants={fadeUpItem} className="flex w-full shrink-0 flex-col gap-4 xl:sticky xl:top-6 xl:w-[320px]">
          <div className="flex flex-col gap-3.5 rounded-2xl bg-primary p-5 text-primary-foreground shadow-brand">
            <div className="flex items-center gap-2.5">
              <span className="flex size-[34px] items-center justify-center rounded-lg bg-white/15">
                <Bot className="size-[17px]" />
              </span>
              <span className="text-base font-bold">Plato AI</span>
              <Sparkles className="-ml-0.5 size-3.5 fill-current" />
            </div>
            <div className="flex flex-col gap-2 rounded-lg bg-white/12 p-4">
              <p className="text-[15px] font-bold">I can apply to these jobs for you.</p>
              <p className="text-[13px] leading-[1.5] text-white/85">I&apos;ll tailor your application, write custom answers, and track everything.</p>
            </div>
            <button type="button" disabled={!!applying || !stats.total} onClick={() => askApply("top")} className="rounded-full bg-white py-2.5 text-sm font-bold text-primary transition-colors duration-200 hover:bg-white/90 disabled:opacity-60">
              Apply to top {TOP_N} jobs
            </button>
            <button type="button" disabled={!!applying || !selectedIds.length} onClick={() => askApply("selected")} className="rounded-full bg-white/14 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/20 disabled:opacity-60">
              {selectedIds.length ? `Apply to ${selectedIds.length} selected` : "Choose jobs to apply"}
            </button>
          </div>

          <div data-tour="results-selection" className={cn(CARD, "flex flex-col gap-3 p-4")}>
            <div className="flex items-center justify-between">
              <SectionHeader as="h3" title="Your selection" icon={ListChecks} accent="azure" className="[&_h3]:type-card-title" />
              {selected.size > 0 && (
                <button type="button" onClick={() => setSelected(new Map())} className="text-[13px] font-semibold text-primary transition-colors duration-200 hover:text-primary-hover">
                  Clear
                </button>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-text-tertiary">{selected.size} jobs selected</span>
              {selected.size > 3 && (
                <button type="button" onClick={() => setShowAllSelected((s) => !s)} className="text-[13px] font-semibold text-primary transition-colors duration-200 hover:text-primary-hover">
                  {showAllSelected ? "Show less" : "View all"}
                </button>
              )}
            </div>
            {(showAllSelected ? selectedList : selectedList.slice(0, 3)).map((m) => (
              <div key={m.job.id} className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors duration-200 hover:bg-muted/60">
                <CompanyAvatar name={m.job.company} domain={m.job.company_domain} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-foreground">{m.job.title}</p>
                  <p className="truncate text-xs text-text-tertiary">{m.job.company}</p>
                </div>
                <span className="shrink-0 text-xs font-bold whitespace-nowrap text-success-ink tabular-nums">{m.match_percent}% match</span>
                <button type="button" aria-label="Remove" onClick={() => toggleSelected(m)} className="rounded-md p-0.5 text-lavender transition-colors duration-200 hover:text-destructive">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {selected.size === 0 && <p className="text-xs text-text-tertiary">Tick jobs in the list, or let Plato pick the top {TOP_N}.</p>}
          </div>

          <div className={cn(CARD, "flex flex-col gap-3.5 p-4")}>
            <SectionHeader as="h3" title="How it works" icon={Clock} accent="azure" className="[&_h3]:type-card-title" />
            {["You select jobs (or I'll pick the best ones)", "I review requirements & prepare applications", "I'll ask for anything I need from you", "I apply and keep you updated"].map((s, i) => (
              <div key={s} className="flex items-start gap-2.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">{i + 1}</span>
                <span className="text-[13px] leading-[1.4] text-text-secondary">{s}</span>
              </div>
            ))}
          </div>
        </motion.aside>
      </div>
    </motion.div>
  )
}

export { ResultsView }
