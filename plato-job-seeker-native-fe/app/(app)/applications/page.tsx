"use client"

import { detailsHref } from "@/lib/readiness-link"
import { liveSource } from "@/lib/live-source"
import { PAGE, PageHeader } from "@/components/page-header"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Clock, Hand, Send, FlaskConical, ListChecks, PauseCircle, Radio, RotateCcw, Sparkles, TriangleAlert } from "lucide-react"
import { cn } from "cn"
import {
  applicationEventsUrl,
  focusApplicationBrowser,
  getApplyQueue,
  getApplyReadiness,
  listApplications,
  listThreads,
  retryApplication,
  SOURCE_LABEL,
  type ApplicationStatus,
  type ApplyEvent,
  type ApplyQueue,
  type ApplyReadiness,
  type JobApplication,
  type ThreadSummary,
} from "@/lib/jobs/api"
import { JOBS_HOME, threadHref } from "@/lib/jobs/links"
import { applicationHref, applicationReason, canRetry, isVerifySubmission, needsAttention, retryLabel, roughly, statusView } from "@/lib/jobs/application-status"
import { EmptyState, MonoTile, PlatoNote, SectionHeader, StatTile, StatusPill } from "@/components/plato-ui"
import { PillTabs } from "@/components/pill-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { buttonVariants } from "@/components/ui/button"
import { OUTCOME_LABEL, OUTCOME_TONE } from "@/components/outcome-picker"
import { ApplicationReview } from "./application-review"
import { InfoTip } from "@/components/info-tip"

const PAGE_SIZE = 20
const TABS = [
  { key: "all", label: "All", statuses: null },
  { key: "needs", label: "Needs you", statuses: ["NEEDS_INPUT", "NEEDS_USER_VERIFICATION"] },
  { key: "active", label: "In progress", statuses: ["QUEUED", "IN_PROGRESS", "EXTENSION_ACTIVE"] },
  { key: "applied", label: "Sent", statuses: ["SUBMITTED"] },
  { key: "problems", label: "Didn't go through", statuses: ["FAILED", "EXPIRED", "SKIPPED"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly ApplicationStatus[] | null }[]
type TabKey = (typeof TABS)[number]["key"]

// The sidebar "Needs you" badge recounts on this event (notifications-provider).
const changed = () => window.dispatchEvent(new Event("plato:applications-changed"))
const inLastDays =(iso: string, days: number) => Date.now() - new Date(iso).getTime() < days * 864e5
const inLastWeek = (iso: string) => inLastDays(iso, 7)
// The owner's tags on a "Needs you" card: what kind of help Plato is waiting for.
const needTag = (a: JobApplication) => {
  if (isVerifySubmission(a)) return "Please check"
  if (a.status === "NEEDS_USER_VERIFICATION" || a.needs_input?.reason === "captcha") return "Human check"
  const r = a.needs_input?.reason
  if (r === "questions") return a.needs_input?.questions.some((q) => /cover letter/i.test(q.label)) ? "Cover letter" : "Question"
  return r === "resume" ? "Skills check" : r === "ready" ? "Submit" : r === "unsupported" ? "Apply yourself" : r === "profile" ? "Your details" : "Needs you"
}

// The one sentence on a needs-you card, in the owner's words: what the form wants.
const needLine = (a: JobApplication) => {
  const qs = a.needs_input?.questions ?? []
  if (qs.some((q) => /cover letter/i.test(q.label))) return "They require a cover letter. Plato wrote one."
  if (qs.length === 1) return qs[0].label.replace(/\s*\*$/, "")
  if (qs.length > 1) return `They ask ${qs.length} questions Plato can't answer from your profile.`
  return applicationReason(a)
}

function ApplicationsContent() {
  const router = useRouter()
  const params = useSearchParams()
  const threadId = params.get("thread")
  const focus = params.get("focus")

  const [apps, setApps] = useState<JobApplication[] | null>(null)
  const [queue, setQueue] = useState<ApplyQueue | null>(null)
  const [readiness, setReadiness] = useState<ApplyReadiness | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Tab and platform live in the URL (?tab=needs&source=GREENHOUSE): shareable, survive refresh.
  const tab: TabKey = TABS.find((t) => t.key === params.get("tab"))?.key ?? "all"
  const sourceParam = params.get("source")
  const source = sourceParam && sourceParam in SOURCE_LABEL ? sourceParam : null
  const setQuery = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) v && v !== "all" ? next.set(k, v) : next.delete(k)
    const q = next.toString()
    router.replace(q ? `/applications?${q}` : "/applications", { scroll: false })
  }
  // The detail page's "Applications" crumb comes back to this tab and filter.
  const detailHref = (id: string) => (params.toString() ? `${applicationHref(id)}?from=${encodeURIComponent(params.toString())}` : applicationHref(id))
  const [retrying, setRetrying] = useState<string | null>(null)
  // Every worker step seen this session, per application: the live timeline.
  const [timeline, setTimeline] = useState<Record<string, ApplyEvent[]>>({})

  const [threads, setThreads] = useState<ThreadSummary[]>([])
  // The search filter runs on the server: the list only ever holds what the
  // selected search queued.
  const load = useCallback(
    () =>
      listApplications({ threadId: threadId ?? undefined })
        .then(setApps)
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load applications")),
    [threadId],
  )

  const loadQueue = useCallback(
    () =>
      getApplyQueue()
        .then((q) => {
          setQueue(q)
          // After a refresh the server still remembers the recent steps.
          setTimeline((prev) => ({ ...q.timelines, ...prev }))
        })
        .catch(() => setQueue(null)),
    [],
  )

  useEffect(() => {
    void load()
    void loadQueue()
    listThreads()
      .then(setThreads)
      .catch(() => setThreads([]))
    getApplyReadiness()
      .then(setReadiness)
      .catch(() => setReadiness(null))
    // Event-driven: each worker step lands here; a status change refetches rows.
    return liveSource(
      applicationEventsUrl(),
      (msg) => {
        const event = JSON.parse(msg.data as string) as ApplyEvent
        setTimeline((prev) => ({ ...prev, [event.applicationId]: [...(prev[event.applicationId] ?? []), event].slice(-12) }))
        // A settled application moves everyone behind it up the line.
        if (event.status !== "IN_PROGRESS") void Promise.all([load(), loadQueue()])
        else setApps((prev) => prev?.map((a) => (a.id === event.applicationId ? { ...a, status: "IN_PROGRESS" } : a)) ?? prev)
      },
      () => void Promise.all([load(), loadQueue()]),
    )
  }, [load, loadQueue])

  // Events drive the page; this slow poll only covers a dropped stream and
  // other people's applications moving the shared line.
  const waiting = (apps ?? []).some((a) => a.status === "QUEUED" || a.status === "IN_PROGRESS")
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => void Promise.all([load(), loadQueue()]), 20_000)
    return () => clearInterval(t)
  }, [waiting, load, loadQueue])

  // Deep link from a notification: bring the row into view once it exists.
  const focusRef = useRef<HTMLLIElement | null>(null)
  const didScroll = useRef(false)
  useEffect(() => {
    if (!focus || didScroll.current || !focusRef.current) return
    didScroll.current = true
    focusRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [focus, apps])

  const scoped = useMemo(() => (apps ?? []).filter((a) => !source || a.job.source === source), [apps, source])
  const inTab = (key: TabKey, a: JobApplication) => {
    // "Needs you" also holds extension applications that wait on the person (VERIFY).
    if (key === "needs") return needsAttention(a)
    const statuses = TABS.find((t) => t.key === key)!.statuses as readonly ApplicationStatus[] | null
    if (key === "active" && isVerifySubmission(a)) return false
    return !statuses || statuses.includes(a.status)
  }
  const worker = queue?.worker ?? null
  const inLine = scoped.filter((a) => queue?.positions[a.id]).length
  const shown = scoped.filter((a) => inTab(tab, a))
  // ponytail: client-side pages over the full list; move to server paging if lists reach the thousands.
  // The page belongs to a tab, so switching tabs starts at page 1.
  const [pg, setPg] = useState({ tab, n: 0 })
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const page = pg.tab === tab ? Math.min(pg.n, pages - 1) : 0
  const pageRows = shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  async function retry(a: JobApplication) {
    setRetrying(a.id)
    try {
      await retryApplication(a.id)
      await Promise.all([load(), loadQueue()])
      changed()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retry")
    } finally {
      setRetrying(null)
    }
  }

  const needs = scoped.filter(needsAttention)
  const sent30 = scoped.filter((a) => a.status === "SUBMITTED" && inLastDays(a.submitted_at ?? a.updated_at, 30)).length
  const appliedWeek = scoped.filter((a) => a.status === "SUBMITTED" && inLastWeek(a.submitted_at ?? a.updated_at)).length
  const settled = scoped.filter((a) => ["SUBMITTED", "FAILED", "EXPIRED", "SKIPPED"].includes(a.status))
  const wentThrough = settled.length ? Math.round((settled.filter((a) => a.status === "SUBMITTED").length / settled.length) * 100) : null
  const focusNeed = (id: string) => {
    const el = document.getElementById(`need-${id}`)
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
    el?.animate([{ boxShadow: "0 0 0 4px rgb(217 119 6 / 0.35)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1200 })
  }
  const dateOf = (a: JobApplication) => {
    if (a.status === "QUEUED") return "In queue"
    const d = new Date(a.submitted_at ?? a.updated_at)
    return d.toDateString() === new Date().toDateString() ? "Today" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  return (
    // Screen 09: the list on the left; "Needs you" on the right from the top of the page.
    <div data-tour-state={apps === null ? undefined : !scoped.length ? "applications.empty" : needs.length ? "applications.needs" : "applications.list"} className={cn(PAGE, "grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_356px]")}>
      <section className="flex min-w-0 flex-col gap-4 xl:self-stretch">
        <PageHeader
          crumbs={threadId ? [{ label: "Jobs", href: JOBS_HOME }, { label: "Search", href: threadHref(threadId) }] : undefined}
          title="Applications"
          description="Every application Plato sends for you, and anything it needs from you to finish one."
        />
        {!apps && !error && (
          <div aria-busy="true" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[74px] rounded-xl" />
            ))}
          </div>
        )}
        {apps && (
          <div data-tour="applications-stats" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatTile value={sent30} label="Sent in 30 days" icon={Send} accent="cobalt" index={0} />
            <StatTile value={appliedWeek} label="Sent this week" icon={CalendarDays} accent="azure" index={1} />
            {/* StatTile's label is text only, so the (i) sits in the tile's bottom-right corner. */}
            <div className="relative">
              <StatTile value={wentThrough === null ? "—" : `${wentThrough}%`} label="Went through" icon={CircleCheck} accent="green" index={2} className="h-full" />
              <InfoTip className="absolute right-2.5 bottom-2.5" label="What went through means" text="Of the applications that finished, the share that were sent. Ones still queued, in progress or waiting on you aren't counted." />
            </div>
            <StatTile value={needs.length} label="Need you" tone={needs.length ? "need" : undefined} icon={Hand} accent="amber" index={3} />
          </div>
        )}

      {readiness && !readiness.ready && (
        <div data-tour="applications-readiness" className="flex flex-wrap items-center gap-3 rounded-2xl border border-l-[3px] border-l-warning bg-card p-4 text-sm shadow-card">
          <TriangleAlert className="size-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1 text-foreground">
            <span className="font-semibold">Plato can&apos;t apply for you yet.</span> It never asks per job, so it needs these once: {readiness.missing.map((m) => m.label).join("; ")}.
          </p>
          <Link href={detailsHref(readiness.missing, "/applications")} className="inline-flex h-9 shrink-0 items-center rounded-xl bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary-hover">
            Complete my details
          </Link>
        </div>
      )}

      {worker?.paused?.map((p) => (
        <div key={p.source} className="flex items-start gap-3 rounded-2xl border border-l-[3px] border-l-warning bg-card p-4 text-sm shadow-card">
          <PauseCircle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-foreground">
            <span className="font-semibold">{p.source[0] + p.source.slice(1).toLowerCase()} applications are on hold</span> until {new Date(p.until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. The site asks &quot;verify you are human&quot; on every application, and Plato doesn&apos;t bypass that. The ones it reached are under &quot;Needs you&quot; with a link to submit by hand.
          </p>
        </div>
      ))}

      {worker && (!worker.enabled || worker.dryRun) && (
        <div className="flex items-start gap-3 rounded-2xl border border-l-[3px] border-l-info bg-card p-4 text-sm shadow-card">
          {worker.enabled ? <FlaskConical className="mt-0.5 size-4 shrink-0 text-info" /> : <PauseCircle className="mt-0.5 size-4 shrink-0 text-info" />}
          <p className="text-foreground">
            {worker.enabled ? (
              <>
                <span className="font-semibold">Dry run is on, so Plato will not press Submit.</span> It fills each form, shows you the answers and a preview, and stops. To let it submit for real, set <code className="rounded bg-card px-1 py-0.5 text-xs">APPLY_DRY_RUN=false</code> in the backend .env and restart the backend.
              </>
            ) : (
              <>
                <span className="font-semibold">Auto-apply is paused.</span> Applications stay queued until the apply worker is switched on.
              </>
            )}
          </p>
        </div>
      )}

      {error && <p className="rounded-xl border border-destructive/30 bg-danger-soft p-3 text-sm text-destructive">{error}</p>}

        {/* The table block stays in view on wide screens (rows scroll inside it); the Needs you column scrolls with the page. */}
        <div className="flex flex-col gap-4 xl:sticky xl:top-16 xl:max-h-[calc(100dvh-4rem)] xl:pb-4">
        {/* Title, tabs and column headings stay put while the list scrolls (desktop; the top bar is 64px there). */}
        <div className="z-20 -mx-1 flex flex-col gap-3 bg-background px-1 pt-2 lg:sticky lg:top-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader title="All applications" icon={ListChecks} accent="amber" />
          <PillTabs id="applications-tabs" label="Applications" dataAi="applications.tab" value={tab} onChange={(k) => setQuery({ tab: k })} tabs={TABS.filter((t) => t.key !== "needs").map((t) => ({ key: t.key, label: t.label, count: apps ? scoped.filter((a) => inTab(t.key, a)).length : undefined }))} />
        </div>
        {(threadId || (worker?.enabled && inLine > 0)) && (
          <div className="-mt-1 flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
            {worker?.enabled && inLine > 0 && (
              <span className="mr-auto flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                {inLine} waiting, one at a time · {roughly(queue?.totalEtaSeconds ?? 0)} left
                <InfoTip label="How the time left is estimated" text="Plato applies one at a time for everyone, so this is your last application's place in the shared line times the average time one application takes." />
              </span>
            )}
            {threadId && (
              <button type="button" onClick={() => setQuery({ thread: null })} className="ml-auto flex items-center gap-1.5 rounded-full border border-primary-line bg-primary-soft px-3 py-1 text-[13px] font-semibold text-primary">
                From {threads.find((t) => t.id === threadId)?.title ?? "one search"} ✕
              </button>
            )}
          </div>
        )}

          <div className="hidden md:grid-cols-[minmax(0,1fr)_136px_60px_80px_118px] gap-2.5 rounded-t-2xl border bg-card px-3.5 py-2.5 text-[13px] text-text-secondary md:grid">
            <span>Job</span>
            <span className="flex items-center gap-1.5">
              Status
              <InfoTip label="What the statuses mean" text="Didn't go through covers failed, closed and skipped applications. Please check means Plato can't tell whether the form was sent, so check the site or your email before applying again." />
            </span>
            <span>Date</span>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              Resume used
              <InfoTip label="What tailored and original mean" text="Tailored is a resume Plato wrote from your profile for that job. Original is the resume you uploaded. A dash means none was sent yet." />
            </span>
            <span />
          </div>
        </div>

        <div data-tour="applications-list" className="overflow-hidden rounded-2xl border bg-card md:-mt-4 md:rounded-t-none md:border-t-0 xl:min-h-0 xl:overflow-y-auto">
          {apps === null && !error && (
            <ul aria-busy="true" className="px-4">
              {Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="flex items-center gap-4 border-b border-divider py-3 last:border-b-0">
                  <Skeleton className="size-[34px] rounded-[9px]" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </li>
              ))}
            </ul>
          )}
          {apps !== null && shown.length === 0 && (
            <EmptyState
              icon={Sparkles}
              className="m-4 border-0 py-10"
              title={scoped.length ? "Nothing in this view" : "No applications yet"}
              hint={scoped.length ? "Pick another filter to see the rest." : "Pick jobs from a search and hit “Apply”. They’ll show up here."}
              action={
                scoped.length ? undefined : (
                  <Link href={JOBS_HOME} data-tour="applications-find-jobs" className="group/cta inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary-soft px-3.5 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground">
                    Find jobs
                    <ArrowRight className="size-3.5 transition-transform group-hover/cta:translate-x-0.5" />
                  </Link>
                )
              }
            />
          )}
          <ul>
            {pageRows.map((a) => {
              const s = statusView(a)
              const last = (timeline[a.id] ?? []).at(-1)
              const waitingOnYou = needsAttention(a)
              return (
                <li key={a.id} ref={a.id === focus ? focusRef : undefined} className={cn("grid items-center gap-x-2.5 gap-y-1 border-b border-divider px-3.5 py-2 transition-colors duration-200 last:border-b-0 grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_136px_60px_80px_118px]", a.id === focus ? "bg-primary-tint" : "hover:bg-primary-tint/60")}>
                  <div className="flex min-w-0 items-center gap-3">
                    <MonoTile name={a.job.company} size="sm" />
                    <div className="min-w-0">
                      <Link href={detailHref(a.id)} data-ai={`applications.row:${a.id}`} title={a.job.title} className="block truncate text-[14.5px] font-semibold text-foreground transition-colors duration-200 hover:text-primary">
                        {a.job.title}
                      </Link>
                      <p className="truncate text-[13px] text-text-secondary" title={a.status === "IN_PROGRESS" && last ? last.message : undefined}>
                        {a.job.company}
                      </p>
                    </div>
                  </div>
                  <span>
                    <span title={waitingOnYou || a.status === "EXPIRED" || a.status === "SKIPPED" || a.status === "FAILED" ? (a.error ?? applicationReason(a)) : undefined} className={cn("rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold whitespace-nowrap", a.outcome ? OUTCOME_TONE[a.outcome] : s.tone.replace("text-warning", "text-warning-ink").replace("text-success", "text-success-ink"))}>
                      {a.outcome ? OUTCOME_LABEL[a.outcome] : s.label}
                    </span>
                  </span>
                  <span className="hidden text-sm whitespace-nowrap text-text-secondary md:block">{dateOf(a)}</span>
                  <span className="hidden truncate text-sm text-text-secondary md:block" title={a.resume_strategy?.reasons?.join(" ")}>
                    {a.resume_key ? "Tailored" : a.status === "SUBMITTED" ? "Original" : "—"}
                  </span>
                  <span className="col-span-2 flex items-center justify-end md:col-span-1">
                    {waitingOnYou ? (
                      <button type="button" onClick={() => focusNeed(a.id)} className="text-sm font-semibold text-primary hover:underline">
                        Open
                      </button>
                    ) : a.status === "SUBMITTED" ? (
                      <Link href={detailHref(a.id)} className="group/cta inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap text-primary transition-colors duration-200 hover:text-primary-hover">
                        See what was sent
                        <ArrowRight className="size-3.5 transition-transform group-hover/cta:translate-x-0.5" />
                      </Link>
                    ) : a.status === "EXPIRED" ? (
                      <a href={a.job.url} target="_blank" rel="noreferrer" className="text-sm font-semibold whitespace-nowrap text-primary hover:underline">
                        Job was closed
                      </a>
                    ) : a.status === "IN_PROGRESS" ? (
                      <button type="button" onClick={() => void focusApplicationBrowser(a.id).catch(() => setError("The browser window isn't open right now."))} className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-primary hover:underline">
                        <Radio className="size-3.5" />
                        Watch live
                      </button>
                    ) : canRetry(a) ? (
                      <button type="button" data-ai={`applications.retry:${a.id}`} disabled={retrying === a.id} onClick={() => void retry(a)} title="Put it back in the queue" className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-primary hover:underline disabled:opacity-50">
                        <RotateCcw className={cn("size-3.5", retrying === a.id && "animate-spin")} />
                        {retryLabel(a)}
                      </button>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
        {/* Same bottom bar as Jobs: what this view is, and the pages. */}
        {shown.length > 0 && (
          <div data-tour="applications-pager" className="sticky bottom-[92px] z-10 mr-12 flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-[0_18px_40px_-20px_rgb(8_38_76/0.35)] sm:bottom-4 sm:mr-0">
            <span className="text-[13px] text-text-secondary">{needs.length ? `${needs.length} need you. Plato sends the rest on its own.` : "Plato sends these on its own and keeps you posted."}</span>
            <span className="ml-auto flex items-center gap-2 text-[13px] text-text-tertiary tabular-nums">
              {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + pageRows.length} of {shown.length}
              <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPg({ tab, n: page - 1 })} className="flex size-8 items-center justify-center rounded-lg border bg-card disabled:opacity-40">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPg({ tab, n: page + 1 })} className="flex size-8 items-center justify-center rounded-lg border bg-card disabled:opacity-40">
                <ChevronRight className="size-4" />
              </button>
            </span>
          </div>
        )}
        </div>
      </section>

      {/* Needs you: Plato Apply paused these until the seeker helps (screen 09). */}
      <aside data-tour="applications-needs" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 pt-1">
          <SectionHeader
            title={
              <span className="flex items-center gap-1.5">
                Needs you
                <InfoTip label="What needs you means" text="Applications Plato paused because only you can give what's missing: answers, a skills check, a human check on the site, or confirming it was sent. They wait here until you act." />
              </span>
            }
            icon={Hand}
            accent="amber"
          />
          <span className="pl-[42px] text-[13px] text-text-secondary">Plato Apply paused these until you help</span>
        </div>
        {apps === null && !error && Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-[132px] rounded-2xl" />)}
        {apps !== null && needs.length === 0 && (
          <div className="rounded-2xl border bg-card p-4 shadow-card animate-in fade-in-0 duration-300">
            <PlatoNote variant="inline">Nothing needs you. Plato is applying on its own.</PlatoNote>
          </div>
        )}
        {needs.map((a, i) => (
          <NeedCard key={a.id} app={a} tag={needTag(a)} index={i} onDone={() => void load().then(changed)} />
        ))}
      </aside>
    </div>
  )
}

// One paused application, as in the owner's card: what it is, the one thing needed,
// and the way to give it. The full answer form opens in place.
// Repeated card actions use the soft primary; the page's one solid CTA is elsewhere.
const SOFT_CTA = "w-fit border-transparent bg-primary-soft text-primary shadow-none transition-colors duration-200 hover:bg-primary hover:text-primary-foreground"
function NeedCard({ app: a, tag, index = 0, onDone }: { app: JobApplication; tag: string; index?: number; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const verify = isVerifySubmission(a) || a.status === "NEEDS_USER_VERIFICATION"
  return (
    <div id={`need-${a.id}`} data-tour="need-card" style={{ animationDelay: `${Math.min(index, 6) * 70}ms` }} className="relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border bg-card p-4 pl-5 shadow-card transition-[border-color,box-shadow] duration-200 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both hover:border-primary-line hover:shadow-[var(--shadow-lift)]">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-warning" />
      <div className="flex items-center gap-3">
        <MonoTile name={a.job.company} size="sm" />
        <div className="min-w-0 flex-1">
          <Link href={applicationHref(a.id)} className="block truncate text-[15px] font-semibold transition-colors duration-200 hover:text-primary">
            {a.job.title}
          </Link>
          <p className="truncate text-xs text-text-secondary">{a.job.company}</p>
        </div>
        <StatusPill tone="warning">{tag}</StatusPill>
      </div>
      <p className="text-sm leading-snug text-text-secondary">{needLine(a)}</p>
      {verify ? (
        <>
          <a href={a.job.apply_url ?? a.job.url} target="_blank" rel="noreferrer" data-tour="need-action" className={cn(buttonVariants({ variant: "outline", size: "sm" }), SOFT_CTA)}>
            Open in Chrome
          </a>
          <p className="text-xs text-text-secondary">Everything else is already filled in.</p>
        </>
      ) : open ? (
        <ApplicationReview app={a} onDone={onDone} />
      ) : (
        <button type="button" data-ai={`applications.need:${a.id}`} data-tour="need-action" onClick={() => setOpen(true)} className={cn(buttonVariants({ variant: "outline", size: "sm" }), SOFT_CTA)}>
          {a.needs_input?.reason === "questions" ? "Answer" : a.needs_input?.reason === "resume" ? "Check skills" : a.needs_input?.reason === "profile" ? "Add details" : "Open"}
        </button>
      )}
    </div>
  )
}

export default function ApplicationsPage() {
  return (
    <Suspense fallback={null}>
      <ApplicationsContent />
    </Suspense>
  )
}
