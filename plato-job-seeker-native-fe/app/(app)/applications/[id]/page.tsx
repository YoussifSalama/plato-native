"use client"

import { liveSource } from "@/lib/live-source"
import { PAGE } from "@/components/page-header"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ChevronRight, ExternalLink, Loader2, RotateCcw, Trash2 } from "lucide-react"
import { cn } from "cn"
import { applicationEventsUrl, getApplication, retryApplication, withdrawApplication, type ApplicationDetail, type ApplyEvent } from "@/lib/jobs/api"
import { applicationReason, canRetry, isVerifySubmission, retryLabel, roughly, statusView, STATUS_STAGE, STEP_STAGE } from "@/lib/jobs/application-status"
import { timeAgo } from "@/lib/jobs/links"
import { CARD, MonoTile, StatusPill, type Tone } from "@/components/plato-ui"
import { OUTCOME_LABEL } from "@/components/outcome-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { Button, buttonVariants } from "@/components/ui/button"
import { StageStepper } from "../../jobs/components/stage-stepper"
import { DetailsCard, DOT, isExtension, JobCard, OutcomeCard, SentCard, StepsCard } from "./sections"
import { ApplicationReview } from "../application-review"

// Status accent, aware of the "Please check" (VERIFY) case.
const statusTone = (app: ApplicationDetail): Tone =>
  isVerifySubmission(app) ? "warning" : ({ SUBMITTED: "success", FAILED: "danger", NEEDS_INPUT: "warning", NEEDS_USER_VERIFICATION: "warning", IN_PROGRESS: "info", EXTENSION_ACTIVE: "info" } as Partial<Record<ApplicationDetail["status"], Tone>>)[app.status] ?? "neutral"

// The way back to the list (keeps its tab and filters). data-ai: the assistant clicks it.
function Back({ href, current }: { href: string; current?: string }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[11.5px] font-semibold tracking-[0.08em] uppercase">
      <Link href={href} data-ai="application.back" className="shrink-0 text-primary transition-colors duration-200 hover:text-primary-hover hover:underline">
        Applications
      </Link>
      {current && (
        <>
          <ChevronRight className="size-3 shrink-0 text-text-tertiary" aria-hidden />
          <span className="min-w-0 truncate text-text-tertiary" aria-current="page">
            {current}
          </span>
        </>
      )}
    </nav>
  )
}

// Everything about one application, most important first: where it stands and
// the one thing to do next, how it got there, what was sent, the job itself,
// then outcome tracking and the small print.
export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  // The list's tab and filters (?from=tab%3Dneeds…), so "Applications" goes back to the same view.
  const from = useSearchParams().get("from")
  const [app, setApp] = useState<ApplicationDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<"retry" | "withdraw" | null>(null)
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)

  const load = useCallback(
    () =>
      getApplication(id)
        .then(setApp)
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load this application")),
    [id],
  )

  useEffect(() => {
    void load()
    // Live: append this application's steps as they happen; refetch the row
    // whenever its status settles.
    return liveSource(
      applicationEventsUrl(),
      (msg) => {
        const event = JSON.parse(msg.data as string) as ApplyEvent
        if (event.applicationId !== id) return
        setApp((prev) => (prev ? { ...prev, status: event.status, events: event.step === "claimed" ? [event] : [...prev.events, event] } : prev))
        if (event.status !== "IN_PROGRESS") void load()
      },
      () => void load(),
    )
  }, [id, load])

  // The extension reports to the server, not to this stream: while it is working
  // on this one in the browser, refresh now and then so new steps appear.
  const extensionLive = app?.status === "EXTENSION_ACTIVE" && !isVerifySubmission(app)
  useEffect(() => {
    if (!extensionLive) return
    const t = window.setInterval(() => void load(), 5000)
    return () => window.clearInterval(t)
  }, [extensionLive, load])

  const listHref = from ? `/applications?${from}` : app?.thread_id ? `/applications?thread=${app.thread_id}` : "/applications"

  async function act(kind: "retry" | "withdraw") {
    setBusy(kind)
    setError(null)
    try {
      if (kind === "retry") setApp(await retryApplication(id))
      else {
        await withdrawApplication(id)
        router.replace(listHref)
      }
      window.dispatchEvent(new Event("plato:applications-changed"))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(null)
      setConfirmWithdraw(false)
    }
  }

  if (!app)
    return (
      <div className={PAGE}>
        <Back href={listHref} />
        {error ? (
          <p className={cn(CARD, "p-4 text-sm text-destructive")}>{error}</p>
        ) : (
          <div aria-busy="true" className="flex flex-col gap-6">
            <Skeleton className="h-44 w-full rounded-2xl" />
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
              <Skeleton className="h-72 rounded-2xl" />
              <Skeleton className="h-56 rounded-2xl" />
            </div>
          </div>
        )}
      </div>
    )

  const s = statusView(app)
  const tone = statusTone(app)
  const last = app.events.at(-1)
  const ext = isExtension(app)
  const verify = isVerifySubmission(app)
  const needsYou = app.status === "NEEDS_INPUT" || app.status === "NEEDS_USER_VERIFICATION"
  const atsSource = app.job.effective_ats_source ?? app.job.source
  const paused = app.worker.paused?.find((p) => p.source === atsSource)
  const retryable = canRetry(app)
  const canWithdraw = app.status !== "IN_PROGRESS" && app.status !== "SUBMITTED"
  const posting = app.job.apply_url ?? app.job.url
  const sent = app.status === "SUBMITTED" && !app.evidence?.dryRun
  const terminal = app.status === "SUBMITTED" || app.status === "FAILED" || app.status === "EXPIRED" || app.status === "SKIPPED"
  // Which screen this is, for the page tour (lib/tours.ts).
  const screen = needsYou ? "needs" : verify ? "verify" : app.status === "SUBMITTED" ? "sent" : terminal ? "failed" : "progress"
  const when = app.submitted_at ? `Sent ${timeAgo(app.submitted_at)}` : `Updated ${timeAgo(app.batch_item?.updated_at ?? app.updated_at)}`

  // The one sentence that answers "what is going on with this one?"
  const sentence =
    app.status === "IN_PROGRESS" && last
      ? last.message
      : app.status === "QUEUED" && paused
        ? `On hold until ${new Date(paused.until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}: this site keeps asking "verify you are human", and Plato doesn't bypass that.`
        : app.status === "QUEUED" && app.place
          ? `#${app.place.position} in line, done in ${roughly(app.place.etaSeconds)}. Plato applies one at a time.`
          : app.status === "QUEUED" && !app.worker.enabled
            ? "Waiting: auto-apply is paused."
            : sent && app.outcome
              ? `Sent ${timeAgo(app.submitted_at ?? app.updated_at)}. You marked it: ${OUTCOME_LABEL[app.outcome]}.`
              : applicationReason(app)

  const primary = buttonVariants({ size: "sm" })
  // The ONE next step for the seeker, if there is one.
  const next = needsYou ? (
    <a href="#review" className={primary}>
      {app.status === "NEEDS_USER_VERIFICATION" ? "Complete the check" : "Answer what Plato needs"}
    </a>
  ) : verify ? (
    <a href={posting} target="_blank" rel="noreferrer" className={primary}>
      Check the employer&apos;s site <ExternalLink className="size-3.5" />
    </a>
  ) : retryable ? (
    <Button data-ai="application.retry" size="sm" disabled={busy !== null} onClick={() => void act("retry")}>
      {busy === "retry" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
      {retryLabel(app)}
    </Button>
  ) : sent && !app.outcome ? (
    <a href="#outcome" className={primary}>
      Heard back? Mark it
    </a>
  ) : null

  return (
    <div data-tour-state={`application.${screen}`} className={PAGE}>
      <Back href={listHref} current={app.job.title} />

      {/* a. Where it stands, and the one thing to do next. */}
      <header data-tour="application-hero" className={cn(CARD, "relative isolate flex flex-col gap-4 overflow-hidden p-5 pl-6 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 sm:p-6 sm:pl-7 motion-reduce:animate-none")}>
        {/* Section light: a faint amber glow top-right (Applications accent), calm enough to sit behind the status. */}
        <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_120%_at_100%_0%,color-mix(in_oklch,var(--azure)_8%,transparent),transparent_60%),radial-gradient(45%_90%_at_0%_100%,color-mix(in_oklch,var(--primary)_5%,transparent),transparent_65%)]" />
        <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", DOT[tone])} />
        <div className="flex items-start gap-3.5">
          <MonoTile name={app.job.company} className="hidden sm:flex" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={tone}>{s.label}</StatusPill>
              <span className="type-meta text-text-tertiary">{when}</span>
            </div>
            <h1 className="type-section-title text-balance break-words text-foreground sm:type-page-title">{app.job.title}</h1>
            <p className="text-sm text-text-secondary">
              {app.job.company}
              <span className="text-text-tertiary"> · {ext ? "Applied by the Plato extension" : "Applied by Plato"}</span>
            </p>
          </div>
        </div>

        <p data-tour="application-sentence" className="max-w-[70ch] text-[15px] leading-relaxed text-foreground">{sentence}</p>
        {app.evidence?.diagnosis && (
          <p className="max-w-[70ch] text-sm text-text-secondary">
            <span className="font-semibold text-foreground">What Plato worked out: </span>
            {app.evidence.diagnosis}
            {app.evidence.repairs ? ` (${app.evidence.repairs} automatic fix${app.evidence.repairs === 1 ? "" : "es"} tried)` : ""}
          </p>
        )}

        <div data-tour="application-actions" className="flex flex-wrap items-center gap-2">
          {next}
          {!verify && (
            <a href={posting} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "group/link transition-colors duration-200 hover:border-primary-line hover:text-primary")}>
              Open posting <ExternalLink className="size-3.5 transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
            </a>
          )}
          {canWithdraw &&
            (confirmWithdraw ? (
              <span className="flex flex-wrap items-center gap-2 text-sm text-text-secondary sm:ml-auto">
                Remove it from Plato&apos;s list?
                <Button size="sm" variant="destructive" disabled={busy !== null} onClick={() => void act("withdraw")}>
                  {busy === "withdraw" && <Loader2 className="size-3.5 animate-spin" />}
                  Yes, remove
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmWithdraw(false)}>
                  Keep
                </Button>
              </span>
            ) : (
              <button type="button" data-ai="application.withdraw" onClick={() => setConfirmWithdraw(true)} className="ml-auto flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-text-secondary transition-colors duration-200 hover:bg-muted hover:text-destructive">
                <Trash2 className="size-3.5" />
                Remove
              </button>
            ))}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!terminal && app.worker.sources.includes(atsSource) && (
          <div data-tour="application-stepper" className="border-t border-divider pt-4">
            <StageStepper current={last && app.status === "IN_PROGRESS" ? (STEP_STAGE[last.step] ?? STATUS_STAGE[app.status]) : STATUS_STAGE[app.status]} />
          </div>
        )}
      </header>

      {needsYou && (
        <div id="review" data-tour="application-review" className="scroll-mt-20">
          <ApplicationReview app={app} live={app.verificationLive} onDone={() => void load().then(() => window.dispatchEvent(new Event("plato:applications-changed")))} />
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        {/* b–c. How it got here, and what was sent. */}
        <div className="flex min-w-0 flex-col gap-6">
          <StepsCard app={app} />
          <SentCard app={app} />
        </div>
        {/* d–e. The job, outcome tracking, the small print. */}
        <aside className="flex min-w-0 flex-col gap-6">
          <JobCard app={app} />
          <OutcomeCard app={app} onChange={(outcome) => setApp((prev) => (prev ? { ...prev, outcome } : prev))} />
          <DetailsCard app={app} />
        </aside>
      </div>
    </div>
  )
}
