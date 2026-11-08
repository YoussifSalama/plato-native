"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react"
import { cn } from "cn"
import { PAGE } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { ExtensionApplyModal } from "@/components/extension-apply-modal"
import { MonoTile, PlatoNote, StatusPill } from "@/components/plato-ui"
import { TokenCost } from "@/components/plato-tokens"
import { openPlato } from "@/components/app-shell"
import { approveResume, getCareerResume, resumeForJob, type JobResume, type ResumeChange } from "@/lib/career/api"

// Review your tailored resumes (owner screen 07). Plato writes one resume per job, one at a
// time, and shows only what changed from the seeker's own profile. Nothing is sent until
// "Approve all & apply"; each job then uploads the resume approved here, or their own CV.
type Row = { jobId: string; state: "waiting" | "writing" | "done" | "error"; resume?: JobResume; error?: string; useOriginal?: boolean }
const SECTION: Record<ResumeChange["section"], string> = { summary: "Summary", experience: "Experience order", keywords: "Keywords from the job post" }

function ReviewContent() {
  const router = useRouter()
  const raw = useSearchParams().get("ids") ?? ""
  const ids = useMemo(() => raw.split(",").filter((x) => /^[0-9a-f]{24}$/.test(x)).slice(0, 10), [raw])
  const [rows, setRows] = useState<Row[]>(() => ids.map((jobId) => ({ jobId, state: "waiting" })))
  const [pick, setPick] = useState(0)
  const [skills, setSkills] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [apply, setApply] = useState<{ jobIds: string[]; resumes: Record<string, "profile" | "tailored"> } | null>(null)
  const started = useRef(false)

  const patch = (jobId: string, p: Partial<Row>) => setRows((cur) => cur.map((r) => (r.jobId === jobId ? { ...r, ...p } : r)))
  async function write(jobId: string, opts: { confirmedSkills?: string[]; ignoreGaps?: boolean } = {}) {
    patch(jobId, { state: "writing", error: undefined })
    try {
      patch(jobId, { state: "done", resume: await resumeForJob(jobId, opts) })
    } catch (e) {
      patch(jobId, { state: "error", error: e instanceof Error ? e.message : "Could not write this resume" })
    }
  }
  // One at a time, in order: each resume is a real build.
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      for (const id of ids) await write(id)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const row = rows[pick]
  const r = row?.resume
  const label = (x: Row) => (x.resume ? x.resume.job : null)
  const approved = (x: Row) => x.useOriginal || (x.resume?.status === "built" && x.resume.approved)
  const ready = rows.filter((x) => x.resume?.status === "built" || x.useOriginal)
  const okCount = rows.filter(approved).length
  const writing = rows.filter((x) => x.state === "waiting" || x.state === "writing").length

  async function approve(x: Row) {
    if (x.resume?.status !== "built") return
    setBusy(x.jobId)
    try {
      await approveResume(x.resume.id)
      patch(x.jobId, { resume: { ...x.resume, approved: true }, useOriginal: false })
      const next = rows.findIndex((y, i) => i > pick && !approved(y))
      if (next >= 0) setPick(next)
    } finally {
      setBusy(null)
    }
  }
  async function approveAllAndApply() {
    setBusy("all")
    try {
      for (const x of ready) if (!x.useOriginal && x.resume?.status === "built" && !x.resume.approved) await approveResume(x.resume.id)
      setRows((cur) => cur.map((x) => (x.resume?.status === "built" && !x.useOriginal ? { ...x, resume: { ...x.resume, approved: true } } : x)))
      setApply({ jobIds: ready.map((x) => x.jobId), resumes: Object.fromEntries(ready.map((x) => [x.jobId, x.useOriginal ? "profile" : "tailored"])) })
    } finally {
      setBusy(null)
    }
  }
  async function viewPdf(id: string) {
    const blob = await getCareerResume(id)
    window.open(URL.createObjectURL(blob), "_blank", "noopener")
  }

  if (!ids.length)
    return (
      <div className={PAGE}>
        <Link href="/jobs" className="flex items-center gap-1.5 text-sm font-semibold text-primary">
          <ArrowLeft className="size-4" />
          Back to jobs
        </Link>
        <PlatoNote variant="headline">Pick jobs on the Jobs page and press “Tailor & apply”. Plato writes one resume per job and shows you what changed.</PlatoNote>
      </div>
    )

  return (
    <div className={PAGE}>
      <header data-tour="page-header" className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[260px] flex-1">
          <Link href="/jobs" className="mb-1 flex w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            <ArrowLeft className="size-4" />
            Back to jobs
          </Link>
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">Review your tailored resumes</h1>
          <p className="mt-1.5 text-[15px] text-text-secondary">
            Plato made one resume per job. You only see what changed from your profile.{" "}
            <TokenCost action="resume" suffix=" tokens per resume" className="text-text-tertiary" />
          </p>
        </div>
        <div className="flex min-w-[300px] flex-col gap-2">
          <div className="flex justify-end gap-2.5">
            <Button variant="outline" onClick={() => router.push("/jobs")} className="h-11 rounded-xl bg-card px-4">
              Save for later
            </Button>
            <Button data-ai="review.approve-all" onClick={() => void approveAllAndApply()} disabled={!ready.length || busy === "all"} className="h-11 gap-2 rounded-xl px-5">
              {busy === "all" && <Loader2 className="size-4 animate-spin" />}
              Approve all & apply ({ready.length})
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-divider">
              <span className="block h-full rounded-full bg-success transition-[width]" style={{ width: `${(okCount / rows.length) * 100}%` }} />
            </span>
            <b className="text-sm tabular-nums">
              {okCount} of {rows.length} approved
            </b>
          </div>
          {writing > 0 && <span className="text-right text-xs text-text-secondary">Writing {rows.length - writing + 1} of {rows.length}…</span>}
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <ul className="flex flex-col gap-1 rounded-[22px] border bg-card p-2">
          {rows.map((x, i) => {
            const j = label(x)
            return (
              <li key={x.jobId}>
                <button type="button" onClick={() => setPick(i)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors", i === pick ? "bg-primary-soft" : "hover:bg-primary-tint")}>
                  <MonoTile name={j?.company ?? "…"} size="sm" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14.5px]">{j?.title ?? `Job ${i + 1}`}</b>
                    <span className="block truncate text-xs text-text-secondary">{j?.company ?? "Waiting"}</span>
                  </span>
                  {approved(x) ? <StatusPill tone="success">{x.useOriginal ? "Original" : "Approved"}</StatusPill> : x.state === "writing" ? <Loader2 className="size-4 animate-spin text-primary" /> : x.state === "waiting" ? <span className="text-xs text-text-tertiary">In line</span> : x.state === "error" ? <StatusPill tone="danger">Failed</StatusPill> : x.resume?.status === "gaps" ? <StatusPill tone="warning">Needs you</StatusPill> : <StatusPill tone="warning">To review</StatusPill>}
                </button>
              </li>
            )
          })}
        </ul>

        <section className="flex min-w-0 flex-col gap-4 rounded-[22px] border bg-card p-5">
          {row && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <MonoTile name={r?.job.company ?? "…"} />
                <div>
                  <h2 className="text-xl font-bold tracking-tight">{r?.job.title ?? `Job ${pick + 1}`}</h2>
                  <p className="text-sm text-text-secondary">
                    {r?.job.company ?? "…"} · resume {pick + 1} of {rows.length}
                  </p>
                </div>
              </div>
              {r?.status === "built" && (
                <Button variant="outline" onClick={() => void viewPdf(r.id)} className="rounded-xl bg-card">
                  View full resume
                </Button>
              )}
            </div>
          )}

          {(row?.state === "waiting" || row?.state === "writing") && (
            <PlatoNote variant="inline" className="py-6">
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                {row.state === "writing" ? "Writing this resume from your profile and the job post…" : "In line. Plato writes one resume at a time."}
              </span>
            </PlatoNote>
          )}
          {row?.state === "error" && (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-destructive">{row.error}</p>
              <Button variant="outline" onClick={() => void write(row.jobId)} className="rounded-xl">
                Try again
              </Button>
            </div>
          )}

          {r?.status === "gaps" && !row.useOriginal && (
            <div className="flex flex-col gap-3">
              <PlatoNote label="Before Plato writes this one">This job asks for {r.gaps.join(", ")}, which your profile doesn&apos;t show. Tick what is true, so your resume never claims more than you&apos;ve done.</PlatoNote>
              <div className="flex flex-wrap gap-2">
                {r.gaps.map((g) => (
                  <label key={g} className={cn("flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm", skills.has(g) ? "border-primary bg-primary-soft text-primary" : "bg-card")}>
                    <input type="checkbox" className="size-4 accent-primary" checked={skills.has(g)} onChange={() => setSkills((s) => (s.has(g) ? new Set([...s].filter((x) => x !== g)) : new Set([...s, g])))} />
                    I have real experience with {g}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void write(row.jobId, { confirmedSkills: r.gaps.filter((g) => skills.has(g)), ignoreGaps: true })} className="rounded-xl">
                  Write the resume
                </Button>
                <Button variant="outline" onClick={() => patch(row.jobId, { useOriginal: true })} className="rounded-xl bg-card">
                  Use my original resume
                </Button>
              </div>
            </div>
          )}

          {r?.status === "built" && (
            <>
              <p className="eyebrow">What Plato changed · {r.changes.length}</p>
              {r.changes.length === 0 && <p className="text-sm text-text-secondary">Your profile already fits this job: Plato kept it as it is, in the layout this market expects.</p>}
              {r.changes.map((c) => (
                <div key={c.section} className="flex flex-col gap-2 rounded-xl border p-3.5">
                  <b className="text-sm">{SECTION[c.section]}</b>
                  {c.before && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive line-through">{c.before}</p>}
                  <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success-ink">{c.after}</p>
                </div>
              ))}
            </>
          )}

          {row && (r?.status === "built" || row.useOriginal) && (
            <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-4">
              {r?.status === "built" && (
                <Button data-ai="review.approve" onClick={() => void approve(row)} disabled={busy === row.jobId} variant={r.approved && !row.useOriginal ? "default" : "outline"} className={cn("gap-1.5 rounded-xl", !(r.approved && !row.useOriginal) && "bg-card")}>
                  {r.approved && !row.useOriginal ? (
                    <>
                      Approved <Check className="size-4" />
                    </>
                  ) : (
                    "Approve"
                  )}
                </Button>
              )}
              {r?.status === "built" && (
                <Button variant="outline" onClick={() => openPlato(`Edit my resume for ${r.job.title} at ${r.job.company}: `)} className="rounded-xl bg-card">
                  Edit
                </Button>
              )}
              <Button variant="outline" onClick={() => patch(row.jobId, { useOriginal: !row.useOriginal })} aria-pressed={!!row.useOriginal} className={cn("rounded-xl", row.useOriginal ? "border-primary-line bg-primary-soft text-primary" : "bg-card")}>
                Use my original resume
              </Button>
              {pick < rows.length - 1 && (
                <button type="button" onClick={() => setPick(pick + 1)} className="ml-auto flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  Next resume <ArrowRight className="size-4" />
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <ExtensionApplyModal open={!!apply} count={apply?.jobIds.length ?? 0} req={{ jobIds: apply?.jobIds ?? [], resumes: apply?.resumes }} onClose={() => (setApply(null), router.push("/applications"))} />
    </div>
  )
}

export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewContent />
    </Suspense>
  )
}
