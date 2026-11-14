"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { ChevronDown, Clock, Plus, RotateCcw } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { ScoreRing, scoreTone, SOLID_CTA, OUTLINE_CTA } from "@/components/career-hub"
import { CompanyAvatar } from "@/components/company-avatar"
import { getAttempt, getQuiz } from "@/lib/quizzes/api"
import type { AnswerKey, AttemptResult, Question, QuizDetail } from "@/lib/quizzes/contract"
import { ScenarioPanel } from "../../../_ui/media"
import { answerText } from "../../../_ui/questions"

// The score: overall, per section, then every question with the best answer and why.

const pct = (n: number) => Math.round(n * 100)
const bar = (n: number) => (n >= 75 ? "bg-success" : n >= 55 ? "bg-warning" : "bg-destructive")

function idealText(q: Question, key: AnswerKey): string {
  if (key.type === "work_style") return key.preferred === "either" ? "Either side: this pair has no preferred answer" : `Leaning ${key.preferred === "left" ? "A" : "B"} (${key.trait})`
  if (key.type === "rating") return answerText(q, { type: "rating", value: key.ideal })
  if (key.type === "ranking") return answerText(q, { type: "ranking", order: key.ideal })
  if (key.type === "multi_choice") return answerText(q, { type: "multi_choice", choices: key.correct })
  return answerText(q, { type: key.type, choice: key.correct } as never)
}

export default function QuizResultPage({ params }: { params: Promise<{ id: string; attemptId: string }> }) {
  const { id, attemptId } = use(params)
  const [quiz, setQuiz] = useState<QuizDetail | null>(null)
  const [r, setR] = useState<AttemptResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    Promise.all([getQuiz(id), getAttempt(id, attemptId)])
      .then(([q, a]) => (setQuiz(q), setR(a)))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your result"))
  }, [id, attemptId])

  const crumbs = [
    { label: "Career", href: "/career" },
    { label: "Quizzes", href: "/career/quizzes" },
  ]
  if (error)
    return (
      <div className={PAGE}>
        <PageHeader crumbs={crumbs} title="Your result" />
        <p role="alert" className="rounded-2xl border border-l-4 border-l-destructive bg-card px-4 py-3 text-sm">
          {error}
        </p>
      </div>
    )
  if (!quiz || !r)
    return (
      <div className={PAGE}>
        <Skeleton className="h-10 w-72 rounded-xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    )

  const byId = new Map(r.questions.map((x) => [x.questionId, x]))
  let n = 0
  return (
    <div className={PAGE}>
      <PageHeader crumbs={crumbs} title="Your result" description={quiz.title} />

      <section className="grid gap-5 rounded-2xl border bg-card p-6 shadow-card md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
        <div className="flex items-center gap-5">
          <ScoreRing value={r.score} size={120} />
          <div className="md:hidden">
            <p className={cn("text-lg font-bold", scoreTone(r.score))}>{r.score >= 75 ? "Strong" : r.score >= 55 ? "On the way" : "Keep practising"}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-3">
            {quiz.company && <CompanyAvatar name={quiz.company} size={36} />}
            <div className="min-w-0">
              <p className={cn("hidden text-lg font-bold md:block", scoreTone(r.score))}>{r.score >= 75 ? "Strong result" : r.score >= 55 ? "On the way" : "Keep practising"}</p>
              <p className="flex items-center gap-1.5 text-sm text-text-tertiary">
                <Clock className="size-3.5" /> {Math.round(r.seconds / 60)} min · {new Date(r.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </p>
            </div>
          </div>
          <p className="text-[15px] leading-relaxed text-foreground">{r.summary}</p>
          <ul className="flex flex-col gap-2.5">
            {r.sections.map((s) => (
              <li key={s.id} className="flex flex-col gap-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{s.title}</span>
                  <span className={cn("font-semibold tabular-nums", scoreTone(s.score))}>{s.score}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", bar(s.score))} style={{ width: `${s.score}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Link href={`/career/quizzes/${quiz.id}`} className={cn(SOLID_CTA, "h-10 rounded-xl px-4")}>
              <RotateCcw className="size-4" /> Retake
            </Link>
            <Link href="/career/quizzes" className={cn(OUTLINE_CTA, "h-10 rounded-xl px-4")}>
              <Plus className="size-4" /> Build another
            </Link>
          </div>
        </div>
      </section>

      {quiz.sections.map((s) => (
        <section key={s.id} className="flex flex-col gap-3">
          <h2 className="text-xl font-bold tracking-tight">{s.title}</h2>
          <ol className="flex flex-col gap-3">
            {s.questions.map((q) => {
              n++
              const res = byId.get(q.id)
              const scenario = q.scenarioId ? s.scenarios.find((x) => x.id === q.scenarioId) : undefined
              const score = res ? pct(res.score) : 0
              const ctx = `${q.id}`
              return (
                <li key={q.id} className="rounded-2xl border bg-card p-5 shadow-card">
                  <div className="flex items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-sm font-bold tabular-nums">{n}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{q.type === "work_style" ? `“${q.left}” or “${q.right}”` : q.prompt}</p>
                      {scenario && (
                        <button
                          type="button"
                          onClick={() => setOpen(open === ctx ? null : ctx)}
                          aria-expanded={open === ctx}
                          className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary"
                        >
                          Scenario: {scenario.title} <ChevronDown className={cn("size-4 transition-transform", open === ctx && "rotate-180")} />
                        </button>
                      )}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums",
                        score >= 75 ? "bg-success-soft text-success-ink" : score >= 40 ? "bg-warning-soft text-warning-ink" : "bg-danger-soft text-destructive",
                      )}
                    >
                      {score}%
                    </span>
                  </div>
                  {scenario && open === ctx && <ScenarioPanel s={scenario} className="mt-4 rounded-xl border bg-muted/30 p-4" />}
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div className="rounded-xl bg-muted/50 px-3.5 py-2.5">
                      <dt className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">Your answer</dt>
                      <dd className="mt-0.5 text-foreground">{answerText(q, res?.answer)}</dd>
                    </div>
                    {res && (
                      <div className="rounded-xl bg-primary-tint px-3.5 py-2.5">
                        <dt className="text-xs font-semibold tracking-wide text-primary uppercase">Best answer</dt>
                        <dd className="mt-0.5 text-foreground">{idealText(q, res.key)}</dd>
                      </div>
                    )}
                  </dl>
                  {res?.explanation && <p className="mt-3 text-sm leading-relaxed text-text-secondary">{res.explanation}</p>}
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
