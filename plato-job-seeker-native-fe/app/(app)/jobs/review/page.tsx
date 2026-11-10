"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react"
import { cn } from "cn"
import { PAGE } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FilterChip } from "@/components/filter-controls"
import { ExtensionApplyModal } from "@/components/extension-apply-modal"
import { InfoTip } from "@/components/info-tip"
import { MonoTile, PlatoNote, StatusPill } from "@/components/plato-ui"
import { TokenCost } from "@/components/plato-tokens"
import { openPlato } from "@/components/app-shell"
import { approveResume, BAND_LABEL, getCareerResume, resumeForJob, type JobResume, type ResumeChange } from "@/lib/career/api"

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
  // Names handed over by the Jobs page, so jobs still in line show what they are.
  const [known, setKnown] = useState<Record<string, { title: string; company: string }>>({})
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only handover; the server can't read it
      setKnown(JSON.parse(sessionStorage.getItem("plato.review.jobs") ?? "{}"))
    } catch {}
  }, [])
  const label = (x: Row) => (x.resume ? x.resume.job : (known[x.jobId] ?? null))
  const approved = (x: Row) => x.useOriginal || (x.resume?.status === "built" && x.resume.approved)
  // A resume that fits the job poorly (match below 65) is never sent by "Approve all":
  // the seeker approves it on its own, or uses their original.
  const held = (x: Row) => !x.useOriginal && x.resume?.status === "built" && !x.resume.approved && x.resume.score?.decision === "hold"
  const ready = rows.filter((x) => (x.resume?.status === "built" || x.useOriginal) && !held(x))
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
      <div className={PAGE} data-tour-state="review.empty">
        <Link href="/jobs" data-tour="review-back" className="group flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors duration-200 hover:text-primary-hover">
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          Back to jobs
        </Link>
        <PlatoNote variant="headline">Pick jobs on the Jobs page and press “Tailor & apply”. Plato writes one resume per job and shows you what changed.</PlatoNote>
      </div>
    )

  // Which screen the page tour explains, by the resume on screen: being written, asking about skills, failed, or ready to approve.
  const screen = !row ? "review.writing" : r?.status === "built" || row.useOriginal ? "review.ready" : r?.status === "gaps" ? "review.gaps" : row.state === "error" ? "review.error" : "review.writing"

  return (
    <div className={PAGE} data-tour-state={screen}>
      <header data-tour="page-header" className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[260px] flex-1">
          <Link href="/jobs" className="group mb-2 flex w-fit items-center gap-1.5 text-[13px] font-semibold text-primary transition-colors duration-200 hover:text-primary-hover">
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
            Back to jobs
          </Link>
          <h1 className="type-page-title">Review your tailored resumes</h1>
          <p className="mt-1.5 text-[15px] text-text-secondary">
            One resume per job. You only see what changed from your master resume. <TokenCost action="resume" suffix=" tokens per resume" className="text-text-tertiary" />
            <InfoTip className="ml-1" text="Writing each resume spends Plato tokens from your balance. Approving one, or using your original resume, costs nothing." label="What tailoring costs" />
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[340px]">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={() => router.push("/jobs")}>
              Save for later
            </Button>
            <Button data-ai="review.approve-all" onClick={() => void approveAllAndApply()} disabled={!ready.length || busy === "all"} className="gap-2">
              {busy === "all" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Approve all & apply
              {ready.length > 0 && <span className="rounded-full bg-white/20 px-1.5 text-xs tabular-nums">{ready.length}</span>}
            </Button>
            <InfoTip text="Approves every written resume, except weak fits under 65/100, and adds those jobs to your browser extension's queue, each with the resume you approved here or your original." label="What Approve all & apply does" side="bottom" />
          </div>
          {/* One progress line: approved (green) and written (cobalt) out of the batch. */}
          <div data-tour="review-progress" className="flex flex-col gap-1.5">
            <span className="relative h-1.5 overflow-hidden rounded-full bg-divider">
              <span className="absolute inset-y-0 left-0 rounded-full bg-primary/25 transition-[width] duration-500" style={{ width: `${((rows.length - writing) / rows.length) * 100}%` }} />
              <span className="absolute inset-y-0 left-0 rounded-full bg-success transition-[width] duration-500" style={{ width: `${(okCount / rows.length) * 100}%` }} />
            </span>
            <span className="flex justify-between text-xs text-text-secondary tabular-nums">
              <span>
                <b className="text-foreground">{okCount}</b> of {rows.length} approved
              </span>
              <span>{writing > 0 ? `Writing ${rows.length - writing + 1} of ${rows.length}…` : "All written"}</span>
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <ul data-tour="review-queue" className="flex flex-col gap-0.5 rounded-2xl border bg-card p-2 shadow-card lg:sticky lg:top-20">
          {rows.map((x, i) => {
            const j = label(x)
            return (
              <li key={x.jobId}>
                <button type="button" onClick={() => setPick(i)} aria-current={i === pick || undefined} className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors", i === pick ? "border-primary-line bg-primary-tint" : "border-transparent hover:bg-muted/60")}>
                  {j ? <MonoTile name={j.company} size="sm" /> : <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-semibold text-text-tertiary tabular-nums">{i + 1}</span>}
                  <span className="min-w-0 flex-1">
                    <b className={cn("block truncate text-sm font-semibold", !j && "text-text-secondary")}>{j?.title ?? `Job ${i + 1} of ${rows.length}`}</b>
                    <span className="block truncate text-xs text-text-tertiary">{j?.company ?? "Name shows once Plato starts it"}</span>
                  </span>
                  {approved(x) ? <StatusPill tone="success">{x.useOriginal ? "Original" : "Approved"}</StatusPill> : x.state === "writing" ? <Loader2 className="size-4 animate-spin text-primary" /> : x.state === "waiting" ? <span className="text-xs text-text-tertiary">Queued</span> : x.state === "error" ? <StatusPill tone="danger">Failed</StatusPill> : x.resume?.status === "gaps" ? <StatusPill tone="warning">Check skills</StatusPill> : <StatusPill tone="info">Ready to review</StatusPill>}
                </button>
              </li>
            )
          })}
        </ul>

        <section data-tour="review-detail" className="flex min-h-[420px] min-w-0 flex-col gap-5 rounded-2xl border bg-card p-5 shadow-card sm:p-6">
          {row && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <MonoTile name={r?.job.company ?? label(row)?.company ?? "…"} />
                <div>
                  <h2 className="type-section-title">{r?.job.title ?? label(row)?.title ?? `Job ${pick + 1}`}</h2>
                  <p className="text-sm text-text-secondary">
                    {r?.job.company ?? label(row)?.company ?? "Queued"} · resume {pick + 1} of {rows.length}
                    {r?.status === "built" && r.score && (
                      <span title={r.score.categories.map((c) => `${c.label} ${Math.round(c.score)}/${c.max}`).join(" · ")} className={cn("ml-2 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums", r.score.decision === "send" ? "bg-success-soft text-success-ink" : r.score.decision === "confirm" ? "bg-warning-soft text-warning-ink" : "bg-danger-soft text-destructive")}>
                        Match {r.score.score}/100 · {BAND_LABEL[r.score.band]}
                      </span>
                    )}
                    {r?.status === "built" && r.score && (
                      <InfoTip
                        className="ml-1"
                        text="How well this resume fits the job, scored by fixed rules: job keywords (50), job title (15), skills shown in your experience (15), recent experience (10) and resume quality (10). 75+ is a good fit; under 65 is held back from Approve all."
                        label="How the match score works"
                      />
                    )}
                  </p>
                </div>
              </div>
              {r?.status === "built" && (
                <Button variant="outline" onClick={() => void viewPdf(r.id)} className="bg-card">
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
            <div data-tour="review-error" className="flex flex-col items-start gap-3">
              <p className="text-sm text-destructive">{row.error}</p>
              <Button variant="outline" onClick={() => void write(row.jobId)} >
                Try again
              </Button>
            </div>
          )}

          {r?.status === "gaps" && !row.useOriginal && (
            <div data-tour="review-gaps" className="flex flex-col gap-3">
              <PlatoNote label="Before Plato writes this one">This job asks for {r.gaps.join(", ")}, which your profile doesn&apos;t show. Tick what is true, so your resume never claims more than you&apos;ve done.</PlatoNote>
              <div className="flex flex-wrap gap-2">
                {r.gaps.map((g) => (
                  <label key={g} className={cn("flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-colors", skills.has(g) ? "border-primary-line bg-primary-soft text-primary" : "bg-card hover:border-primary-line")}>
                    <Checkbox className="size-4" checked={skills.has(g)} onCheckedChange={() => setSkills((s) => (s.has(g) ? new Set([...s].filter((x) => x !== g)) : new Set([...s, g])))} />
                    I have real experience with {g}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void write(row.jobId, { confirmedSkills: r.gaps.filter((g) => skills.has(g)), ignoreGaps: true })} >
                  Write the resume
                </Button>
                <Button variant="outline" onClick={() => patch(row.jobId, { useOriginal: true })} className="bg-card">
                  Use my original resume
                </Button>
              </div>
            </div>
          )}

          {r?.status === "built" && r.score && r.score.decision !== "send" && !r.approved && (
            <PlatoNote variant="inline" className="rounded-xl border border-l-4 border-l-warning bg-card p-3 text-foreground">
              {r.score.decision === "hold" ? `A weak fit for this job (${r.score.score}/100), so “Approve all” leaves it out. Approve it yourself to send it anyway.` : `A fair fit (${r.score.score}/100). Check it before you approve.`}
              {r.score.topFixes[0] && ` ${r.score.topFixes[0]}`}
            </PlatoNote>
          )}
          {r?.status === "built" && (
            <>
              <p data-tour="review-changes" className="eyebrow">What Plato changed · {r.changes.length}</p>
              {r.changes.length === 0 && <p className="text-sm text-text-secondary">Your profile already fits this job: Plato kept it as it is, in the layout this market expects.</p>}
              {r.changes.map((c) => (
                <div key={c.section} className="flex flex-col gap-2.5 rounded-xl border p-4 transition-colors duration-200 hover:border-primary-line">
                  <b className="text-sm">{SECTION[c.section]}</b>
                  {c.before && (
                    <p className="flex gap-2.5 text-sm text-text-tertiary">
                      <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 text-[10.5px] font-semibold tracking-wide uppercase">Before</span>
                      <span className="line-through decoration-text-tertiary/50">{c.before}</span>
                    </p>
                  )}
                  <p className="flex gap-2.5 border-l-2 border-success pl-2.5 text-sm text-foreground">
                    <span className="mt-0.5 shrink-0 rounded bg-success-soft px-1.5 text-[10.5px] font-semibold tracking-wide text-success-ink uppercase">After</span>
                    <span>{c.after}</span>
                  </p>
                </div>
              ))}
            </>
          )}

          {row && (r?.status === "built" || row.useOriginal) && (
            <div data-tour="review-actions" className="flex flex-wrap items-center gap-2 border-t border-divider pt-4">
              {r?.status === "built" && (
                <Button data-ai="review.approve" onClick={() => void approve(row)} disabled={busy === row.jobId} variant={r.approved && !row.useOriginal ? "default" : "outline"} className={cn("gap-1.5", !(r.approved && !row.useOriginal) && "bg-card")}>
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
                <Button variant="outline" onClick={() => openPlato(`Edit my resume for ${r.job.title} at ${r.job.company}: `)} className="bg-card">
                  Edit
                </Button>
              )}
              <span data-tour="review-original" className="flex items-center gap-1">
                <FilterChip on={!!row.useOriginal} onClick={() => patch(row.jobId, { useOriginal: !row.useOriginal })} className="h-10">
                  Use my original resume
                </FilterChip>
                <InfoTip text="Sends this job the resume on your profile instead of the tailored one. It still counts as approved." label="What Use my original resume does" />
              </span>
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
