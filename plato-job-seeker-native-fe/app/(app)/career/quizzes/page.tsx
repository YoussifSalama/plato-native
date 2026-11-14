"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Brain,
  Building2,
  Check,
  CircleUserRound,
  ClipboardList,
  Clock,
  Library,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { CareerNav } from "@/components/career-nav"
import { PillTabs } from "@/components/pill-tabs"
import { CompanyAvatar } from "@/components/company-avatar"
import { CARD, Kpi, MatchRing } from "@/components/plato-ui"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { deleteQuiz, getCandidateProfile, listAssessments, listLibrary, listQuizzes, takeLibraryQuiz } from "@/lib/quizzes/api"
import type { AssessmentSummary, CandidateProfile, QuizSummary } from "@/lib/quizzes/contract"
import { MatrixGrid } from "./_ui/matrix"
import { ago, BTN_PRIMARY, BTN_SECONDARY, CATEGORY } from "./_ui/shell"

// Quizzes: standard assessments (validated banks: reasoning, personality, work style) that build one candidate
// profile, company quizzes the AI builds for a specific job, and the shared library of those.

type View = "assessments" | "company" | "library"
const VIEWS: View[] = ["assessments", "company", "library"]
// decorative grid on the reasoning card (OMIB item 36, shown without its answer)
const SAMPLE = [
  "00000000110000001000",
  "00000000010000000010",
  "00000000100000001010",
  "00000000110100000010",
  "00000000100100000001",
  "00000000010000000011",
  "00000000111100000100",
  "00000000101100001000",
]
const BTN_SM = "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors"

export default function QuizzesPage() {
  const router = useRouter()
  const [view, setViewState] = useState<View>("assessments")
  const setView = (v: View) => {
    setViewState(v)
    const u = new URL(window.location.href)
    u.searchParams.set("tab", v)
    window.history.replaceState(null, "", u)
  }
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("tab") as View | null
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only readable after mount
    if (a && VIEWS.includes(a)) setViewState(a)
  }, [])

  const [tests, setTests] = useState<AssessmentSummary[] | null>(null)
  const [profile, setProfile] = useState<CandidateProfile | null>(null)
  const [mine, setMine] = useState<QuizSummary[] | null>(null)
  const [library, setLibrary] = useState<QuizSummary[] | null>(null)
  const [libQ, setLibQ] = useState("")
  const [menu, setMenu] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listAssessments()
      .then(setTests)
      .catch(() => setTests([]))
    getCandidateProfile()
      .then(setProfile)
      .catch(() => undefined)
  }, [])
  const refreshMine = useCallback(() => {
    listQuizzes()
      .then(setMine)
      .catch(() => setMine([]))
  }, [])
  useEffect(refreshMine, [refreshMine])
  useEffect(() => {
    const t = setTimeout(() => {
      listLibrary(libQ)
        .then(setLibrary)
        .catch(() => setLibrary([]))
    }, 250)
    return () => clearTimeout(t)
  }, [libQ])
  const anyBuilding = mine?.some((m) => m.status === "generating")
  useEffect(() => {
    if (!anyBuilding) return
    const t = setInterval(refreshMine, 4000)
    return () => clearInterval(t)
  }, [anyBuilding, refreshMine])

  async function take(id: string) {
    setError(null)
    try {
      const q = await takeLibraryQuiz(id)
      router.push(`/career/quizzes/${q.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this quiz")
    }
  }
  async function remove(id: string) {
    setMenu(null)
    setMine((m) => m?.filter((x) => x.id !== id) ?? m)
    await deleteQuiz(id).catch(refreshMine)
  }

  const reasoning = tests?.filter((t) => t.category === "reasoning") ?? []
  const personality = tests?.filter((t) => t.category === "personality") ?? []
  const style = tests?.filter((t) => t.category === "work_style") ?? []
  const strongest = profile?.domains ? [...profile.domains].sort((a, b) => b.score - a.score)[0]?.name : null

  return (
    <div className={PAGE}>
      <PageHeader title="Quizzes" description="Validated assessments that build your candidate profile, and practice tests in a company's own format for the jobs you want.">
        <CareerNav />
      </PageHeader>

      {/* the profile at a glance: the same band whatever the tab */}
      <section className={cn(CARD, "flex flex-col gap-2 p-2 lg:flex-row lg:items-center")}>
        <div className="grid flex-1 grid-cols-2 gap-1 md:grid-cols-4">
          <Kpi icon={ClipboardList} value={profile ? `${profile.done}/${profile.total}` : "—"} label="Assessments done" index={0} />
          <Kpi icon={Brain} value={profile?.reasoning ? profile.reasoning.percentile : "—"} label="Reasoning percentile" index={1} />
          <Kpi icon={TrendingUp} accent="teal" value={strongest ?? "—"} label="Strongest trait" index={2} />
          <Kpi icon={Building2} accent="azure" value={mine?.filter((m) => m.status !== "failed").length ?? "—"} label="Company quizzes" index={3} />
        </div>
        <Link href="/career/quizzes/profile" className={cn(BTN_SECONDARY, "m-2 shrink-0 lg:ml-0")}>
          <CircleUserRound className="size-4" /> {profile?.report ? "Your profile & report" : "Your candidate profile"} <ArrowRight className="size-4" />
        </Link>
      </section>

      <PillTabs
        id="quiz-views"
        label="Quizzes"
        dataAi="quizzes.tab"
        value={view}
        onChange={setView}
        tabs={[
          { key: "assessments", label: "Assessments", icon: ListChecks, count: tests?.length || undefined },
          { key: "company", label: "Company quizzes", icon: Building2, count: mine?.length || undefined },
          { key: "library", label: "Library", icon: Library },
        ]}
      />

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {view === "assessments" &&
        (tests === null ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-72 rounded-2xl" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-60 rounded-2xl" />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8" data-tour="quizzes-assessments">
            {reasoning.length > 0 && <ReasoningCard sets={reasoning} />}
            <Group title="Personality" hint="How you tend to think, feel and act. No right answers, no time limit." items={personality} />
            <Group title="Work style" hint="Traits employers screen for: leadership, reliability, stress tolerance, integrity." items={style} />
          </div>
        ))}

      {view === "company" && (
        <section className="flex flex-col gap-4" data-tour="quizzes-mine">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Company quizzes</h2>
              <p className="text-sm text-text-secondary">A practice test in a company&apos;s own format for one job. One quiz per job; every retake is kept inside it.</p>
            </div>
            <Link href="/career/quizzes/new" className={BTN_PRIMARY}>
              <Plus className="size-4" /> Build a quiz
            </Link>
          </div>
          {mine === null ? (
            <CardGridSkeleton />
          ) : mine.length === 0 ? (
            <HowCompanyQuizzesWork />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {mine.map((m) => (
                <article key={m.id} className={cn(CARD, "relative flex min-h-[236px] flex-col gap-4 p-5")}>
                  <div className="flex items-start gap-3">
                    <CompanyAvatar name={m.company ?? m.role ?? m.title} size={44} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/career/quizzes/${m.id}`} className="line-clamp-2 font-semibold text-foreground hover:text-primary">
                        {m.title}
                      </Link>
                      <p className="text-sm text-text-tertiary tabular-nums">
                        {m.status === "generating" ? "Building…" : m.status === "failed" ? "Couldn't be built" : `${m.questionCount} questions · ${m.minutes} min`}
                      </p>
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMenu(menu === m.id ? null : m.id)}
                        aria-label="More"
                        aria-expanded={menu === m.id}
                        className="grid size-8 place-items-center rounded-full text-text-tertiary hover:bg-muted hover:text-foreground"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                      {menu === m.id && (
                        <div role="menu" className="absolute top-9 right-0 z-20 w-40 rounded-xl border bg-card p-1 shadow-lg">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => void remove(m.id)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-danger-soft"
                          >
                            <Trash2 className="size-4" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {m.status === "ready" && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.sections.slice(0, 4).map((s, i) => (
                        <span key={i} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                          {s.title}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-divider pt-4">
                    {m.bestScore !== null ? (
                      <span className="flex items-center gap-2 text-sm text-text-secondary">
                        <MatchRing value={m.bestScore} size={36} /> Best · {m.attempts} attempt{m.attempts === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="text-sm text-text-tertiary">{m.status === "ready" ? "Not taken yet" : m.status === "generating" ? "Ready in a minute or two" : "Delete it and try again"}</span>
                    )}
                    {m.status === "ready" ? (
                      <span className="flex items-center gap-2">
                        {m.lastAttemptId && (
                          <Link href={`/career/quizzes/${m.id}/results/${m.lastAttemptId}`} className={cn(BTN_SM, "border bg-card text-foreground hover:bg-muted")}>
                            Results
                          </Link>
                        )}
                        <Link href={`/career/quizzes/${m.id}`} className={cn(BTN_SM, "bg-primary text-primary-foreground hover:bg-primary-hover")}>
                          {m.attempts ? "Retake" : "Start"}
                        </Link>
                      </span>
                    ) : m.status === "generating" ? (
                      <Loader2 className="size-5 animate-spin text-primary" aria-label="Building" />
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {view === "library" && (
        <section className="flex flex-col gap-4" data-tour="quizzes-library">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Library</h2>
              <p className="text-sm text-text-secondary">Company quizzes other seekers built. Ready at once, and free to take.</p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary" />
              <Input value={libQ} onChange={(e) => setLibQ(e.target.value)} placeholder="Search a company or role" aria-label="Search the library" className="h-10 rounded-xl pl-9" />
            </div>
          </div>
          {library === null ? (
            <CardGridSkeleton />
          ) : library.length === 0 ? (
            <div className={cn(CARD, "flex flex-col items-center gap-3 px-6 py-12 text-center")}>
              <Library className="size-8 text-primary" />
              <p className="font-semibold">{libQ ? "Nothing for that search yet" : "The library is filling up"}</p>
              <p className="max-w-md text-sm text-text-secondary">Every company quiz a seeker builds lands here, so the next person aiming at that company can take it at once.</p>
              <Link href="/career/quizzes/new" className={cn(BTN_SECONDARY, "mt-2")}>
                <Plus className="size-4" /> Build one for your job
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {library.map((l) => (
                <article key={l.id} className={cn(CARD, "flex min-h-[200px] flex-col gap-4 p-5")}>
                  <div className="flex items-start gap-3">
                    <CompanyAvatar name={l.company ?? l.role ?? l.title} size={44} />
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 font-semibold">{l.title}</h3>
                      <p className="text-sm text-text-tertiary tabular-nums">
                        {l.questionCount} questions · {l.minutes} min
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {l.sections.slice(0, 4).map((s, i) => (
                      <span key={i} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                        {s.title}
                      </span>
                    ))}
                  </div>
                  <div className="mt-auto flex justify-end border-t border-divider pt-4">
                    <button type="button" onClick={() => void take(l.id)} className={cn(BTN_SM, "bg-primary text-primary-foreground hover:bg-primary-hover")}>
                      Take this quiz
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

// ---- assessments ---------------------------------------------------------------------------------------------------

/** The 11 matrix sets as one card: what it is, a sample grid, and every set with its status. */
function ReasoningCard({ sets }: { sets: AssessmentSummary[] }) {
  const next = sets.find((s) => s.attempts === 0) ?? sets[0]
  const done = sets.filter((s) => s.attempts > 0).length
  const c = CATEGORY.reasoning
  return (
    <section className={cn(CARD, "grid gap-6 overflow-hidden p-5 sm:p-6 lg:grid-cols-[260px_minmax(0,1fr)]")}>
      <div className="hidden flex-col items-center justify-center gap-3 rounded-2xl bg-primary-tint p-5 lg:flex">
        <MatrixGrid cells={SAMPLE} className="max-w-[200px] shadow-card" />
        <p className="text-center text-xs text-text-tertiary">Build the missing cell</p>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", c.tint)}>
              <c.icon className="size-3.5" /> Reasoning · IQ-style
            </span>
            <h2 className="mt-2 text-xl font-bold tracking-tight">Matrix reasoning</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-secondary">{sets[0].about}</p>
            <p className="mt-2 text-sm text-text-tertiary tabular-nums">
              {sets.length} sets · {sets[0].questionCount} grids each · {Math.round((sets[0].timeLimitSec ?? 0) / 60)} min, timed · {done} done
            </p>
          </div>
          <Link href={`/career/quizzes/assessments/${next.slug}`} className={BTN_PRIMARY}>
            {next.attempts ? <RotateCcw className="size-4" /> : <ArrowRight className="size-4" />} {next.attempts ? "Retake" : "Start"} Set {next.slug.split("-")[1]}
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-11">
          {sets.map((s) => {
            const n = s.slug.split("-")[1]
            const href = s.lastAttemptId ? `/career/quizzes/assessments/${s.slug}/results/${s.lastAttemptId}` : `/career/quizzes/assessments/${s.slug}`
            return (
              <Link
                key={s.slug}
                href={href}
                className={cn(
                  "flex flex-col gap-1 rounded-xl border p-2.5 transition-colors hover:border-primary-line hover:bg-primary-tint",
                  s.attempts ? "border-primary-line bg-primary-soft/50" : "bg-card",
                  s.slug === next.slug && !s.attempts && "ring-1 ring-primary",
                )}
              >
                <span className="flex items-center justify-between text-xs font-semibold text-text-secondary">
                  Set {n} {s.attempts > 0 && <Check className="size-3.5 text-primary" strokeWidth={3} />}
                </span>
                <span className={cn("truncate text-sm font-bold tabular-nums", s.attempts ? "text-primary" : "text-text-tertiary")}>{s.lastHeadline?.replace("Better than", "≥") ?? "New"}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function Group({ title, hint, items }: { title: string; hint: string; items: AssessmentSummary[] }) {
  if (!items.length) return null
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="text-sm text-text-secondary">{hint}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((a, i) => (
          <AssessmentCard key={a.slug} a={a} index={i} />
        ))}
      </div>
    </section>
  )
}

function AssessmentCard({ a, index }: { a: AssessmentSummary; index: number }) {
  const c = CATEGORY[a.category]
  const extra = a.measures.length - 3
  return (
    <article
      className={cn(CARD, "flex min-h-[248px] flex-col gap-4 p-5 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 motion-reduce:animate-none")}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", c.tint)}>
          <c.icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/career/quizzes/assessments/${a.slug}`} className="font-semibold text-foreground hover:text-primary">
            {a.title}
          </Link>
          <p className="flex items-center gap-1.5 text-sm text-text-tertiary tabular-nums">
            <Clock className="size-3.5" /> {a.minutes} min · {a.questionCount} questions
          </p>
        </div>
      </div>
      <p className="line-clamp-2 text-sm leading-relaxed text-text-secondary">{a.about}</p>
      <div className="flex flex-wrap gap-1.5">
        {a.measures.slice(0, 3).map((m) => (
          <span key={m} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-text-secondary">
            {m}
          </span>
        ))}
        {extra > 0 && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-text-tertiary">+{extra} more</span>}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-divider pt-4">
        {a.lastHeadline ? (
          <span className="min-w-0 text-sm">
            <span className="block truncate font-semibold text-foreground">{a.lastHeadline}</span>
            <span className="block text-xs text-text-tertiary">
              {ago(a.lastAt!)} · {a.attempts} attempt{a.attempts === 1 ? "" : "s"}
            </span>
          </span>
        ) : (
          <span className="text-sm text-text-tertiary">Not taken yet</span>
        )}
        <span className="flex shrink-0 items-center gap-2">
          {a.lastAttemptId && (
            <Link href={`/career/quizzes/assessments/${a.slug}/results/${a.lastAttemptId}`} className={cn(BTN_SM, "border bg-card text-foreground hover:bg-muted")}>
              Results
            </Link>
          )}
          <Link href={`/career/quizzes/assessments/${a.slug}`} className={cn(BTN_SM, "bg-primary text-primary-foreground hover:bg-primary-hover")}>
            {a.attempts ? "Retake" : "Start"}
          </Link>
        </span>
      </div>
    </article>
  )
}

// ---- helpers -------------------------------------------------------------------------------------------------------

function CardGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-56 rounded-2xl" />
      ))}
    </div>
  )
}

function HowCompanyQuizzesWork() {
  const steps = [
    { icon: Building2, title: "Pick a job", body: "One from your matches or saved jobs, or paste any job description." },
    { icon: Search, title: "Plato researches the test", body: "How that company screens candidates: work simulations, situational judgement, technical checks." },
    { icon: Sparkles, title: "Practise in that format", body: "Scenarios, tables and ranked choices, scored with an explanation for every answer." },
  ]
  return (
    <div className={cn(CARD, "flex flex-col gap-6 p-6 sm:p-8")}>
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="flex flex-col gap-3 rounded-2xl bg-muted/40 p-5">
            <span className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary">
                <s.icon className="size-[18px]" />
              </span>
              <span className="text-xs font-semibold text-text-tertiary tabular-nums">Step {i + 1}</span>
            </span>
            <p className="font-semibold">{s.title}</p>
            <p className="text-sm leading-relaxed text-text-secondary">{s.body}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-5">
        <p className="text-sm text-text-secondary">No company quizzes yet. Building one uses tokens; taking one from the library is free.</p>
        <Link href="/career/quizzes/new" className={BTN_PRIMARY}>
          <Plus className="size-4" /> Build your first quiz
        </Link>
      </div>
    </div>
  )
}
