"use client"

import { useEffect, useRef } from "react"
import { Check, Loader2, RotateCcw, Sparkles } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { getQuiz } from "@/lib/quizzes/api"
import type { QuizDetail, QuizSummary } from "@/lib/quizzes/contract"

// While Plato builds a quiz: the three steps, the current one moving. Polls until it's ready or failed.

const STAGES = ["reading", "researching", "writing"] as const

export function useQuizPolling(id: string | null, onDone: (q: QuizDetail) => void, every = 2500) {
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })
  useEffect(() => {
    if (!id) return
    let live = true
    const tick = async () => {
      const q = await getQuiz(id).catch(() => null)
      if (!live) return
      if (q && q.status !== "generating") return done.current(q)
      if (q) done.current(q)
      t = setTimeout(tick, every)
    }
    let t = setTimeout(tick, every)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [id, every])
}

export function GeneratingCard({ quiz, onRetry, className }: { quiz: Pick<QuizSummary, "status" | "stage" | "company" | "role">; onRetry?: () => void; className?: string }) {
  const company = quiz.company || "the company"
  const steps = [
    { key: "reading", label: "Reading the job", hint: quiz.role ? `${quiz.role}: the skills and level it asks for` : "The role, its skills and level" },
    { key: "researching", label: `Researching how ${company} tests candidates`, hint: "Its online assessment and interview format" },
    { key: "writing", label: "Writing your questions", hint: "In the same format, with an answer key" },
  ] as const
  const at = Math.max(0, STAGES.indexOf((quiz.stage ?? "reading") as (typeof STAGES)[number]))
  const failed = quiz.status === "failed"
  return (
    <section aria-live="polite" className={cn("relative overflow-hidden rounded-2xl border bg-card p-6 shadow-card", className)}>
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_0%_0%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_60%)]" />
      <div className="relative flex items-start gap-4">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", failed ? "bg-danger-soft text-destructive" : "bg-primary-soft text-primary")}>
          {failed ? <RotateCcw className="size-5" /> : <Sparkles className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold tracking-tight">{failed ? "Plato couldn't build this quiz" : "Building your quiz"}</h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            {failed
              ? "Something went wrong while writing the questions. Nothing was charged for the failed part; try again."
              : "This takes about a minute. You can leave this page; the quiz will be waiting in Your quizzes."}
          </p>
          {!failed && (
            <ol className="mt-5 flex flex-col gap-3.5">
              {steps.map((s, i) => {
                const state = i < at ? "done" : i === at ? "now" : "todo"
                return (
                  <li key={s.key} className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border text-xs font-bold",
                        state === "done" && "border-primary bg-primary text-primary-foreground",
                        state === "now" && "border-primary text-primary",
                        state === "todo" && "text-text-tertiary",
                      )}
                    >
                      {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : state === "now" ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block text-[15px]", state === "todo" ? "text-text-tertiary" : "font-semibold text-foreground")}>{s.label}</span>
                      <span className="block text-sm text-text-tertiary">{s.hint}</span>
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
          {failed && onRetry && (
            <Button onClick={onRetry} className="mt-4 gap-2 rounded-xl">
              <RotateCcw className="size-4" /> Try again
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
