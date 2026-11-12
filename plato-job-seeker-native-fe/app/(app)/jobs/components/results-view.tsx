"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ExtensionApplyModal } from "@/components/extension-apply-modal"
import { AnimatePresence, motion } from "motion/react"
import {
  Bookmark,
  Bot,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Inbox,
  ExternalLink,
  EyeOff,
  FileSpreadsheet,
  LayoutGrid,
  Rows3,
  Loader2,
  MoreHorizontal,
  Sparkles,
  Star,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react"
import { cn } from "cn"
import { Checkbox } from "@/components/ui/checkbox"
import { FilterChip, FilterSelect } from "@/components/filter-controls"
import { SOURCE_LABEL, type JobSourceName, exportMatches, getFacets, getMatches,  setHidden, setSaved, attributionLabel, type DiscoveryRun, type Facets, type JobMatch, type JobTypeKey, type MatchFilters, type MatchLevel, type MatchSort, type MatchTab, type UiCommand } from "@/lib/jobs/api"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"
import { CompanyAvatar } from "@/components/company-avatar"
import { APPLICATION_STATUS, applicationHref, applicationReason } from "@/lib/jobs/application-status"
import { Skeleton } from "@/components/ui/skeleton"
import { CARD, EmptyState, StatIcon } from "@/components/plato-ui"
import { InfoTip } from "@/components/info-tip"
import { PillTabs } from "@/components/pill-tabs"
import { getProfile } from "@/lib/documents/api"

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

function IconButton({ className, active, ...props }: React.ComponentProps<"button"> & { active?: boolean }) {
  return <button type="button" className={cn("flex size-[30px] items-center justify-center rounded-md transition-colors duration-200 hover:bg-primary-soft", active ? "text-primary" : "text-lavender hover:text-primary", className)} {...props} />
}

// Per-row extras behind "…": what the row's own icons don't already do.
function RowMenu({ match, onMock, prepping }: { match: JobMatch; onMock: () => void; prepping: boolean }) {
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
      <IconButton aria-label="More actions" title="More" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="size-4" />
      </IconButton>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="absolute top-full right-0 z-20 mt-1 w-56 rounded-lg border bg-card p-1.5 shadow-[0_16px_40px_-20px_rgba(14,27,44,0.35)]">
            {match.application_id && (
              <Link href={applicationHref(match.application_id)} className={item} onClick={() => setOpen(false)}>
                <ClipboardList className="size-4 text-muted-foreground" />
                Open application
              </Link>
            )}
            <button type="button" className={item} disabled={prepping} onClick={() => { onMock(); setOpen(false) }}>
              {prepping ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <Bot className="size-4 text-muted-foreground" />}
              Practise the interview
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// One job, as a row (list) or a tile (cards). Same facts, same actions; only the layout changes.
function JobItem({ match, selected, highlight, position, cards, onToggle, onSave, onHide }: { match: JobMatch; selected: boolean; highlight: boolean; position: number; cards: boolean; onToggle: () => void; onSave: () => void; onHide: () => void }) {
  const { job } = match
  const remote = remoteLabel(job.remote_type)
  const where = job.location ? `${job.location}${remote ? ` (${remote})` : ""}` : remote
  // One line of facts: who, where, what kind, how fresh.
  const facts = [job.company, where, jobTypeLabel(job.job_type), timeAgo(job.posted_at)].filter(Boolean).join(" · ")
  const tags = [salaryLabel(job), job.easy_apply ? "Easy apply" : null].filter(Boolean) as string[]
  // Only a real catch is worth a line: restricted regions or a move abroad.
  const warn = job.eligibility && (job.eligibility.status === "restricted" || job.eligibility.status === "relocation") ? job.eligibility.note : null
  const credit = attributionLabel(job.source)
  const router = useRouter()
  const [prepping, setPrepping] = useState(false)
  const mock = () => {
    setPrepping(true)
    router.push(`/career/interviews/new?${new URLSearchParams({ target: "job", job: job.id, jt: job.title, jc: job.company })}`)
  }
  const app = match.application_status ? APPLICATION_STATUS[match.application_status] : null
  // Already with Plato (queued / applying / applied) → not selectable; a failed attempt can be picked again.
  const locked = !!match.application_status && match.application_status !== "FAILED"
  const problem = match.application_status && ["FAILED", "NEEDS_INPUT", "NEEDS_USER_VERIFICATION", "EXPIRED", "SKIPPED"].includes(match.application_status)

  const check = (
    <Checkbox
      checked={selected}
      disabled={locked}
      onCheckedChange={onToggle}
      aria-label={locked ? `${job.title} is already with Plato` : `Select ${job.title}`}
      title={locked ? `Already ${app?.label.toLowerCase()} — can't be selected again` : undefined}
      className="size-[18px] shrink-0 rounded-[5px] border-[1.5px] border-[#D5DEE8] disabled:opacity-40"
    />
  )
  const percent = <span className="shrink-0 rounded-full bg-success-soft px-2.5 py-0.5 text-[13px] font-bold whitespace-nowrap text-success-ink tabular-nums">{match.match_percent}%</span>
  const actions = (
    <div className="flex shrink-0 items-center gap-0.5">
      <a href={job.url} target="_blank" rel="noreferrer" data-ai={`results.open:${position}`} aria-label={`Open the ${job.title} posting`} title={credit ? `Open the posting on ${credit}` : "Open the posting"} className="flex size-[30px] items-center justify-center rounded-md text-lavender transition-colors duration-200 hover:bg-primary-soft hover:text-primary">
        <ExternalLink className="size-4" />
      </a>
      <IconButton data-ai={`results.save:${position}`} aria-label={match.saved ? "Remove from saved" : "Save job"} title={match.saved ? "Saved" : "Save"} aria-pressed={match.saved} active={match.saved} onClick={onSave}>
        <Bookmark className={cn("size-4", match.saved && "fill-current")} />
      </IconButton>
      <IconButton data-ai={`results.hide:${position}`} aria-label={match.hidden ? "Show again" : "Not interested"} title={match.hidden ? "Show again" : "Not interested"} onClick={onHide}>
        {match.hidden ? <Undo2 className="size-4" /> : <EyeOff className="size-4" />}
      </IconButton>
      <RowMenu match={match} onMock={mock} prepping={prepping} />
    </div>
  )
  const status =
    app &&
    (match.application_id ? (
      <Link data-tour="results-row-status" href={applicationHref(match.application_id)} title="Open the application" className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap hover:underline", app.tone)}>
        {app.label}
      </Link>
    ) : (
      <span data-tour="results-row-status" className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", app.tone)}>{app.label}</span>
    ))
  const title = (
    <a href={job.url} data-ai={`results.job:${position}`} target="_blank" rel="noreferrer" className={cn("font-semibold text-foreground transition-colors duration-200 hover:text-primary", cards ? "line-clamp-2 text-[15px] leading-snug" : "truncate text-[15px]")}>
      {job.title}
    </a>
  )
  const extra = (
    <>
      {(tags.length > 0 || warn) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span key={t} className="rounded-md bg-muted px-1.5 py-px text-xs font-medium text-text-secondary">
              {t}
            </span>
          ))}
          {warn && (
            <span className="flex items-center gap-1 text-xs text-warning-ink">
              <TriangleAlert className="size-3.5" />
              {warn}
            </span>
          )}
        </div>
      )}
      {problem && (
        <p className={cn("mt-1.5 line-clamp-2 text-xs", match.application_status === "FAILED" ? "text-destructive" : "text-text-secondary")}>
          {applicationReason({ status: match.application_status!, error: match.application_error })}
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
    </>
  )

  if (cards)
    return (
      <motion.li id={`job-row-${position}`} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: match.hidden ? 0.55 : 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} className={cn(CARD, "flex flex-col gap-3 p-4 transition-colors duration-200 hover:border-primary-line", highlight && "ring-2 ring-primary/40", selected && "border-primary-line bg-primary-tint")}>
        <div className="flex items-start gap-3">
          <CompanyAvatar name={job.company} domain={job.company_domain} size={40} />
          <div className="min-w-0 flex-1">
            {title}
            <p className="mt-0.5 truncate text-[13px] text-text-secondary">{facts}</p>
          </div>
          {check}
        </div>
        {extra}
        <div className="mt-auto flex items-center gap-2 border-t border-divider pt-3">
          {percent}
          {status ?? <span className="text-xs text-text-tertiary">{match.match_label}</span>}
          <span className="ml-auto">{actions}</span>
        </div>
      </motion.li>
    )

  return (
    <motion.li id={`job-row-${position}`} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: match.hidden ? 0.55 : 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className={cn("-mx-4 flex items-center gap-3.5 border-b border-divider px-4 py-3.5 transition-colors duration-200 last:border-b-0 hover:bg-primary-tint", highlight && "bg-primary-tint ring-2 ring-primary/40", selected && "bg-primary-tint")}>
      {check}
      <CompanyAvatar name={job.company} domain={job.company_domain} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 overflow-hidden">
          {title}
          {status}
        </div>
        <p className="mt-0.5 truncate text-[13px] text-text-secondary">{facts}</p>
        {extra}
      </div>
      <span className="hidden flex-col items-end gap-0.5 sm:flex" title={match.match_label}>
        {percent}
      </span>
      {actions}
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

// `tabs`: the list switcher (Discover, Saved…) from the page, shown in the toolbar.
// No run / threadId: All jobs, every search at once.
function ResultsView({ run, threadId, tab, q: typed, command, onState, tabs }: { run?: DiscoveryRun; threadId?: string; tab: MatchTab; q: string; command: UiCommand | null; onState?: (s: { items: JobMatch[]; filters: MatchFilters; sort: MatchSort }) => void; tabs?: React.ReactNode }) {
  // The search box, settled: one request after typing stops, not one per key.
  const [q, setQ] = useState(typed)
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 300)
    return () => clearTimeout(t)
  }, [typed])
  // Rows or cards, remembered per browser; the same choice as All jobs.
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
  const [query, setQuery] = useState<Query>(EMPTY_QUERY)
  const { filters, sort, page } = query
  const [data, setData] = useState<{ total: number; items: JobMatch[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [facets, setFacets] = useState<Facets | null>(null)
  // Where the seeker lives: "Can apply from <country>" starts on, as on All jobs.
  // undefined = not known yet; the list waits for it so it loads once.
  const [country, setCountry] = useState<string | null | undefined>(undefined)
  const [elsewhere, setElsewhere] = useState(0)
  useEffect(() => {
    getProfile()
      .then((p) => p.location?.country ?? null)
      .catch(() => null)
      .then((c) => {
        setCountry(c)
        if (c) setQuery((prev) => ({ ...prev, filters: { acceptsCountry: c, ...prev.filters } }))
      })
  }, [])
  const [selected, setSelected] = useState<Map<string, JobMatch>>(new Map())
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
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== "acceptsCountry" && v !== undefined && v !== false).length
  const clearFilters = () => update({ filters: filters.acceptsCountry ? { acceptsCountry: filters.acceptsCountry } : {} })
  const fromCountry = filters.acceptsCountry ?? country

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
    ...(facets && facets.salary.hasSalary > 0 ? [opt("has", "Shows salary", facets.salary.hasSalary)] : []),
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
    if (country === undefined) return
    let cancelled = false
    getMatches({ ...filters, sort, tab, q: q || undefined, threadId, skip: page * PAGE_SIZE, take: PAGE_SIZE })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    // How many the country filter hides, for "3 hidden because they don't accept applicants from Egypt".
    if (filters.acceptsCountry)
      getMatches({ ...filters, acceptsCountry: undefined, sort, tab, q: q || undefined, threadId, take: 1 })
        .then((d) => !cancelled && setElsewhere(d.total))
        .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [filters, sort, tab, q, page, threadId, country])

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
      // Shown again: it leaves the Hidden list.
      if (m.hidden && tab === "hidden") setData((d) => (d ? { ...d, total: d.total - 1, items: d.items.filter((x) => x.job.id !== m.job.id) } : d))
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
  const hiddenElsewhere = tab === "discover" && filters.acceptsCountry && elsewhere > stats.total ? elsewhere - stats.total : 0
  const heroTitle = tab === "saved" ? `${stats.total} saved job${stats.total === 1 ? "" : "s"}` : tab === "applied" ? `${stats.total} application${stats.total === 1 ? "" : "s"} with Plato` : tab === "recommended" ? `${stats.total} recommendations across all your searches` : tab === "hidden" ? `${stats.total} hidden job${stats.total === 1 ? "" : "s"}` : `${stats.total} matches for you`

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
      <ExtensionApplyModal open={!!confirm} count={confirm?.count ?? 0} req={{ ...(confirm?.req ?? {}), threadId }} onClose={() => setConfirm(null)} />

      {/* 1. What this is and the one thing to do with it. */}
      <motion.div data-tour="results-summary" variants={fadeUpItem} className={cn(CARD, "flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4")}>
        <StatIcon icon={Sparkles} accent="azure" className="size-10 rounded-xl [&_svg]:size-5" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-bold text-foreground">
            {heroTitle}
            <InfoTip text={`${run ? `Plato read ${run.fetched.toLocaleString()} postings for this search` : "Jobs from all your searches"} and kept the ones that fit your profile. The % on each job is how well its title and description match your roles, skills and experience. Listings link to the original posting; Plato is not the employer.`} label="How these were picked" />
          </p>
          <p className="text-[13px] text-text-secondary">Best matches first. Tick the ones you want, or let Plato apply to the top {TOP_N}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.length > 0 && (
            <button type="button" data-ai="results.apply-selected" onClick={() => askApply("selected")} className="rounded-full bg-primary-soft px-4 py-2 text-sm font-semibold whitespace-nowrap text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground">
              Apply to {selectedIds.length} selected
            </button>
          )}
          <button type="button" data-ai="results.apply-top" disabled={!!applying || !stats.total} onClick={() => askApply("top")} className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold whitespace-nowrap text-primary-foreground shadow-brand transition-colors duration-200 hover:bg-primary-hover disabled:opacity-60">
            <Star className="size-4 fill-current" />
            Apply to top {TOP_N}
          </button>
          <InfoTip text={`Adds the ${TOP_N} best-matched jobs here that aren't already with Plato to your browser extension's queue. Nothing is sent until you start it in the extension.`} label={`What Apply to top ${TOP_N} does`} side="bottom" />
        </div>
      </motion.div>

      <AnimatePresence>
        {notice && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="status" className="rounded-xl border border-l-4 border-l-primary bg-card px-4 py-2.5 text-sm text-text-secondary shadow-card">
            {notice}
          </motion.p>
        )}
      </AnimatePresence>

      {/* 2. Which list, in what order, how it looks. */}
      <motion.div variants={fadeUpItem} className="flex flex-wrap items-center gap-3">
        {tabs}
        <div className="ml-auto flex items-center gap-2">
          <FilterSelect label="Sort by" value={sort} options={SORT_OPTIONS} defaultValue={SORT_OPTIONS[0].value} onChange={(v) => update({ sort: v })} />
          <PillTabs id="results-view" label="Layout" dataAi="results.view" value={cards ? "cards" : "list"} onChange={(v) => setView(v)} tabs={[{ key: "list", label: "Rows", icon: Rows3 }, { key: "cards", label: "Cards", icon: LayoutGrid }]} />
          <button
            type="button"
            disabled={exporting || !data?.total}
            onClick={() => {
              setExporting(true)
              exportMatches({ ...filters, sort, tab, q: q || undefined, threadId }, `plato-jobs-${tab}-${new Date().toISOString().slice(0, 10)}.xlsx`)
                .catch(() => {})
                .finally(() => setExporting(false))
            }}
            aria-label="Export to Excel"
            title="Download this list as an Excel sheet"
            className="flex size-9 items-center justify-center rounded-full border bg-card text-text-secondary transition-colors duration-200 hover:border-primary-line hover:text-primary disabled:opacity-50"
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
          </button>
        </div>
      </motion.div>

      {/* 3. Narrow it down: one row, plain names. Counts live in each menu. */}
      <motion.div variants={fadeUpItem} data-ai="results.filters" className="flex flex-wrap items-center gap-2">
        {fromCountry && (
          <FilterChip on={!!filters.acceptsCountry} onClick={() => setFilter("acceptsCountry", filters.acceptsCountry ? undefined : fromCountry)} title={`Hides jobs whose posting says it only takes applicants from regions that leave out ${fromCountry}`}>
            Can apply from {fromCountry}
          </FilterChip>
        )}
        <FilterChip on={filters.remoteType === "REMOTE"} onClick={() => setFilter("remoteType", filters.remoteType === "REMOTE" ? undefined : "REMOTE")}>
          Remote only
        </FilterChip>
        <FilterSelect label="Location" value={filters.location ?? ANY} options={locationOptions} onChange={(v) => setFilter("location", v === ANY ? undefined : v)} className="max-w-56" />
        <FilterSelect label="Experience level" value={filters.level ?? ANY} options={levelOptions} onChange={(v) => setFilter("level", v === ANY ? undefined : (v as MatchLevel))} />
        <FilterSelect label="Job type" value={filters.jobType ?? ANY} options={jobTypeOptions} onChange={(v) => setFilter("jobType", v === ANY ? undefined : (v as JobTypeKey))} />
        <FilterSelect label="Posted" value={filters.postedWithinDays ? String(filters.postedWithinDays) : ANY} options={postedOptions} onChange={(v) => setFilter("postedWithinDays", v === ANY ? undefined : Number(v))} />
        <FilterSelect
          label="Salary"
          value={filters.hasSalary ? "has" : filters.salaryMin ? String(filters.salaryMin) : ANY}
          options={salaryOptions}
          onChange={(v) => update({ filters: { ...filters, hasSalary: v === "has" ? true : undefined, salaryMin: v !== ANY && v !== "has" ? Number(v) : undefined } })}
        />
        <FilterSelect label="Source" value={filters.source ?? ANY} options={sourceOptions} onChange={(v) => setFilter("source", v === ANY ? undefined : (v as JobSourceName))} />
        {filters.salaryCurrency && (
          <FilterChip on onClick={() => setFilter("salaryCurrency", undefined)} title="Only jobs that show pay in these currencies">
            Paid in {filters.salaryCurrency.replaceAll(",", " / ")} <X className="size-3.5" />
          </FilterChip>
        )}
        {activeFilterCount > 0 && (
          <button type="button" onClick={clearFilters} className="px-2 text-[13px] font-semibold text-primary hover:underline">
            Clear filters
          </button>
        )}
      </motion.div>

      {/* 4. The jobs. */}
      <motion.div data-tour="results-list" variants={fadeUpItem} className="flex flex-col gap-2">
        <p className="px-1 text-[13px] text-text-tertiary">
          {loading && !data ? "Loading…" : `${stats.total} job${stats.total === 1 ? "" : "s"}`}
          {hiddenElsewhere > 0 && (
            <>
              {` · ${hiddenElsewhere} hidden: they don't take applicants from ${filters.acceptsCountry}. `}
              <button type="button" onClick={() => setFilter("acceptsCountry", undefined)} className="font-semibold text-primary hover:underline">
                Show them
              </button>
            </>
          )}
        </p>
        {loading && !data ? (
          <div aria-busy="true" className={cn(cards ? "grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" : cn(CARD, "flex flex-col px-4"))}>
            {Array.from({ length: cards ? 6 : 5 }, (_, i) => (
              <Skeleton key={i} className={cards ? "h-40 rounded-2xl" : "my-3 h-12 rounded-lg"} />
            ))}
          </div>
        ) : data?.items.length ? (
          <ul className={cn("transition-opacity", loading && "opacity-60", cards ? "grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" : cn(CARD, "px-4"))}>
            <AnimatePresence initial={false}>
              {data.items.map((m, i) => (
                <JobItem key={m.id} match={m} cards={cards} position={i + 1} highlight={focusPos === i + 1} selected={selected.has(m.job.id)} onToggle={() => toggleSelected(m)} onSave={() => toggleSaved(m)} onHide={() => toggleHidden(m)} />
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <EmptyState icon={Inbox} title={TAB_EMPTY[tab]} className={cn(CARD, "py-10")} />
        )}
      </motion.div>

      {/* What is ticked, always in reach while scrolling the list. */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div data-tour="results-selection" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-primary-line bg-card px-4 py-3 shadow-[0_18px_44px_-24px_rgba(0,91,167,0.45)]">
            <span className="flex -space-x-2">
              {selectedList.slice(0, 3).map((m) => (
                <CompanyAvatar key={m.job.id} name={m.job.company} domain={m.job.company_domain} size={28} />
              ))}
            </span>
            <span className="text-sm font-semibold text-foreground">
              {selected.size} job{selected.size === 1 ? "" : "s"} selected
            </span>
            <button type="button" onClick={() => setSelected(new Map())} className="text-[13px] font-semibold text-text-secondary transition-colors duration-200 hover:text-foreground">
              Clear
            </button>
            <button type="button" data-ai="results.apply-selected-bar" onClick={() => askApply("selected")} className="ml-auto rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary-hover">
              Apply to {selected.size} selected
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {pages > 1 && (
        <motion.div variants={fadeUpItem} className="flex flex-wrap items-center justify-between gap-3 px-1 pb-5">
          <span className="text-[13px] text-muted-foreground">
            {from}–{to} of {stats.total}
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
      )}
    </motion.div>
  )
}

export { ResultsView }
