"use client"

import { reasonText } from "@/lib/jobs/application-status"
import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowRight, Briefcase, Camera, Download, ExternalLink, ImageOff, Info, Loader2, Maximize2, MessageSquareText, PackageCheck, Route, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { CARD, EmptyState, MetaChip, SectionHeader, type Tone } from "@/components/plato-ui"
import { CountUp } from "@/components/count-up"
import { Button } from "@/components/ui/button"
import { OutcomePicker } from "@/components/outcome-picker"
import { InfoTip } from "@/components/info-tip"
import { getApplicationResume, getApplicationScreenshot, SOURCE_LABEL, type AnswerValue, type ApplicationDetail, type ApplicationOutcome, type ApplyItemStep } from "@/lib/jobs/api"
import { failureLabel, isVerifySubmission } from "@/lib/jobs/application-status"
import { threadHref } from "@/lib/jobs/links"

// The cards of the single-application page. Each reads only what the detail
// endpoint returns and shows a calm empty state when the data isn't there
// (older applications, or ones that never got that far).
//
// Colour rule (owner): white cards, ink text, one status accent used only on
// small marks (dots, chips, the hero's accent bar). Cobalt is for links and
// the primary action only.

export const isExtension = (app: ApplicationDetail) => app.engine === "EXTENSION"

const showValue = (v: AnswerValue) => (typeof v === "boolean" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join(", ") : v)
export const dayTime = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString()
const humanize = (s: string) => s.replace(/[_-]+/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())

// The status accent, as a small solid mark.
export const DOT: Record<Tone, string> = {
  success: "bg-success",
  danger: "bg-destructive",
  warning: "bg-warning",
  primary: "bg-primary",
  info: "bg-info",
  neutral: "bg-text-tertiary/50",
}
export const Dot = ({ tone, className }: { tone: Tone; className?: string }) => <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT[tone], className)} />

// Cards fade up one after another on load (CSS, so reduced motion is respected by the browser setting via tw-animate).
export const enter = (index = 0) => ({ className: "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 motion-reduce:animate-none", style: { animationDelay: `${index * 70}ms` } })

export function Card({ title, icon, index, aside, children, className, id, tour }: { title: string; icon?: LucideIcon; index?: number; aside?: ReactNode; children: ReactNode; className?: string; id?: string; tour?: string }) {
  const e = enter(index)
  return (
    <section id={id} data-tour={tour} style={e.style} className={cn(CARD, "flex min-w-0 scroll-mt-20 flex-col gap-4 p-5", e.className)}>
      <div className="flex items-center justify-between gap-3">
        <SectionHeader title={title} icon={icon} accent="amber" />
        {aside}
      </div>
      <div className={cn("flex min-w-0 flex-col gap-4", className)}>{children}</div>
    </section>
  )
}

// A label over its value: the one row style for facts on this page.
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="type-meta text-text-tertiary">{label}</dt>
      <dd className="text-sm break-words text-foreground">{children}</dd>
    </div>
  )
}

// ---- Steps ----------------------------------------------------------------

const STATE_STEP: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Waiting in the extension's queue", tone: "neutral" },
  CLAIMED: { label: "The extension picked it up", tone: "neutral" },
  PREPARING: { label: "Opened the application page", tone: "neutral" },
  NEEDS_USER: { label: "Asked you for something", tone: "warning" },
  FILLING: { label: "Filled in the form", tone: "neutral" },
  REVIEW: { label: "Checked the filled form", tone: "neutral" },
  AWAITING_SUBMIT: { label: "Ready to submit", tone: "neutral" },
  VERIFY: { label: "Couldn't tell if it was sent", tone: "warning" },
  SUBMITTED_CONFIRMED: { label: "Sent: the employer's page confirmed it", tone: "success" },
  SUBMITTED_ATTESTED: { label: "Sent: you confirmed it", tone: "success" },
  FAILED: { label: "Didn't go through", tone: "danger" },
  SKIPPED: { label: "Skipped", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
}
const stateStep = (s: string) => STATE_STEP[s] ?? { label: humanize(s), tone: "neutral" as Tone }


type Step = { key: string; at: string; title: string; tone: Tone; notes: string[] }

function extensionSteps(app: ApplicationDetail): Step[] {
  const item = app.batch_item
  if (!item) return []
  const notes = (h: Partial<ApplyItemStep>) =>
    [h.message, h.reason && !(h.message && h.reason === "closed") && reasonText(h.reason), h.marker && `The page said: “${h.marker}”`, h.failure_kind && h.failure_kind !== "site_error" && failureLabel(h.failure_kind)].filter((x): x is string => !!x)
  const start: Step = { key: "created", at: item.created_at, title: "Sent to the Plato extension", tone: "neutral", notes: [] }
  const step = (s: string) => ({ title: stateStep(s).label, tone: stateStep(s).tone })
  if (item.history.length) return [start, ...item.history.map((h, i) => ({ key: `${h.at}-${i}`, at: h.at, ...step(h.to), notes: notes(h) }))]
  // Older items kept only the latest change: show where it ended up.
  const last = item.last
  const end: Step = { key: "now", at: last?.at ?? item.updated_at, ...step(item.state), notes: last ? notes(last) : [] }
  if (item.state === "VERIFY" && item.verify_reason && !end.notes.length) end.notes.push(reasonText(item.verify_reason))
  return item.state === "PENDING" ? [start] : [start, end]
}

function legacySteps(app: ApplicationDetail): Step[] {
  return app.events.map((e, i) => ({
    key: `${e.at}-${i}`,
    at: e.at,
    title: e.message,
    tone: e.step === "failed" ? "danger" : e.step === "submitted" ? "success" : e.step === "human_check" || e.step === "needs_input" ? "warning" : "neutral",
    notes: [],
  }))
}

export const stepsOf = (app: ApplicationDetail) => (isExtension(app) ? extensionSteps(app) : legacySteps(app))

export function StepsCard({ app }: { app: ApplicationDetail }) {
  const ext = isExtension(app)
  const steps = stepsOf(app)
  const partial = ext && !!app.batch_item && !app.batch_item.history.length && steps.length > 1
  return (
    <Card title="Steps" icon={Route} index={1} tour="application-steps" aside={steps.length > 0 && <span className="type-meta text-text-tertiary tabular-nums"><CountUp value={steps.length} /></span>}>
      {steps.length === 0 ? (
        <EmptyState
          icon={Route}
          title={app.status === "QUEUED" ? "Not started yet" : "No steps were recorded"}
          hint={app.status === "QUEUED" ? "Each step shows here as it happens." : ext ? "This application was made before Plato kept the extension's steps." : "Plato didn't record steps for this attempt."}
        />
      ) : (
        <ol className="flex flex-col">
          {steps.map((s, i) => {
            const latest = i === steps.length - 1
            const showDay = i === 0 || !sameDay(steps[i - 1].at, s.at)
            return (
              <li key={s.key} style={{ animationDelay: `${120 + Math.min(i, 12) * 60}ms` }} className="relative flex gap-3 pb-4 animate-in fade-in-0 slide-in-from-left-1 fill-mode-both duration-300 last:pb-0 motion-reduce:animate-none">
                {!latest && <span aria-hidden className="absolute top-3.5 bottom-0 left-[4.5px] w-px bg-divider" />}
                <span aria-hidden className={cn("relative mt-[5px] size-2.5 shrink-0 rounded-full", DOT[s.tone], latest && "ring-4 ring-muted animate-in zoom-in-50 fill-mode-both delay-300 duration-300")} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className={cn("min-w-0 text-sm break-words", latest ? "font-semibold text-foreground" : "text-text-secondary")}>
                      {s.title}
                      {latest && <span className="type-meta ml-2 font-normal text-text-tertiary">Latest</span>}
                    </p>
                    <time dateTime={s.at} className="type-meta shrink-0 text-text-tertiary tabular-nums">
                      {showDay ? dayTime(s.at) : time(s.at)}
                    </time>
                  </div>
                  {s.notes.map((n) => (
                    <p key={n} className="type-meta break-words text-text-secondary">
                      {n}
                    </p>
                  ))}
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {partial && <p className="type-meta text-text-tertiary">Only the latest step was kept for this one. Newer applications show every step.</p>}
    </Card>
  )
}

// ---- What was sent: confirmation, resume, answers --------------------------

const SKILL = "resume_skill:"
function answerRows(app: ApplicationDetail): { label: string; value: string | null }[] {
  const sent = app.evidence?.sent ?? []
  if (sent.length) return sent.map((r) => ({ label: r.label, value: showValue(r.value) }))
  const answers = app.answers ?? {}
  const questions = app.needs_input?.questions ?? []
  const rows = questions.map((q) => ({ label: q.label, value: answers[q.id] !== undefined ? showValue(answers[q.id]) : null }))
  const asked = new Set(questions.map((q) => q.id))
  for (const [k, v] of Object.entries(answers)) {
    if (asked.has(k) || k.startsWith("__")) continue
    if (k.startsWith(SKILL)) rows.push({ label: `Real experience with ${k.slice(SKILL.length)}?`, value: showValue(v) })
    else if (k === "resume_policy") rows.push({ label: "If some skills are missing", value: showValue(v) })
  }
  return rows
}

function Sub({ title, tip, aside, children, tour }: { title: string; tip?: { label: string; text: string }; aside?: ReactNode; children: ReactNode; tour?: string }) {
  return (
    <div data-tour={tour} className="flex min-w-0 flex-col gap-3 border-t border-divider pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="type-card-title flex items-center gap-1.5 text-foreground">
          {title}
          {tip && <InfoTip label={tip.label} text={tip.text} />}
        </h3>
        {aside}
      </div>
      {children}
    </div>
  )
}

function Confirmation({ app }: { app: ApplicationDetail }) {
  const ev = app.evidence
  const sent = app.status === "SUBMITTED" && !ev?.dryRun
  const failed = app.status === "FAILED" || app.status === "EXPIRED" || app.status === "SKIPPED"
  const verify = isVerifySubmission(app)
  const confirmation = ev?.confirmation ?? (ev?.marker ? `“${ev.marker}”` : null)
  const how = ev?.manual ? "You marked it as submitted." : ev?.confirmed_by === "user_attestation" ? "You confirmed you pressed Submit." : ev?.confirmed_by === "page_marker" ? "The employer's page showed a confirmation." : null
  // The row's error, else the step that failed (older rows kept it only there).
  const why = app.error ?? app.events.findLast((e) => e.step === "failed")?.message ?? app.batch_item?.last?.message ?? null

  let line: { tone: Tone; title: string; body: string | null }
  if (failed) line = { tone: app.status === "FAILED" ? "danger" : "neutral", title: app.status === "SKIPPED" ? "Not sent: skipped" : "Not sent", body: why ?? (app.status === "EXPIRED" ? "The employer closed this posting before it could be sent." : "No reason was recorded.") }
  else if (verify) line = { tone: "warning", title: "Not sure it was sent", body: "No confirmation page was seen after the form was filled, so it may or may not have reached the employer." }
  else if (sent) line = { tone: "success", title: how ?? "Sent to the employer", body: confirmation }
  else line = { tone: "neutral", title: ev?.dryRun ? "Prepared, not sent" : "Nothing sent yet", body: ev?.dryRun ? "Plato filled the form and stopped before Submit." : "When the application goes out, its confirmation shows here." }

  return (
    <Sub title="Confirmation" tour="application-confirmation" tip={{ label: "How Plato knows it was sent", text: "Plato counts an application as sent only when the employer's page shows a confirmation, or when you confirm you pressed Submit yourself." }}>
      <div className="flex gap-3">
        <Dot tone={line.tone} className="mt-[7px]" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium text-foreground">
            {line.title}
            {failed && app.failure_kind ? <span className="font-normal text-text-tertiary"> · {failureLabel(app.failure_kind)}</span> : null}
          </p>
          {line.body && <p className="text-sm break-words text-text-secondary">{line.body}</p>}
          {sent && ev?.at && <p className="type-meta text-text-tertiary">{dayTime(ev.at)}</p>}
          {failed && ev?.indicators && ev.indicators.length > 0 && <p className="type-meta text-text-tertiary">What the page showed: {ev.indicators.join(", ")}</p>}
        </div>
      </div>
    </Sub>
  )
}

const hostOf = (u: string | null | undefined) => {
  try {
    return u ? new URL(u).host.replace(/^www\./, "") : null
  } catch {
    return null
  }
}

// The screenshot taken after the form was sent (or of the page when it failed).
// Private: fetched with the signed-in client as a blob, shown via an object URL.
function Proof({ app }: { app: ApplicationDetail }) {
  const ev = app.evidence
  const key = ev?.screenshotKey ?? null
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!key) return
    let alive = true
    let made: string | null = null
    getApplicationScreenshot(app.id)
      .then((u) => {
        made = u
        if (alive) setUrl(u)
        else URL.revokeObjectURL(u)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [app.id, key])

  const title = ev?.failed ? "What the page looked like" : ev?.dryRun ? "Preview of the filled form" : "Proof of apply"
  const tip = { label: "What this screenshot is", text: "A screenshot Plato saved of the employer's page at the end of the attempt, as your record of what happened. It's private to your account." }
  if (!key)
    return (
      <Sub title="Proof of apply" tip={tip} tour="application-proof">
        <EmptyState icon={Camera} title="No screenshot for this one" hint="Plato saves a screenshot of the confirmation page for new applications." />
      </Sub>
    )
  const host = hostOf(ev?.proofUrl)
  const at = ev?.proofCapturedAt ?? ev?.at ?? null
  const fileName = `plato-proof-${app.job.company.replace(/\W+/g, "-").toLowerCase()}.png`
  return (
    <Sub
      title={title}
      tip={tip}
      tour="application-proof"
      aside={
        url && (
          <a href={url} download={fileName} className="type-meta inline-flex items-center gap-1 font-medium text-primary transition-colors duration-200 hover:text-primary-hover">
            <Download className="size-3.5" />
            Download
          </a>
        )
      }
    >
      {failed ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <ImageOff className="size-4" />
          The screenshot could not be loaded.
        </p>
      ) : url ? (
        <a href={url} target="_blank" rel="noreferrer" aria-label={`${title}: open full size`} className="group relative block overflow-hidden rounded-lg border border-border bg-muted transition-[border-color,box-shadow] duration-200 hover:border-primary-line hover:shadow-[var(--shadow-lift)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- private blob URL, not optimisable */}
          <img src={url} alt={title} className="max-h-80 w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.01] motion-reduce:transition-none" />
          <span className="type-meta absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 font-medium text-foreground opacity-90 transition-[opacity,color] duration-200 group-hover:text-primary group-hover:opacity-100">
            <Maximize2 className="size-3.5" />
            Full size
          </span>
        </a>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-lg border border-border bg-muted text-text-tertiary">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}
      {(host || at) && (
        <p className="type-meta text-text-tertiary">
          {host && <>Taken on {host}</>}
          {host && at && " · "}
          {at && dayTime(at)}
        </p>
      )}
    </Sub>
  )
}

function Resume({ app }: { app: ApplicationDetail }) {
  const [busy, setBusy] = useState<"open" | "download" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ext = isExtension(app)
  const choice = app.batch_item?.resume_choice ?? null
  const tailored = ext ? choice === "tailored" : !!app.resume_key
  const known = ext ? choice !== null : app.status !== "QUEUED" || !!app.resume_key
  const canOpen = !!app.has_tailored_resume || !!app.resume_key
  const strategy = app.resume_strategy
  const failedChecks = strategy?.checks.filter((c) => !c.ok) ?? []
  // A skipped or failed application that never chose a resume isn't "not chosen yet".
  const ended = app.status === "FAILED" || app.status === "EXPIRED" || app.status === "SKIPPED"

  async function open(kind: "open" | "download") {
    setBusy(kind)
    setError(null)
    // Opened before the request so the browser doesn't block it as a popup.
    const tab = kind === "open" ? window.open("", "_blank") : null
    try {
      const url = await getApplicationResume(app.id)
      if (tab) tab.location.href = url
      else Object.assign(document.createElement("a"), { href: url, download: `resume-${app.job.company.replace(/\W+/g, "-").toLowerCase()}.pdf` }).click()
    } catch (e) {
      tab?.close()
      setError(e instanceof Error ? e.message : "Could not open the resume")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sub title="Resume used" tour="application-resume" aside={known && <MetaChip>{tailored ? "Tailored" : "Original"}</MetaChip>}>
      {!known ? (
        <p className="text-sm text-text-secondary">{app.status === "SUBMITTED" ? "Plato didn't record which resume went with this one." : ended ? "None. This one ended before a resume was chosen." : ext ? "Not chosen yet. The extension asks which resume to use when it starts." : "Plato picks the resume when it applies."}</p>
      ) : (
        <>
          <p className="text-sm text-text-secondary">{tailored ? "A resume Plato wrote from your profile for this posting." : "The resume on your profile, as you uploaded it."}</p>
          {canOpen && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void open("open")}>
                {busy === "open" ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />}
                Open
              </Button>
              <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void open("download")}>
                {busy === "download" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                Download PDF
              </Button>
            </div>
          )}
          {tailored && !canOpen && <p className="type-meta text-text-tertiary">This copy wasn&apos;t kept, so it can&apos;t be opened here.</p>}
          {error && <p className="type-meta text-destructive">{error}</p>}
          {strategy && (strategy.reasons.length > 0 || strategy.checks.length > 0) && (
            <ul className="flex flex-col gap-1.5">
              {strategy.reasons.slice(0, 4).map((r) => (
                <li key={r} className="type-meta flex gap-2 text-text-secondary">
                  <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-text-tertiary" />
                  {r}
                </li>
              ))}
              {strategy.checks.length > 0 && (
                <li className="type-meta flex items-center gap-2 text-text-secondary">
                  <Dot tone={failedChecks.length ? "warning" : "success"} className="size-1.5" />
                  {strategy.checks.length - failedChecks.length} of {strategy.checks.length} quality checks passed
                  {failedChecks.length > 0 && `: ${failedChecks.map((c) => humanize(c.name) + (c.detail ? ` (${c.detail})` : "")).join(", ")}`}
                  <InfoTip label="What the quality checks are" text="Plato reads the finished PDF back like an applicant tracking system would: your name, email, companies and section headings must come through in order, and it must fit the page limit." />
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </Sub>
  )
}

function Answers({ app }: { app: ApplicationDetail }) {
  const rows = answerRows(app)
  const waiting = rows.filter((r) => r.value === null).length
  return (
    <Sub title="Answers filled in" tour="application-answers" aside={rows.length > 0 && <span className="type-meta text-text-tertiary tabular-nums"><CountUp value={rows.length} /></span>}>
      {rows.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title={app.evidence?.manual ? "You submitted this one yourself" : "No answers recorded"}
          hint={isExtension(app) ? "The extension fills the form in your browser from your profile and saved answers. Those live on your profile, not per application." : app.status === "QUEUED" ? "Plato prepares the answers when it applies." : "Plato didn't get as far as preparing answers."}
        />
      ) : (
        <>
          {waiting > 0 && <p className="type-meta text-text-secondary">{waiting === 1 ? "1 question is" : `${waiting} questions are`} waiting for your answer.</p>}
          <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
            {rows.map((r, i) => (
              <Fact key={`${r.label}-${i}`} label={r.label}>
                {r.value === null ? <span className="text-text-tertiary">Not answered yet</span> : <span className="whitespace-pre-line">{r.value}</span>}
              </Fact>
            ))}
          </dl>
        </>
      )}
    </Sub>
  )
}

export function SentCard({ app }: { app: ApplicationDetail }) {
  return (
    <Card title={app.status === "SUBMITTED" ? "What was sent" : "What Plato prepared"} icon={PackageCheck} index={2} tour="application-sent" className="gap-5">
      <Confirmation app={app} />
      <Proof app={app} />
      <Resume app={app} />
      <Answers app={app} />
    </Card>
  )
}

// ---- The job ----------------------------------------------------------------

const REMOTE: Record<string, string | null> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On site", UNKNOWN: null }
const money = (n: number, c: string | null) => {
  try {
    return new Intl.NumberFormat([], { style: "currency", currency: c ?? "USD", maximumFractionDigits: 0 }).format(n)
  } catch {
    return `${n.toLocaleString()} ${c ?? ""}`.trim()
  }
}
const salaryOf = (j: ApplicationDetail["job"]) =>
  j.salary_min && j.salary_max && j.salary_min !== j.salary_max ? `${money(j.salary_min, j.salary_currency)} – ${money(j.salary_max, j.salary_currency)}` : j.salary_max || j.salary_min ? money((j.salary_max || j.salary_min) as number, j.salary_currency) : null
const sourceName = (s: string | null | undefined) => (s ? ((SOURCE_LABEL as Record<string, string>)[s] ?? humanize(s)) : null)

export function JobCard({ app }: { app: ApplicationDetail }) {
  const j = app.job
  const site = j.effective_ats_source && j.effective_ats_source !== j.source ? sourceName(j.effective_ats_source) : null
  const facts = (
    [
      ["Location", j.location],
      ["Work setup", REMOTE[j.remote_type] ?? null],
      ["Job type", j.job_type ? humanize(j.job_type) : null],
      ["Salary", salaryOf(j)],
      ["Posted", j.posted_at ? new Date(j.posted_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : null],
      ["Found on", sourceName(j.source)],
      ["Application site", site ?? (app.batch_item?.provider ? humanize(app.batch_item.provider) : null)],
    ] as [string, string | null][]
  ).filter((f): f is [string, string] => !!f[1])
  return (
    <Card title="The job" icon={Briefcase} index={1} tour="application-job">
      <div className="flex flex-col gap-0.5">
        <p className="type-card-title text-foreground">{j.title}</p>
        <p className="text-sm text-text-secondary">{j.company}</p>
      </div>
      {facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {facts.map(([k, v]) => (
            <Fact key={k} label={k}>
              {v}
            </Fact>
          ))}
        </dl>
      )}
      {app.match && (
        <div className="flex flex-col gap-2 border-t border-divider pt-4">
          <p className="text-sm text-foreground">
            <span className="font-semibold tabular-nums"><CountUp value={`${Math.round(app.match.percent)}%`} /> match</span>
            <span className="text-text-tertiary"> · {app.match.label}</span>
            <InfoTip className="ml-1.5" label="What match % means" text="How closely this posting fits your target roles and skills, scaled against your own best matches (your top 10% read as 100%). 90% and up is an excellent match, 75% and up a strong one." />
          </p>
          {app.match.reasons.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="type-meta text-text-secondary">The posting mentions your</p>
              <div className="flex flex-wrap gap-1.5">
                {app.match.reasons.map((r) => (
                  <MetaChip key={r}>{r}</MetaChip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-divider pt-4">
        <a href={j.apply_url ?? j.url} target="_blank" rel="noreferrer" className="group/link inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors duration-200 hover:text-primary-hover">
          Open the posting <ExternalLink className="size-3.5 transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
        </a>
        {app.thread && (
          <Link href={threadHref(app.thread.id)} className="group/link inline-flex min-w-0 items-center gap-1 text-sm font-medium text-primary transition-colors duration-200 hover:text-primary-hover">
            <span className="truncate">{app.thread.title ? `From “${app.thread.title}”` : "From your search"}</span>
            <ArrowRight className="size-3.5 shrink-0 transition-transform group-hover/link:translate-x-0.5" />
          </Link>
        )}
      </div>
    </Card>
  )
}

// ---- Outcome and details ------------------------------------------------------

export function OutcomeCard({ app, onChange }: { app: ApplicationDetail; onChange: (o: ApplicationOutcome | null) => void }) {
  if (app.status !== "SUBMITTED" || app.evidence?.dryRun) return null
  const e = enter(2)
  return (
    <section id="outcome" data-tour="application-outcome" style={e.style} className={cn(CARD, "scroll-mt-20 p-5", e.className)}>
      <OutcomePicker id={app.id} value={app.outcome ?? null} onChange={onChange} />
      {app.outcome_at && <p className="type-meta mt-2 text-text-tertiary">Marked {dayTime(app.outcome_at)}</p>}
    </section>
  )
}

export function DetailsCard({ app }: { app: ApplicationDetail }) {
  const ext = isExtension(app)
  const steps = stepsOf(app)
  const started = ext ? (app.batch_item?.history[0]?.at ?? null) : (steps[0]?.at ?? null)
  const rows = (
    [
      ["Applied by", ext ? "The Plato extension, in your browser" : "Plato"],
      ["Queued", dayTime(app.created_at)],
      ["Started", started && dayTime(started)],
      ["Sent", app.submitted_at && dayTime(app.submitted_at)],
      ["Last update", dayTime(app.batch_item?.updated_at ?? app.updated_at)],
      ["Attempts", !ext && app.attempts > 0 ? String(app.attempts) : null],
      ["Reference", app.id],
    ] as [string, string | null][]
  ).filter((r): r is [string, string] => !!r[1])
  const e = enter(3)
  return (
    <section data-tour="application-details" style={e.style} className={cn(CARD, "p-5", e.className)}>
      <h2 className="type-meta mb-3 flex items-center gap-1.5 font-semibold text-text-secondary">
        <Info className="size-3.5 text-warning" />
        Details
      </h2>
      <dl className="flex flex-col gap-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4">
            <dt className="type-meta flex shrink-0 items-center gap-1.5 text-text-tertiary">
              {k}
              {k === "Attempts" && <InfoTip label="What attempts counts" text="How many times Plato has tried to fill and send this application. Pauses for your answers or a human check don't count." />}
            </dt>
            <dd className={cn("type-meta min-w-0 text-right break-all text-text-secondary", k === "Reference" && "font-mono text-[11.5px]")}>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
