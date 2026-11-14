"use client"

import { use, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Clock, ExternalLink, Flag, ListChecks, Loader2, Timer, X } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CompanyAvatar } from "@/components/company-avatar"
import { getQuiz, submitAttempt } from "@/lib/quizzes/api"
import type { Answer, Question, QuizDetail, Section } from "@/lib/quizzes/contract"
import { FIXTURE_QUIZ } from "@/lib/quizzes/fixture"
import { GeneratingCard, useQuizPolling } from "../_ui/generating"
import { ScenarioPanel } from "../_ui/media"
import { isAnswered, QuestionView } from "../_ui/questions"
import { useLeaveGuard } from "@/lib/use-leave-guard"

// One quiz: intro, then one question per screen (a section's instructions first), then a review, then the score.
// Answers and the section clocks are kept in this tab, so a refresh never loses progress.

type Step = { kind: "section"; s: number } | { kind: "q"; s: number; q: Question; n: number }
type Saved = { phase: "intro" | "play" | "review"; step: number; answers: Record<string, Answer>; startedAt: number; deadlines: Record<string, number> }
// ponytail: event-handler clock; the hooks purity rule can't tell handlers from render, so Date.now sits behind this.
const clock = () => Date.now()
const KEY = (id: string) => `plato:quiz:${id}`
const read = (id: string): Saved | null => {
  try {
    const v = sessionStorage.getItem(KEY(id))
    return v ? (JSON.parse(v) as Saved) : null
  } catch {
    return null
  }
}
const write = (id: string, v: Saved | null) => {
  try {
    if (v) sessionStorage.setItem(KEY(id), JSON.stringify(v))
    else sessionStorage.removeItem(KEY(id))
  } catch {
    /* storage off: the quiz still works, a refresh starts over */
  }
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, "0")}`
const KIND_LABEL: Record<Section["kind"], string> = {
  work_simulation: "Work simulation",
  work_style: "Work style",
  situational: "Situational judgement",
  numerical: "Numerical reasoning",
  logical: "Logical reasoning",
  verbal: "Verbal reasoning",
  technical: "Technical knowledge",
  skills: "Skills",
  language: "Language",
  personality: "Values and motivation",
}

export default function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const fixture = useSearchParams().get("fixture") === "1" && id === "fixture" && process.env.NODE_ENV !== "production"
  const [quiz, setQuiz] = useState<QuizDetail | null>(fixture ? FIXTURE_QUIZ : null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Saved>({ phase: "intro", step: 0, answers: {}, startedAt: 0, deadlines: {} })
  useLeaveGuard(saved.phase === "play" || saved.phase === "review", "Your quiz is in progress. Leave now? Your answers stay in this tab, but the clock keeps running.")
  const [now, setNow] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(() => {
    if (fixture) return
    getQuiz(id)
      .then((q) => (setQuiz(q), setError(null)))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the quiz"))
  }, [id, fixture])
  useEffect(load, [load])
  useEffect(() => {
    const s = read(id)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage exists only after hydration
    if (s) setSaved(s)
  }, [id])
  useQuizPolling(quiz?.status === "generating" ? id : null, setQuiz)
  const save = (patch: Partial<Saved>) =>
    setSaved((x) => {
      const next = { ...x, ...patch }
      write(id, next)
      return next
    })

  const steps = useMemo<Step[]>(() => {
    if (!quiz) return []
    let n = 0
    return quiz.sections.flatMap((s, si) => [{ kind: "section" as const, s: si }, ...s.questions.map((q) => ({ kind: "q" as const, s: si, q, n: ++n }))])
  }, [quiz])
  const total = steps.filter((s) => s.kind === "q").length
  const step = steps[Math.min(saved.step, Math.max(0, steps.length - 1))]
  const section = step ? quiz?.sections[step.s] : undefined

  // Section clock: starts when the section's first screen opens; when it runs out, the section closes.
  const deadline = section ? saved.deadlines[section.id] : undefined
  const left = deadline ? Math.round((deadline - now) / 1000) : null
  useEffect(() => {
    if (saved.phase !== "play" || !deadline) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [saved.phase, deadline])
  useEffect(() => {
    if (saved.phase !== "play" || left === null || left > 0 || !step) return
    const next = steps.findIndex((s, i) => i > saved.step && s.s !== step.s)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the section closes when its clock hits zero
    save(next < 0 ? { phase: "review" } : { step: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the clock hits zero
  }, [left === null || left > 0])

  function go(i: number) {
    const target = steps[i]
    if (!target || !quiz) return save({ phase: "review" })
    const sec = quiz.sections[target.s]!
    const deadlines = sec.timeLimitSec && !saved.deadlines[sec.id] && target.kind === "q" ? { ...saved.deadlines, [sec.id]: clock() + sec.timeLimitSec * 1000 } : saved.deadlines
    setNow(clock())
    save({ step: i, deadlines })
  }

  async function submit() {
    if (!quiz) return
    if (fixture) return setError("This is the development fixture: there is no server to score it.")
    setSubmitting(true)
    try {
      const r = await submitAttempt(quiz.id, { answers: saved.answers, seconds: Math.round((clock() - (saved.startedAt || clock())) / 1000) })
      write(id, null)
      router.push(`/career/quizzes/${quiz.id}/results/${r.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit your answers")
      setSubmitting(false)
    }
  }

  const crumbs = [
    { label: "Career", href: "/career" },
    { label: "Quizzes", href: "/career/quizzes" },
  ]
  if (error && !quiz)
    return (
      <div className={PAGE}>
        <PageHeader crumbs={crumbs} title="Quiz" />
        <p role="alert" className="rounded-2xl border border-l-4 border-l-destructive bg-card px-4 py-3 text-sm">
          {error}{" "}
          <button onClick={load} className="font-semibold text-primary underline-offset-2 hover:underline">
            Try again
          </button>
        </p>
      </div>
    )
  if (!quiz)
    return (
      <div className={PAGE}>
        <Skeleton className="h-10 w-72 rounded-xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    )
  if (quiz.status !== "ready")
    return (
      <div className={PAGE}>
        <PageHeader crumbs={crumbs} title={quiz.title || "Your quiz"} />
        <GeneratingCard quiz={quiz} onRetry={() => router.push("/career/quizzes")} className="mx-auto w-full max-w-2xl" />
      </div>
    )

  // ---- intro ----
  if (saved.phase === "intro")
    return (
      <div className={PAGE}>
        <PageHeader crumbs={crumbs} title={quiz.title} />
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-card">
            <div className="flex items-center gap-4">
              {quiz.company && <CompanyAvatar name={quiz.company} size={52} />}
              <div className="min-w-0">
                <p className="text-sm text-text-secondary">{quiz.company ? `${quiz.company} · ` : ""}Practice test</p>
                <h2 className="text-2xl font-bold tracking-tight">{quiz.role}</h2>
              </div>
            </div>
            <p className="text-[15px] leading-relaxed text-foreground">{quiz.about}</p>
            {!!quiz.sources?.length && (
              <div className="flex flex-wrap gap-2">
                {quiz.sources.slice(0, 4).map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-text-secondary hover:border-primary-line hover:text-primary"
                  >
                    <ExternalLink className="size-3 shrink-0" />
                    <span className="truncate">{s.title}</span>
                  </a>
                ))}
              </div>
            )}
            <ol className="flex flex-col divide-y divide-divider rounded-xl border">
              {quiz.sections.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-sm font-bold text-primary">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{s.title}</span>
                    <span className="block text-sm text-text-tertiary">{KIND_LABEL[s.kind]}</span>
                  </span>
                  <span className="text-right text-sm text-text-secondary tabular-nums">
                    {s.questions.length} question{s.questions.length === 1 ? "" : "s"}
                    {s.timeLimitSec ? <span className="block text-xs text-text-tertiary">{Math.round(s.timeLimitSec / 60)} min</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <aside className="flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-card">
            <h3 className="font-semibold">Before you start</h3>
            <ul className="flex flex-col gap-3 text-sm text-text-secondary">
              <li className="flex gap-2.5">
                <ListChecks className="mt-0.5 size-4 shrink-0 text-primary" />
                {total} questions, one at a time. You can go back within a section.
              </li>
              <li className="flex gap-2.5">
                <Clock className="mt-0.5 size-4 shrink-0 text-primary" />
                About {quiz.minutes} minutes. Timed sections close when their clock runs out.
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                You get your score and why each best answer is best right after you submit.
              </li>
            </ul>
            <Button onClick={() => (save({ phase: "play", startedAt: saved.startedAt || clock() }), go(saved.step))} className="h-11 gap-2 rounded-xl text-[15px]">
              {saved.startedAt ? "Continue" : "Start the quiz"} <ArrowRight className="size-4" />
            </Button>
          </aside>
        </div>
      </div>
    )

  // ---- review ----
  if (saved.phase === "review" || !step) {
    const missing = steps.filter((s): s is Extract<Step, { kind: "q" }> => s.kind === "q" && !isAnswered(s.q, saved.answers[s.q.id]))
    return (
      <div className={PAGE}>
        <PageHeader
          crumbs={crumbs}
          title="Review your answers"
          description={missing.length ? `${missing.length} question${missing.length === 1 ? " is" : "s are"} unanswered. Unanswered questions score zero.` : "Every question is answered."}
        />
        <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {quiz.sections.map((s, si) => {
            const qs = steps.filter((x): x is Extract<Step, { kind: "q" }> => x.kind === "q" && x.s === si)
            const closed = !!s.timeLimitSec && !!saved.deadlines[s.id] && saved.deadlines[s.id]! < now
            return (
              <div key={s.id} className="rounded-2xl border bg-card p-5 shadow-card">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">{s.title}</h2>
                  {closed && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-text-secondary">Time is up</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {qs.map((x) => {
                    const done = isAnswered(x.q, saved.answers[x.q.id])
                    return (
                      <button
                        key={x.q.id}
                        type="button"
                        disabled={closed}
                        onClick={() => (save({ phase: "play" }), go(steps.indexOf(x)))}
                        aria-label={`Question ${x.n}${done ? ", answered" : ", not answered"}`}
                        className={cn(
                          "grid size-11 place-items-center rounded-xl border text-sm font-bold tabular-nums transition-colors disabled:cursor-not-allowed",
                          done ? "border-primary-line bg-primary-tint text-primary" : "border-warning-line bg-warning-soft text-warning-ink",
                        )}
                      >
                        {x.n}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => (save({ phase: "play" }), go(steps.length - 1))} className="gap-2">
              <ArrowLeft className="size-4" /> Back to the questions
            </Button>
            <Button onClick={() => void submit()} disabled={submitting} className="h-11 gap-2 rounded-xl px-6 text-[15px]">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Flag className="size-4" />} Submit answers
            </Button>
          </div>
        </section>
      </div>
    )
  }

  // ---- play ----
  const sec = section!
  const secQs = steps.filter((x): x is Extract<Step, { kind: "q" }> => x.kind === "q" && x.s === step.s)
  const secDone = secQs.filter((x) => isAnswered(x.q, saved.answers[x.q.id])).length
  const scenario = step.kind === "q" && step.q.scenarioId ? sec.scenarios.find((x) => x.id === step.q.scenarioId) : undefined
  const answer = step.kind === "q" ? (saved.answers[step.q.id] ?? null) : null
  const firstOfSection = steps.findIndex((x) => x.s === step.s)
  const canBack = saved.step > firstOfSection
  return (
    <div className={cn(PAGE, "gap-5")}>
      <header className="flex flex-col gap-3 rounded-2xl border bg-card px-5 py-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold tracking-[0.08em] text-text-tertiary uppercase">{quiz.title}</p>
            <h1 className="truncate text-lg font-bold tracking-tight">{sec.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            {left !== null && (
              <span
                role="timer"
                aria-label={`${mmss(left)} left in this section`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
                  left <= 60 ? "bg-warning-soft text-warning-ink" : "bg-primary-soft text-primary",
                )}
              >
                <Timer className="size-4" /> {mmss(left)}
              </span>
            )}
            <Link
              href="/career/quizzes"
              aria-label="Leave the quiz (your answers are kept)"
              className="grid size-9 place-items-center rounded-full text-text-tertiary hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${(secDone / Math.max(1, secQs.length)) * 100}%` }} />
          </div>
          <span className="shrink-0 text-sm text-text-secondary tabular-nums">{step.kind === "q" ? `Question ${step.n} of ${total}` : `Section ${step.s + 1} of ${quiz.sections.length}`}</span>
        </div>
      </header>

      {step.kind === "section" ? (
        <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-2xl border bg-card p-7 shadow-card">
          <p className="text-xs font-semibold tracking-[0.08em] text-primary uppercase">
            Section {step.s + 1} · {KIND_LABEL[sec.kind]}
          </p>
          <h2 className="text-2xl font-bold tracking-tight">{sec.title}</h2>
          <p className="text-[15px] leading-relaxed whitespace-pre-line text-foreground">{sec.instructions}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <ListChecks className="size-4 text-primary" /> {sec.questions.length} questions
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4 text-primary" /> {sec.timeLimitSec ? `${Math.round(sec.timeLimitSec / 60)} minutes, starts when you begin` : "Not timed"}
            </span>
          </p>
        </section>
      ) : (
        <div className={cn("grid items-start gap-5", scenario && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
          {scenario && <ScenarioPanel s={scenario} className="rounded-2xl border bg-card p-5 shadow-card" />}
          <section className={cn("rounded-2xl border bg-card p-6 shadow-card", !scenario && "mx-auto w-full max-w-3xl")}>
            <QuestionView key={step.q.id} q={step.q} answer={answer} onAnswer={(a) => save({ answers: { ...saved.answers, [step.q.id]: a } })} />
          </section>
        </div>
      )}

      <footer className={cn("flex items-center justify-between gap-3", step.kind === "section" || !scenario ? "mx-auto w-full max-w-3xl" : "")}>
        <Button variant="ghost" onClick={() => go(saved.step - 1)} disabled={!canBack} className="gap-2">
          <ArrowLeft className="size-4" /> Back
        </Button>
        {step.kind === "q" && !isAnswered(step.q, answer) && (
          <span className="hidden items-center gap-1.5 text-sm text-text-tertiary sm:inline-flex">
            <AlertTriangle className="size-3.5" /> Not answered yet
          </span>
        )}
        <Button onClick={() => go(saved.step + 1)} className="h-11 gap-2 rounded-xl px-5 text-[15px]">
          {step.kind === "section" ? "Begin section" : saved.step === steps.length - 1 ? "Review answers" : step.kind === "q" && !isAnswered(step.q, answer) ? "Skip" : "Next"}{" "}
          <ArrowRight className="size-4" />
        </Button>
      </footer>
    </div>
  )
}
