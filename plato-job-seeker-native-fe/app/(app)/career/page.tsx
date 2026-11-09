"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { BarChart3, Check, ClipboardCheck, ChevronLeft, ChevronRight, FileText, Languages, LayoutTemplate, Lightbulb, Mic, Search, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { StatusPill } from "@/components/plato-ui"
import { BAND_LABEL, getResumeScore, listCareerResumes, type ResumeScore, listCareerThreads, type CareerThreadSummary } from "@/lib/career/api"
import { listInterviews, type InterviewSummary } from "@/lib/interviews/api"
import { timeAgo } from "@/lib/jobs/links"
import { getPreferences } from "@/lib/preferences/api"
import { getSkillGap, type SkillGap } from "@/lib/skills/api"
import { CareerChat } from "./career-chat"

// Career (screen 11): a catalog of tests and practice, your readiness for the role you want,
// and what to do next. Every card starts the practice in the career coach chat.
type Cat = "All" | "Interviews" | "Aptitude" | "Skills" | "Language" | "Resume"
type Practice = { cat: Exclude<Cat, "All">; title: string; body: string; meta: string; icon: LucideIcon; prompt?: string; href?: string }
const CATALOG: Practice[] = [
  { cat: "Interviews", title: "Behavioral interview (STAR)", body: "Common “tell me about a time” questions, scored", meta: "20 min · All levels", icon: Mic, prompt: "Give me a behavioral mock interview with STAR questions and score each answer" },
  { cat: "Interviews", title: "Technical interview for my role", body: "Questions on the tools and projects in your CV", meta: "25 min · Your level", icon: Mic, prompt: "Give me a technical mock interview for the role I'm targeting" },
  { cat: "Interviews", title: "Case interview: market sizing", body: "Estimate a market out loud; Plato scores your structure", meta: "30 min · Medium", icon: Mic, prompt: "Give me a market sizing case interview and score my structure" },
  { cat: "Interviews", title: "Case interview: profitability", body: "Find why profits fell, with a structure", meta: "30 min · Hard", icon: Mic, prompt: "Give me a profitability case interview" },
  { cat: "Interviews", title: "Voice mock interview", body: "Talk it through out loud, like the real thing", meta: "20 min · All levels", icon: Mic, href: "/career/interviews" },
  { cat: "Interviews", title: "Salary negotiation role-play", body: "Practice asking for more against a tough recruiter", meta: "10 min · All levels", icon: Mic, prompt: "Role-play a salary negotiation with me as a tough recruiter" },
  { cat: "Aptitude", title: "Numerical reasoning", body: "Timed questions, used by many consulting firms", meta: "18 min · Medium", icon: BarChart3, prompt: "Give me a numerical reasoning practice test, one question at a time" },
  { cat: "Aptitude", title: "Logical reasoning", body: "Patterns and deductions, one question at a time", meta: "15 min · Medium", icon: BarChart3, prompt: "Give me a logical reasoning practice test, one question at a time" },
  { cat: "Skills", title: "Close a skill gap", body: "Skills your matches ask for that aren't on your CV", meta: "Your matches", icon: Lightbulb, href: "/career/skills" },
  { cat: "Language", title: "Business English", body: "Writing and speaking for interviews, scored", meta: "20 min · All levels", icon: Languages, prompt: "Practice business English with me for job interviews and score me" },
  { cat: "Resume", title: "Resume score", body: "See what to fix before Plato applies", meta: "3 min", icon: FileText, prompt: "Score my resume out of 100 and list the quick fixes" },
  { cat: "Resume", title: "Build my resume", body: "From your profile, ready as a PDF", meta: "5 min", icon: FileText, prompt: "Build my resume" },
  { cat: "Resume", title: "Tailor to a job", body: "Paste a posting, get a resume that matches it", meta: "5 min", icon: LayoutTemplate, prompt: "Tailor my resume to a job. I'll paste the posting." },
]
const PAGE_SIZE = 6
const startHref = (p: Practice) => p.href ?? `/career?prompt=${encodeURIComponent(p.prompt ?? p.title)}`

function CareerHome() {
  const [cat, setCat] = useState<Cat>("All")
  const [q, setQ] = useState("")
  const [page, setPage] = useState(0)
  const [role, setRole] = useState<string | null>(null)
  const [resumes, setResumes] = useState<{ approved: boolean }[] | null>(null)
  const [interviews, setInterviews] = useState<InterviewSummary[] | null>(null)
  const [gaps, setGaps] = useState<SkillGap[] | null>(null)
  const [threads, setThreads] = useState<CareerThreadSummary[] | null>(null)
  // The master resume's score (fixed rules on the server) and what would raise it.
  const [score, setScore] = useState<ResumeScore | null>(null)

  useEffect(() => {
    getPreferences()
      .then((p) => setRole(p.roles[0] ?? null))
      .catch(() => undefined)
    listCareerResumes()
      .then(setResumes)
      .catch(() => setResumes([]))
    listInterviews()
      .then(setInterviews)
      .catch(() => setInterviews([]))
    getSkillGap()
      .then((g) => setGaps(g.skills))
      .catch(() => setGaps([]))
    listCareerThreads()
      .then(setThreads)
      .catch(() => setThreads([]))
    getResumeScore()
      .then(setScore)
      .catch(() => setScore(null))
  }, [])

  const list = useMemo(() => CATALOG.filter((p) => (cat === "All" || p.cat === cat) && (!q.trim() || `${p.title} ${p.body}`.toLowerCase().includes(q.trim().toLowerCase()))), [cat, q])
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const shown = list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const done = interviews?.filter((i) => i.completedAt).length ?? 0
  const open = interviews?.filter((i) => !i.completedAt) ?? []

  return (
    <div className={PAGE}>
      <PageHeader title="Career" description="Tests, practice and new skills that get you ready for the jobs you're applying to." actions={<span className="text-text-secondary"><b className="text-foreground">{CATALOG.length + (gaps?.length ?? 0)}</b> tests and practice sessions</span>} />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold tracking-tight">All tests and practice</h2>
            <label className="surface-panel flex h-10 w-full max-w-[260px] items-center gap-2 rounded-xl px-3">
              <Search className="size-4 text-text-tertiary" />
              <span className="sr-only">Search tests</span>
              <input value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} placeholder="Search tests" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-tertiary" />
            </label>
          </div>
          <div role="tablist" aria-label="Category" className="flex flex-wrap gap-2">
            {(["All", "Interviews", "Aptitude", "Skills", "Language", "Resume"] as Cat[]).map((c) => (
              <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => (setCat(c), setPage(0))} className={cn("rounded-full border px-4 py-1.5 text-sm font-medium transition-colors", cat === c ? "border-primary bg-primary text-white" : "bg-card text-foreground hover:border-primary-line")}>
                {c}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => (
              <div key={p.title} className="flex min-w-0 flex-col gap-1.5 rounded-2xl border bg-card p-3.5">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
                    <p.icon className="size-[18px]" />
                  </span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary">{p.cat}</span>
                </div>
                <b className="line-clamp-2 min-h-[2.6em] text-[15px] leading-snug">{p.title}</b>
                <span className="line-clamp-1 text-[13px] text-text-secondary">{p.body}</span>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className="truncate text-xs text-text-tertiary">{p.meta}</span>
                  <Link href={startHref(p)} data-ai={`career.start:${p.title}`} className="shrink-0 rounded-lg border bg-card px-3 py-1.5 text-sm font-semibold hover:border-primary-line">
                    Start
                  </Link>
                </div>
              </div>
            ))}
            {shown.length === 0 && <p className="text-sm text-text-secondary">Nothing matches that search.</p>}
          </div>
          <div className="flex items-center justify-between text-[13px] text-text-tertiary">
            <span>
              Showing {list.length ? page * PAGE_SIZE + 1 : 0}–{page * PAGE_SIZE + shown.length} of {list.length}
            </span>
            <span className="flex items-center gap-2">
              <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((n) => n - 1)} className="flex size-8 items-center justify-center rounded-lg border bg-card disabled:opacity-40">
                <ChevronLeft className="size-4" />
              </button>
              <span className="tabular-nums">
                {page + 1} of {pages}
              </span>
              <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage((n) => n + 1)} className="flex size-8 items-center justify-center rounded-lg border bg-card disabled:opacity-40">
                <ChevronRight className="size-4" />
              </button>
            </span>
          </div>
        </section>

        <aside className="flex flex-col gap-5">
          <div className="flex flex-col gap-2.5 rounded-2xl border bg-card p-4">
            <p className="eyebrow">Your readiness for</p>
            <b className="-mt-1.5 text-base">{role ? `${role} roles` : "the roles you want"}</b>
            <div className="flex flex-wrap gap-2">
              {score ? (
                <StatusPill tone={score.score >= 75 ? "success" : score.score >= 60 ? "warning" : "danger"}>
                  {score.score >= 75 && <Check className="size-3.5" />}
                  Resume {score.score}/100
                </StatusPill>
              ) : resumes?.some((r) => r.approved) ? (
                <StatusPill tone="success">
                  <Check className="size-3.5" />
                  Resume ready
                </StatusPill>
              ) : resumes !== null ? (
                <StatusPill tone="neutral">Resume · not built</StatusPill>
              ) : null}
              {interviews !== null && <StatusPill tone={done ? "primary" : "neutral"}>{done ? `Interview practice ${Math.min(done, 3)} of 3` : "Interview practice · not started"}</StatusPill>}
              {gaps !== null && <StatusPill tone={gaps.length ? "warning" : "success"}>{gaps.length ? `${gaps.length} skill gap${gaps.length === 1 ? "" : "s"}` : "No skill gaps"}</StatusPill>}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <h2 className="text-xl font-bold tracking-tight">Recommended for you</h2>
            {gaps?.[0] && (
              <Row icon={Lightbulb} title={`Learn ${gaps[0].skill}`} sub={`${gaps[0].missingIn} of your matches ask for it`} href="/career/skills" primary />
            )}
            <Row icon={Mic} title={role ? `Mock interview: ${role}` : "Mock interview"} sub="Voice · 20 min · built from your target role" href="/career/interviews" primary={!gaps?.[0]} />
            {!resumes?.length && <Row icon={FileText} title="Build my resume" sub="From your profile, ready as a PDF" href={`/career?prompt=${encodeURIComponent("Build my resume")}`} />}
          </div>

          {(open.length > 0 || !!threads?.length || !!score) && (
            <div className="flex flex-col gap-2.5">
              <h2 className="text-xl font-bold tracking-tight">Continue where you left off</h2>
              {open.slice(0, 1).map((i) => (
                <Row key={i.id} icon={Mic} title={`Interview: ${i.jobTitle}`} sub={`${i.company} · not finished`} href={`/career/interviews/${i.id}`} action="Resume" />
              ))}
              {threads?.slice(0, 2).map((t) => (
                <Row key={t.id} icon={LayoutTemplate} title={t.title ?? "Career conversation"} sub={`Last active ${timeAgo(t.updated_at)}`} href={`/career?thread=${t.id}`} action="Resume" />
              ))}
              {score && (
                <Row
                  icon={ClipboardCheck}
                  title={`Resume score · ${score.score}/100`}
                  sub={score.topFixes.length ? `${score.topFixes.length} quick fix${score.topFixes.length === 1 ? "" : "es"} left: ${score.topFixes[0].replace(/\.$/, "").toLowerCase()}` : `${BAND_LABEL[score.band]}. Nothing quick left to fix.`}
                  href={`/career?prompt=${encodeURIComponent(score.topFixes.length ? `Help me raise my resume score. Start with: ${score.topFixes[0]}` : "Score my resume")}`}
                  action={score.topFixes.length ? "Fix" : "Open"}
                />
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function Row({ icon: Icon, title, sub, href, primary, action = "Start" }: { icon: LucideIcon; title: string; sub: string; href: string; primary?: boolean; action?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[14.5px]">{title}</b>
        <span className="block truncate text-xs text-text-secondary">{sub}</span>
      </span>
      <Link href={href} className={cn("shrink-0 rounded-lg border px-3 py-1.5 text-sm font-semibold", primary ? "border-primary bg-primary text-white" : "bg-card hover:border-primary-line")}>
        {action}
      </Link>
    </div>
  )
}

// The chat opens when something was started (?prompt, ?job, ?thread, ?chat); otherwise the catalog.
function CareerPageContent() {
  const params = useSearchParams()
  const chat = ["prompt", "job", "thread", "chat"].some((k) => params.has(k))
  return chat ? <CareerChat /> : <CareerHome />
}

export default function CareerPage() {
  return (
    <Suspense fallback={null}>
      <CareerPageContent />
    </Suspense>
  )
}
