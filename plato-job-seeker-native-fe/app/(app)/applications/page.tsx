"use client"

import { PAGE, PageHeader } from "@/components/page-header"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { ChevronDown, CircleCheck, Clock, ExternalLink, FlaskConical, PauseCircle, Radio, RotateCcw, Sparkles } from "lucide-react"
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
  type AnswerValue,
  type ApplicationStatus,
  type ApplyEvent,
  type ApplyQueue,
  type ApplyReadiness,
  type JobApplication,
  type ThreadSummary,
} from "@/lib/jobs/api"
import { JOBS_HOME, threadHref, timeAgo } from "@/lib/jobs/links"
import { applicationHref, applicationReason, canRetry, isVerifySubmission, needsAttention, retryLabel, roughly, statusView, STATUS_STAGE, STEP_STAGE } from "@/lib/jobs/application-status"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MonoTile, PlatoNote, Segmented, StatTile, StatusPill } from "@/components/plato-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { StageStepper } from "../jobs/components/stage-stepper"
import { ApplicationProof } from "./application-proof"
import { ApplicationReview } from "./application-review"

const TABS = [
  { key: "all", label: "All", statuses: null },
  { key: "needs", label: "Needs you", statuses: ["NEEDS_INPUT", "NEEDS_USER_VERIFICATION"] },
  { key: "active", label: "In progress", statuses: ["QUEUED", "IN_PROGRESS", "EXTENSION_ACTIVE"] },
  { key: "applied", label: "Applied", statuses: ["SUBMITTED"] },
  { key: "problems", label: "Didn't go through", statuses: ["FAILED", "EXPIRED", "SKIPPED"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly ApplicationStatus[] | null }[]
type TabKey = (typeof TABS)[number]["key"]

const inLastWeek = (iso: string) => Date.now() - new Date(iso).getTime() < 7 * 864e5
const showValue = (v: AnswerValue) => (typeof v === "boolean" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join(", ") : v)

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
  const [expanded, setExpanded] = useState<string | null>(focus)
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
    const source = new EventSource(applicationEventsUrl(), { withCredentials: true })
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data as string) as ApplyEvent
      setTimeline((prev) => ({ ...prev, [event.applicationId]: [...(prev[event.applicationId] ?? []), event].slice(-12) }))
      // A settled application moves everyone behind it up the line.
      if (event.status !== "IN_PROGRESS") void Promise.all([load(), loadQueue()])
      else setApps((prev) => prev?.map((a) => (a.id === event.applicationId ? { ...a, status: "IN_PROGRESS" } : a)) ?? prev)
    }
    return () => source.close()
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
  const ALL = "all"
  const sourceOptions = [{ value: ALL, label: "All platforms" }, ...Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))]
  const threadOptions = [{ value: ALL, label: "All searches" }, ...threads.map((t) => ({ value: t.id, label: t.title ?? "Untitled search" }))]
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
  const active = scoped.find((a) => a.status === "IN_PROGRESS")
  const activeStep = active ? timeline[active.id]?.at(-1) : undefined

  async function retry(a: JobApplication) {
    setRetrying(a.id)
    try {
      await retryApplication(a.id)
      await Promise.all([load(), loadQueue()])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retry")
    } finally {
      setRetrying(null)
    }
  }

  const needs = scoped.filter(needsAttention)
  const appliedWeek = scoped.filter((a) => a.status === "SUBMITTED" && inLastWeek(a.submitted_at ?? a.updated_at)).length
  const settled = scoped.filter((a) => ["SUBMITTED", "FAILED", "EXPIRED", "SKIPPED"].includes(a.status))
  const wentThrough = settled.length ? Math.round((settled.filter((a) => a.status === "SUBMITTED").length / settled.length) * 100) : null
  const focusNeed = (id: string) => {
    const el = document.getElementById(`need-${id}`)
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
    el?.animate([{ boxShadow: "0 0 0 4px rgb(217 119 6 / 0.35)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1200 })
  }
  const dateOf = (a: JobApplication) => (a.status === "QUEUED" ? (queue?.positions[a.id] ? `#${queue.positions[a.id].position} in line` : "In queue") : timeAgo(a.submitted_at ?? a.updated_at))

  return (
    <div className={PAGE}>
      <PageHeader
        crumbs={threadId ? [{ label: "Jobs", href: JOBS_HOME }, { label: "Search", href: threadHref(threadId) }] : undefined}
        title="Applications"
        description="Every application Plato sends for you, and anything it needs from you to finish one."
        actions={
          apps && (
            <div className="flex flex-wrap gap-2.5">
              <StatTile value={scoped.length} label={threadId ? "From this search" : "All applications"} />
              <StatTile value={appliedWeek} label="Applied this week" />
              {wentThrough !== null && <StatTile value={`${wentThrough}%`} label="Went through" />}
              <StatTile value={needs.length} label="Need you" tone={needs.length ? "need" : undefined} />
            </div>
          )
        }
      />

      {readiness && !readiness.ready && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning-line bg-warning-soft/70 p-4 text-sm">
          <p className="min-w-0 flex-1 text-foreground">
            <span className="font-semibold">Plato can&apos;t apply for you yet.</span> It never asks per job, so it needs these once: {readiness.missing.map((m) => m.label).join("; ")}.
          </p>
          <Link href="/onboarding?step=2" className="inline-flex h-9 shrink-0 items-center rounded-xl bg-primary px-3.5 text-sm font-medium text-primary-foreground">
            Complete my details
          </Link>
        </div>
      )}

      {worker?.paused?.map((p) => (
        <div key={p.source} className="flex items-start gap-3 rounded-2xl border border-warning-line bg-warning-soft/70 p-4 text-sm">
          <PauseCircle className="mt-0.5 size-4 shrink-0 text-warning-ink" />
          <p className="text-foreground">
            <span className="font-semibold">{p.source[0] + p.source.slice(1).toLowerCase()} applications are on hold</span> until {new Date(p.until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. The site asks &quot;verify you are human&quot; on every application, and Plato doesn&apos;t bypass that. The ones it reached are under &quot;Needs you&quot; with a link to submit by hand.
          </p>
        </div>
      ))}

      {worker && (!worker.enabled || worker.dryRun) && (
        <div className="flex items-start gap-3 rounded-2xl border border-info/20 bg-info-soft/70 p-4 text-sm">
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

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex min-w-0 flex-col gap-3">
          {active && (
            <motion.div layout className="flex flex-col gap-3 rounded-[22px] border border-primary/20 bg-card p-4 shadow-card">
              <div className="flex items-center gap-3">
                <MonoTile name={active.job.company} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-primary uppercase">Applying now</p>
                  <p className="truncate text-sm font-semibold text-foreground">
                    {active.job.title} · {active.job.company}
                  </p>
                </div>
                <span className="relative flex size-2.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-primary/50" />
                  <span className="relative size-2.5 rounded-full bg-primary" />
                </span>
              </div>
              <StageStepper current={activeStep ? (STEP_STAGE[activeStep.step] ?? 4) : 4} />
              <p className="text-sm text-text-secondary">{activeStep?.message ?? "Plato is working on it"}</p>
            </motion.div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold tracking-tight">All applications</h2>
            <Segmented value={tab} onChange={(k) => setQuery({ tab: k })} options={TABS.map((t) => ({ value: t.key, label: `${t.label} · ${scoped.filter((a) => inTab(t.key, a)).length}` }))} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
            {worker?.enabled && (inLine > 0 || (!active && scoped.length > 0)) && (
              <span className="mr-auto flex items-center gap-2">
                {inLine > 0 ? <Clock className="size-4 text-primary" /> : <CircleCheck className="size-4 text-success" />}
                {inLine > 0 ? `${inLine} waiting, one at a time · ${roughly(queue?.totalEtaSeconds ?? 0)} left` : "Queue is empty."}
              </span>
            )}
            <span className="ml-auto">Platform:</span>
            <Select items={sourceOptions} value={source ?? ALL} onValueChange={(v) => setQuery({ source: v })}>
              <SelectTrigger className="h-9 max-w-48 gap-1.5 rounded-full bg-card px-3.5 text-[13px] font-semibold text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end" className="w-max max-w-80 min-w-(--anchor-width)">
                {sourceOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            Search:
            <Select items={threadOptions} value={threadId ?? ALL} onValueChange={(v) => setQuery({ thread: v })}>
              <SelectTrigger className="h-9 max-w-64 gap-1.5 rounded-full bg-card px-3.5 text-[13px] font-semibold text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end" className="w-max max-w-80 min-w-(--anchor-width)">
                {threadOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-[22px] border bg-card shadow-card">
            <div className="hidden grid-cols-[minmax(0,1fr)_150px_110px_auto] gap-4 border-b px-5 py-2.5 text-[13px] text-text-tertiary md:grid">
              <span>Job</span>
              <span>Status</span>
              <span>Date</span>
              <span className="w-[170px]" />
            </div>
            {apps === null && !error && (
              <ul aria-busy="true" className="px-5">
                {Array.from({ length: 4 }, (_, i) => (
                  <li key={i} className="flex items-center gap-4 border-b border-divider py-4 last:border-b-0">
                    <Skeleton className="size-10 rounded-[10px]" />
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
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Sparkles className="size-5" />
                </span>
                <p className="text-sm font-semibold text-foreground">{scoped.length ? "Nothing in this view" : "No applications yet"}</p>
                <p className="max-w-sm text-sm text-text-secondary">{scoped.length ? "Pick another filter to see the rest." : "Pick jobs from a search and hit “Apply”. They’ll show up here."}</p>
              </div>
            )}
            <ul>
              {shown.map((a) => {
                const s = statusView(a)
                const steps = timeline[a.id] ?? []
                const last = steps.at(-1)
                const waitingOnYou = needsAttention(a)
                const open = expanded === a.id && !waitingOnYou
                const atsSource = a.job.effective_ats_source ?? a.job.source
                const supported = !worker || worker.sources.includes(atsSource)
                const sent = a.evidence?.sent ?? []
                const hasProof = !!a.evidence?.screenshotKey
                const hasDetails = !waitingOnYou && (steps.length > 0 || sent.length > 0 || hasProof)
                return (
                  <li key={a.id} ref={a.id === focus ? focusRef : undefined} className={cn("border-b border-divider px-5 py-3 transition-colors last:border-b-0", waitingOnYou ? "bg-warning-soft/40" : a.id === focus ? "bg-primary-tint" : "hover:bg-primary-tint/60")}>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1fr)_150px_110px_auto]">
                      <div className="flex min-w-0 items-center gap-3">
                        <MonoTile name={a.job.company} size="sm" />
                        <div className="min-w-0">
                          <Link href={applicationHref(a.id)} data-ai={`applications.row:${a.id}`} className="block truncate font-semibold text-foreground hover:underline">
                            {a.job.title}
                          </Link>
                          <p className="truncate text-[13px] text-text-secondary">
                            {a.job.company}
                            {a.status === "IN_PROGRESS" && last ? ` · ${last.message}` : waitingOnYou || a.status === "EXPIRED" || a.status === "SKIPPED" ? ` · ${applicationReason(a)}` : ""}
                          </p>
                          {a.error && a.status !== "SUBMITTED" && !waitingOnYou && <p className="mt-0.5 line-clamp-1 text-xs text-destructive">{a.error}</p>}
                        </div>
                      </div>
                      <span>
                        <span className={cn("rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold whitespace-nowrap", s.tone.replace("text-warning", "text-warning-ink").replace("text-success", "text-success-ink"))}>{s.label}</span>
                      </span>
                      <span className="hidden text-sm whitespace-nowrap text-text-secondary md:block">{dateOf(a)}</span>
                      <span className="col-span-2 flex items-center justify-end gap-1 md:col-span-1 md:w-[170px]">
                        {waitingOnYou ? (
                          <button type="button" onClick={() => focusNeed(a.id)} className="text-sm font-semibold text-primary hover:underline xl:inline">
                            Answer
                          </button>
                        ) : (
                          <>
                            {canRetry(a) && (
                              <button type="button" data-ai={`applications.retry:${a.id}`} disabled={retrying === a.id} onClick={() => void retry(a)} title="Put it back in the queue" className="flex h-[30px] items-center gap-1.5 rounded-lg border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50">
                                <RotateCcw className={cn("size-3.5", retrying === a.id && "animate-spin")} />
                                {retryLabel(a)}
                              </button>
                            )}
                            {a.status === "IN_PROGRESS" && (
                              <button type="button" onClick={() => void focusApplicationBrowser(a.id).catch(() => setError("The browser window isn't open right now."))} className="flex h-[30px] items-center gap-1.5 rounded-lg border border-primary/30 bg-primary-soft px-2.5 text-xs font-medium whitespace-nowrap text-primary hover:bg-primary/10">
                                <Radio className="size-3.5" />
                                Watch live
                              </button>
                            )}
                            {a.status === "SUBMITTED" && (
                              <Link href={applicationHref(a.id)} className="text-sm font-semibold text-primary hover:underline">
                                See what was sent
                              </Link>
                            )}
                          </>
                        )}
                        <a href={a.job.apply_url ?? a.job.url} target="_blank" rel="noreferrer" aria-label="Open posting" className="flex size-[30px] items-center justify-center rounded-lg text-lavender hover:bg-muted hover:text-text-secondary">
                          <ExternalLink className="size-4" />
                        </a>
                        <button type="button" disabled={!hasDetails} aria-expanded={open} aria-label={open ? "Hide details" : "Show details"} onClick={() => setExpanded(open ? null : a.id)} className="flex size-[30px] items-center justify-center rounded-lg text-lavender hover:bg-muted hover:text-text-secondary disabled:opacity-30">
                          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
                        </button>
                      </span>
                    </div>

                    <AnimatePresence initial={false}>
                      {open && hasDetails && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="flex flex-col gap-4 pt-4 pl-[46px]">
                            {a.status !== "SUBMITTED" && a.status !== "EXPIRED" && supported && <StageStepper current={last ? (STEP_STAGE[last.step] ?? STATUS_STAGE[a.status]) : STATUS_STAGE[a.status]} />}
                            {steps.length > 0 && (
                              <ol className="flex flex-col gap-1.5 border-l border-divider pl-4">
                                {steps.map((e, i) => (
                                  <li key={`${e.at}-${i}`} className="relative text-[13px] text-text-secondary">
                                    <span className={cn("absolute top-1.5 -left-[21px] size-2 rounded-full", i === steps.length - 1 ? "bg-primary" : "bg-lavender/60")} />
                                    {e.message}
                                    <span className="ml-2 text-xs text-text-tertiary">{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                                  </li>
                                ))}
                              </ol>
                            )}
                            {hasProof && <ApplicationProof applicationId={a.id} kind={a.evidence?.failed ? "failed" : a.evidence?.dryRun ? "dryRun" : "submitted"} fileName={`plato-application-${a.job.company.replace(/\W+/g, "-").toLowerCase()}.png`} />}
                            {sent.length > 0 && (
                              <div className="flex flex-col gap-2">
                                <p className="text-[11px] font-semibold tracking-[0.08em] text-text-tertiary uppercase">{a.evidence?.dryRun ? "What Plato would send" : "What Plato sent"}</p>
                                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                                  {sent.map((row, i) => (
                                    <div key={i} className="min-w-0">
                                      <dt className="truncate text-xs text-text-tertiary" title={row.label}>
                                        {row.label}
                                      </dt>
                                      <dd className="text-sm whitespace-pre-line text-foreground">{showValue(row.value)}</dd>
                                    </div>
                                  ))}
                                </dl>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        {/* Needs you: Plato Apply paused these until the seeker helps (screen 09). */}
        <aside className="flex flex-col gap-3 xl:sticky xl:top-24">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Needs you</h2>
            <p className="text-[13px] text-text-secondary">Plato paused these until you help. Every answer is saved for next time.</p>
          </div>
          {apps !== null && needs.length === 0 && (
            <div className="rounded-2xl border bg-card p-4 shadow-card">
              <PlatoNote variant="inline">Nothing needs you. Plato is applying on its own.</PlatoNote>
            </div>
          )}
          {needs.map((a) => (
            <div key={a.id} id={`need-${a.id}`} className="flex flex-col gap-3 rounded-2xl border border-warning-line bg-[#fffdf5] p-4 shadow-card">
              <div className="flex items-center gap-3">
                <MonoTile name={a.job.company} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link href={applicationHref(a.id)} className="block truncate text-sm font-semibold hover:underline">
                    {a.job.title}
                  </Link>
                  <p className="truncate text-xs text-text-secondary">{a.job.company}</p>
                </div>
                <StatusPill tone="warning">{isVerifySubmission(a) ? "Please check" : a.status === "NEEDS_USER_VERIFICATION" ? "Human check" : a.needs_input?.reason === "questions" ? "Question" : "Needs you"}</StatusPill>
              </div>
              {isVerifySubmission(a) ? <p className="text-sm font-medium text-warning-ink">{applicationReason(a)}</p> : <ApplicationReview app={a} onDone={() => void load()} />}
            </div>
          ))}
        </aside>
      </div>
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
