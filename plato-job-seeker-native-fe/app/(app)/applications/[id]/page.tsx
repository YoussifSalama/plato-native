"use client"

import { Breadcrumbs, PAGE } from "@/components/page-header"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ExternalLink, Loader2, MapPin, RotateCcw, Search, Trash2 } from "lucide-react"
import { cn } from "cn"
import { applicationEventsUrl, getApplication, getApplicationResume, retryApplication, withdrawApplication, type AnswerValue, type ApplicationDetail, type ApplyEvent } from "@/lib/jobs/api"
import { applicationReason, canRetry, failureLabel, isVerifySubmission, retryLabel, roughly, statusView, STATUS_STAGE, STEP_STAGE } from "@/lib/jobs/application-status"
import { threadHref, timeAgo } from "@/lib/jobs/links"
import { CompanyAvatar } from "@/components/company-avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { StageStepper } from "../../jobs/components/stage-stepper"
import { ApplicationProof } from "../application-proof"
import { ApplicationReview } from "../application-review"

const showValue = (v: AnswerValue) => (typeof v === "boolean" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join(", ") : v)
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-text-tertiary uppercase">{title}</h2>
      {children}
    </section>
  )
}

// Everything about one application in one place: where it stands, why, what
// Plato did step by step, what it sent, the proof, and what you can do next.
export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
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
    const source = new EventSource(applicationEventsUrl(), { withCredentials: true })
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data as string) as ApplyEvent
      if (event.applicationId !== id) return
      setApp((prev) => (prev ? { ...prev, status: event.status, events: event.step === "claimed" ? [event] : [...prev.events, event] } : prev))
      if (event.status !== "IN_PROGRESS") void load()
    }
    return () => source.close()
  }, [id, load])

  async function act(kind: "retry" | "withdraw") {
    setBusy(kind)
    setError(null)
    try {
      if (kind === "retry") setApp(await retryApplication(id))
      else {
        await withdrawApplication(id)
        router.replace(app?.thread_id ? `/applications?thread=${app.thread_id}` : "/applications")
      }
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
        <Link href="/applications" data-ai="application.back" className="w-fit font-mono text-[11.5px] font-medium tracking-[0.06em] text-primary uppercase hover:underline">
          Applications
        </Link>
        {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : <Skeleton className="h-40 w-full rounded-lg" />}
      </div>
    )

  const s = statusView(app)
  const last = app.events.at(-1)
  const sent = app.evidence?.sent ?? []
  const atsSource = app.job.effective_ats_source ?? app.job.source
  const paused = app.worker.paused?.find((p) => p.source === atsSource)
  const retryable = canRetry(app)
  const canWithdraw = app.status !== "IN_PROGRESS" && app.status !== "SUBMITTED"

  return (
    <div className={PAGE}>
      <Breadcrumbs crumbs={[{ label: "Applications", href: app.thread_id ? `/applications?thread=${app.thread_id}` : "/applications" }]} current={app.job.title} />

      <header className="flex flex-col gap-4 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <CompanyAvatar name={app.job.company} size={52} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground">{app.job.title}</h1>
            <p className="text-sm text-text-secondary">{app.job.company}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-tertiary">
              {app.job.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {app.job.location}
                </span>
              )}
              <span>
                {app.submitted_at ? `Applied ${timeAgo(app.submitted_at)}` : `Queued ${timeAgo(app.created_at)}`}
                {app.attempts > 0 ? ` · ${app.attempts} attempt${app.attempts === 1 ? "" : "s"}` : ""}
              </span>
              {app.thread && (
                <Link href={threadHref(app.thread.id)} className="flex items-center gap-1 text-primary hover:underline">
                  <Search className="size-3.5" />
                  {app.thread.title ?? "From search"}
                </Link>
              )}
            </p>
          </div>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", s.tone)}>{s.label}</span>
            {app.failure_kind && app.status !== "SUBMITTED" && <span className="text-xs text-text-tertiary">{failureLabel(app.failure_kind)}</span>}
          </span>
        </div>

        {/* The one sentence that answers "what is going on with this one?" */}
        <p className={cn("rounded-md p-3 text-sm", app.status === "FAILED" ? "bg-destructive/5 text-destructive" : "bg-muted text-foreground")}>
          {app.status === "IN_PROGRESS" && last
            ? last.message
            : app.status === "QUEUED" && paused
              ? `On hold until ${new Date(paused.until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}: this site keeps asking "verify you are human", and Plato doesn't bypass that.`
              : app.status === "QUEUED" && app.place
                ? `#${app.place.position} in line, done in ${roughly(app.place.etaSeconds)}. Plato applies one at a time.`
                : app.status === "QUEUED" && !app.worker.enabled
                  ? "Waiting: auto-apply is paused."
                  : applicationReason(app)}
        </p>

        {app.evidence?.diagnosis && (
          <p className="rounded-md border border-info/20 bg-info-soft/60 p-3 text-sm text-foreground">
            <span className="font-semibold">What Plato worked out: </span>
            {app.evidence.diagnosis}
            {app.evidence.repairs ? ` (${app.evidence.repairs} automatic fix${app.evidence.repairs === 1 ? "" : "es"} tried)` : ""}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {retryable && (
            <Button data-ai="application.retry" size="sm" disabled={busy !== null} onClick={() => void act("retry")}>
              {busy === "retry" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
              {retryLabel(app)}
            </Button>
          )}
          <a href={app.job.apply_url ?? app.job.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted">
            Open posting <ExternalLink className="size-3.5" />
          </a>
          {canWithdraw &&
            (confirmWithdraw ? (
              <span className="ml-auto flex items-center gap-2 text-sm text-text-secondary">
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
              <button type="button" data-ai="application.withdraw" onClick={() => setConfirmWithdraw(true)} className="ml-auto flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-text-secondary hover:bg-muted hover:text-destructive">
                <Trash2 className="size-3.5" />
                Remove
              </button>
            ))}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </header>

      {app.status !== "SUBMITTED" && app.status !== "EXPIRED" && app.status !== "SKIPPED" && app.worker.sources.includes(atsSource) && (
        <div className="rounded-lg border bg-card p-5">
          <StageStepper current={last && app.status === "IN_PROGRESS" ? (STEP_STAGE[last.step] ?? STATUS_STAGE[app.status]) : STATUS_STAGE[app.status]} />
        </div>
      )}

      {isVerifySubmission(app) && <p className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm text-warning">{applicationReason(app)}</p>}

      {(app.status === "NEEDS_INPUT" || app.status === "NEEDS_USER_VERIFICATION") && <ApplicationReview app={app} live={app.verificationLive} onDone={() => void load()} />}

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="What happened, step by step">
          {app.events.length === 0 ? (
            <p className="text-sm text-text-secondary">{app.status === "QUEUED" ? "Plato hasn't started on this one yet." : "No steps were recorded for this attempt."}</p>
          ) : (
            <ol className="flex flex-col gap-2.5 border-l border-divider pl-4">
              {app.events.map((e, i) => (
                <li key={`${e.at}-${i}`} className="relative text-sm text-foreground">
                  <span className={cn("absolute top-1.5 -left-[21px] size-2 rounded-full", e.step === "failed" ? "bg-destructive" : e.step === "submitted" ? "bg-success" : i === app.events.length - 1 ? "bg-primary" : "bg-lavender/60")} />
                  {e.message}
                  <span className="ml-2 text-xs text-text-tertiary">{clock(e.at)}</span>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title={app.status === "SUBMITTED" && !app.evidence?.dryRun ? "What Plato sent" : "What Plato prepared"}>
          {sent.length === 0 ? (
            <p className="text-sm text-text-secondary">{app.evidence?.manual ? "You submitted this one yourself." : "Plato didn't get as far as preparing answers."}</p>
          ) : (
            <dl className="flex flex-col gap-3">
              {sent.map((row, i) => (
                <div key={i}>
                  <dt className="text-xs text-text-tertiary">{row.label}</dt>
                  <dd className="text-sm whitespace-pre-line text-foreground">{showValue(row.value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </Section>
      </div>

      {app.resume_key && (
        <div className="rounded-lg border bg-card p-5">
          <Button variant="outline" size="sm" onClick={() => void getApplicationResume(app.id).then((url) => window.open(url, "_blank"))}>
            View the resume Plato wrote for this job
          </Button>
          {app.resume_strategy && (
            <ul className="mt-3 list-disc pl-4 text-xs text-text-secondary">
              {app.resume_strategy.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
              {app.resume_strategy.checks.filter((c) => !c.ok).map((c) => (
                <li key={c.name} className="text-destructive">
                  Check failed: {c.name}
                  {c.detail ? ` (${c.detail})` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {app.evidence?.screenshotKey && (
        <div className="rounded-lg border bg-card p-5">
          <ApplicationProof applicationId={app.id} kind={app.evidence.failed ? "failed" : app.evidence.dryRun ? "dryRun" : "submitted"} fileName={`plato-application-${app.job.company.replace(/\W+/g, "-").toLowerCase()}.png`} />
        </div>
      )}
    </div>
  )
}
