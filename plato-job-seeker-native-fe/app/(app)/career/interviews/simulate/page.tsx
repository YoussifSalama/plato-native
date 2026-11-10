"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, Check, Loader2 } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { MatchPill, MonoTile, PlatoNote, Segmented } from "@/components/plato-ui"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { jobQuestions } from "@/lib/career-hub/content"
import { invalidateCareerData, useCareerData } from "@/lib/career-hub/snapshot"
import { startInterview } from "@/lib/interviews/api"
import { InterviewSession } from "../interview-session"

type Source = "match" | "paste"
const STAGES = [
  { value: "screen", label: "Recruiter screen", body: "Motivation, fit and the basics" },
  { value: "manager", label: "Hiring manager", body: "Your experience against the role" },
  { value: "loop", label: "Full interview", body: "Every stage in one sitting" },
] as const
const STOP = new Set("the and for with you your our are will this that from have has who can all any not but job role team work years experience ability strong skills including such about into using across within will must should".split(" "))

// The posting's most repeated meaningful words, as a rough read of what it cares about.
function keywords(text: string) {
  const counts = new Map<string, number>()
  for (const w of text.toLowerCase().match(/[a-z][a-z+#.\-/]{2,}/g) ?? []) if (!STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w)
}

// Job simulation: pick one of your matches (Plato writes questions from its posting on the
// server and keeps the scorecard) or paste any job description; then set the stage.
function Simulate() {
  const params = useSearchParams()
  const router = useRouter()
  const data = useCareerData()
  const [sourcePick, setSource] = useState<Source | null>(null)
  const [jobPick, setJobId] = useState<string | null>(params.get("job"))
  // Defaults: the best match, or pasting when there are no matches.
  const source: Source = sourcePick ?? (data && !data.matches.length ? "paste" : "match")
  const jobId = jobPick ?? data?.matches[0]?.job.id ?? null
  const [stage, setStage] = useState<(typeof STAGES)[number]["value"]>("manager")
  const [paste, setPaste] = useState({ title: "", company: "", text: "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [local, setLocal] = useState(false)

  const crumbs = [{ label: "Career", href: "/career" }, { label: "Interviews", href: "/career/interviews" }]
  const picked = data?.matches.find((m) => m.job.id === jobId)
  const ready = source === "match" ? !!picked : paste.title.trim() && paste.text.trim().split(/\s+/).length >= 30

  async function start() {
    setError(null)
    if (source === "paste") return setLocal(true)
    if (!picked) return
    setBusy(true)
    try {
      const iv = await startInterview({ jobId: picked.job.id })
      invalidateCareerData()
      router.push(`/career/interviews/${iv.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the interview")
      setBusy(false)
    }
  }

  if (local) {
    const qs = jobQuestions(paste.title, paste.company, keywords(paste.text))
    const shown = stage === "screen" ? [qs[0], qs[4], qs[3]] : stage === "manager" ? [qs[0], qs[1], qs[2], qs[4]] : qs
    return (
      <div className={PAGE}>
        <PageHeader crumbs={crumbs} title={`${paste.title}${paste.company ? ` · ${paste.company}` : ""}`} description={`Job simulation · ${STAGES.find((s) => s.value === stage)!.label}`} />
        <InterviewSession questions={shown} title={`${paste.title} interview`} subtitle={paste.company || "Pasted job"} kind="simulation" retryHref="/career/interviews/simulate" interviewer={paste.company ? `${paste.company}'s interviewer` : "The interviewer"} />
      </div>
    )
  }

  return (
    <div className={PAGE}>
      <PageHeader crumbs={crumbs} title="Job interview simulation" description="Rehearse the interview for a specific job. Questions come from the job post and your CV." />
      <ol className="mx-auto flex w-full max-w-3xl items-center gap-2 text-[13px] font-semibold" aria-label="Steps">
        {["Choose the job", "Set the stage", "Interview", "Results"].map((s, i) => (
          <li key={s} className={cn("flex flex-1 items-center gap-2", i > 1 ? "text-text-tertiary" : "text-foreground")}>
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs", i < 2 ? "bg-primary text-white" : "bg-divider")}>{i + 1}</span>
            <span className="truncate">{s}</span>
          </li>
        ))}
      </ol>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <b className="text-base">1. Choose the job</b>
          <Segmented value={source} onChange={setSource} dataAi="simulate.source" options={[{ value: "match", label: "My matches" }, { value: "paste", label: "Paste a job" }]} />
        </div>
        {source === "match" && !data && <Skeleton className="h-32 rounded-xl" />}
        {source === "match" && data && !data.matches.length && <p className="text-sm text-text-secondary">No matches yet. Run a search in Jobs, or paste a job description.</p>}
        {source === "match" && data && (
          <div role="radiogroup" className="flex flex-col gap-2">
            {data.matches.map((m) => (
              <button key={m.job.id} type="button" role="radio" aria-checked={jobId === m.job.id} data-ai={`simulate.job:${m.job.id}`} onClick={() => setJobId(m.job.id)} className={cn("flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors", jobId === m.job.id ? "border-primary bg-primary-tint" : "bg-card hover:border-primary-line")}>
                <MonoTile name={m.job.company} size="sm" />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14.5px]">{m.job.title}</b>
                  <span className="block truncate text-xs text-text-secondary">
                    {m.job.company}
                    {m.job.location ? ` · ${m.job.location}` : ""}
                  </span>
                </span>
                <MatchPill value={m.match_percent} />
                {jobId === m.job.id && <Check className="size-4 text-primary" />}
              </button>
            ))}
          </div>
        )}
        {source === "paste" && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input data-ai="simulate.paste.title" value={paste.title} onChange={(e) => setPaste({ ...paste, title: e.target.value })} placeholder="Job title" className="h-11 rounded-xl border bg-background px-3.5 text-sm outline-none focus:border-primary-line" />
              <input data-ai="simulate.paste.company" value={paste.company} onChange={(e) => setPaste({ ...paste, company: e.target.value })} placeholder="Company (optional)" className="h-11 rounded-xl border bg-background px-3.5 text-sm outline-none focus:border-primary-line" />
            </div>
            <textarea data-ai="simulate.paste.text" value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })} rows={6} placeholder="Paste the job description (at least a paragraph)" className="rounded-xl border bg-background p-3.5 text-sm outline-none focus:border-primary-line" />
          </div>
        )}

        <b className="border-t border-divider pt-5 text-base">2. Set the stage</b>
        {source === "match" ? (
          <PlatoNote variant="inline">Plato reads the job post and your CV, writes the questions, asks follow-ups like a real interviewer, then scores you. The scorecard is saved to your account.</PlatoNote>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {STAGES.map((s) => (
              <button key={s.value} type="button" data-ai={`simulate.stage.${s.value}`} aria-pressed={stage === s.value} onClick={() => setStage(s.value)} className={cn("flex flex-col gap-0.5 rounded-xl border px-3.5 py-3 text-left", stage === s.value ? "border-primary bg-primary-tint" : "bg-card hover:border-primary-line")}>
                <b className={cn("text-sm", stage === s.value && "text-primary")}>{s.label}</b>
                <span className="text-[12.5px] text-text-secondary">{s.body}</span>
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <Link href="/career" className="text-sm font-semibold text-text-secondary hover:text-foreground">Back to Career</Link>
          <Button data-ai="simulate.start" onClick={() => void start()} disabled={!ready || busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Reading the job post…" : "Start the interview"}
            {!busy && <ArrowRight className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function SimulatePage() {
  return (
    <Suspense fallback={null}>
      <Simulate />
    </Suspense>
  )
}
