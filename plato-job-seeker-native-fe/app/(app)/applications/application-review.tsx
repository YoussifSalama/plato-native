"use client"

import { useState } from "react"
import Link from "next/link"
import { ExternalLink, Loader2 } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { PlatoMark } from "@/components/plato-orb"
import { continueApplication, markApplicationSubmitted, submitApplicationAnswers, type AnswerValue, type JobApplication, type PendingQuestion } from "@/lib/jobs/api"

const pill = (on: boolean) =>
  cn("rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", on ? "border-primary bg-primary-soft text-primary" : "border-border text-text-secondary hover:bg-muted")

function QuestionField({ q, value, onChange }: { q: PendingQuestion; value: AnswerValue | undefined; onChange: (v: AnswerValue) => void }) {
  if (q.type === "boolean")
    return (
      <div className="flex gap-2">
        {[true, false].map((b) => (
          <button key={String(b)} type="button" onClick={() => onChange(b)} className={pill(value === b)}>
            {b ? "Yes" : "No"}
          </button>
        ))}
      </div>
    )
  if (q.type === "choice" || q.type === "multi") {
    const picked = Array.isArray(value) ? value : typeof value === "string" ? [value] : []
    return (
      <div className="flex flex-wrap gap-2">
        {(q.options ?? []).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(q.type === "choice" ? o : picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o])}
            className={pill(picked.includes(o))}
          >
            {o}
          </button>
        ))}
      </div>
    )
  }
  const text = typeof value === "string" ? value : ""
  if (q.type === "number") return <Input type="number" inputMode="decimal" min={0} value={text} onChange={(e) => onChange(e.target.value)} className="h-10 max-w-48 text-sm" placeholder="One number" />
  if (q.type === "date") return <Input type="date" value={text} onChange={(e) => onChange(e.target.value)} className="h-10 max-w-48 text-sm" />
  if (q.type === "url") return <Input type="url" value={text} onChange={(e) => onChange(e.target.value)} className="h-10 text-sm" placeholder="https://" />
  return q.type === "paragraph" ? (
    <Textarea value={text} onChange={(e) => onChange(e.target.value)} className="min-h-24 text-sm" />
  ) : (
    <Input value={text} maxLength={q.maxLength} onChange={(e) => onChange(e.target.value)} className="h-10 text-sm" />
  )
}

// What Plato needs from the seeker before it can send this application:
// either answers to the employer's questions (drafts prefilled, every one
// editable), or a manual submit when the site demands a human.
function ApplicationReview({ app, live = false, onDone }: { app: JobApplication; live?: boolean; onDone: (next?: JobApplication) => void }) {
  const needs = app.needs_input
  const [values, setValues] = useState<Record<string, AnswerValue>>(() => Object.fromEntries((needs?.questions ?? []).filter((q) => q.draft !== undefined).map((q) => [q.id, q.draft as AnswerValue])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  if (!needs) return null

  const unanswered = needs.questions.filter((q) => q.required && (values[q.id] === undefined || values[q.id] === "" || (Array.isArray(values[q.id]) && !(values[q.id] as string[]).length)))

  async function run(action: () => Promise<JobApplication>) {
    setBusy(true)
    setError(null)
    try {
      onDone(await action())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-4 rounded-lg border border-warning/25 bg-warning-soft/40 p-4">
      <div className="flex items-start gap-3">
        <PlatoMark size={28} />
        <p className="text-sm text-foreground">{needs.message}</p>
      </div>

      {needs.reason === "profile" ? (
        // Asked once for every job, not per application: fix it at the source.
        <Link href="/onboarding?step=3" className="inline-flex h-9 w-fit items-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground">
          Complete my application details
        </Link>
      ) : app.status === "NEEDS_USER_VERIFICATION" ? (
        // A person completes the check; Plato never does. It watches the
        // window and carries on by itself, or reopens it on Continue.
        <div className="flex flex-col gap-2">
          {live && (
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="relative flex size-2.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-warning/60" />
                <span className="relative size-2.5 rounded-full bg-warning" />
              </span>
              The application window is open and waiting for you.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                setError(null)
                continueApplication(app.id)
                  .then((r) => {
                    setNote(r.message)
                    onDone()
                  })
                  .catch((e) => setError(e instanceof Error ? e.message : "Something went wrong"))
                  .finally(() => setBusy(false))
              }}
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {live ? "I completed it, continue" : "Continue"}
            </Button>
            <a href={app.job.apply_url ?? app.job.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted">
              Open the posting <ExternalLink className="size-3.5" />
            </a>
            {!live && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => markApplicationSubmitted(app.id))}>
                I submitted it myself
              </Button>
            )}
          </div>
          {note && <p className="text-xs text-text-secondary">{note}</p>}
          <p className="text-xs text-text-tertiary">Plato never solves or bypasses these checks. It only marks this as applied after the site confirms it received the application.</p>
        </div>
      ) : needs.reason !== "questions" && needs.reason !== "resume" ? (
        <div className="flex flex-wrap items-center gap-2">
          <a href={app.job.apply_url ?? app.job.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground">
            Open the posting <ExternalLink className="size-3.5" />
          </a>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => markApplicationSubmitted(app.id))}>
            I submitted it
          </Button>
        </div>
      ) : (
        <>
          <ol className="flex flex-col gap-4">
            {needs.questions.map((q) => (
              <li key={q.id} className="flex flex-col gap-1.5">
                <span className="text-sm font-medium whitespace-pre-line text-foreground">
                  {q.label}
                  {q.required && <span className="text-destructive"> *</span>}
                </span>
                <QuestionField q={q} value={values[q.id]} onChange={(v) => setValues((prev) => ({ ...prev, [q.id]: v }))} />
                <span className="text-xs text-text-tertiary">
                  {needs.reason === "resume"
                    ? "Only skills you confirm go on the resume Plato writes for this job."
                    : q.sensitive
                    ? "Personal. Plato never guesses this. If you'd rather not answer, remove this application instead."
                    : q.draft !== undefined
                      ? "Drafted by Plato from your profile — edit it so it's true and in your words."
                      : "Plato doesn't know this yet. Answer once and it's remembered for every employer."}
                </span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={busy || unanswered.length > 0} onClick={() => void run(() => submitApplicationAnswers(app.id, values))}>
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              Save and apply
            </Button>
            <span className="text-xs text-text-secondary">{unanswered.length ? `${unanswered.length} required answer(s) left` : "Plato remembers these for the next employer who asks."}</span>
          </div>
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

export { ApplicationReview }
