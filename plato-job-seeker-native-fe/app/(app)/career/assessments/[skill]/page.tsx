"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, Check, Clock } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { PlatoNote } from "@/components/plato-ui"
import { Button } from "@/components/ui/button"
import { SessionBar } from "@/components/career-hub"
import { ASSESSMENT_LENGTH, LEVEL_WEIGHT, bankBySlug, levelLabel, slug, type Level, type Question } from "@/lib/career-hub/content"
import { saveResult } from "@/lib/career-hub/store"

// Stable shuffle per question, so the right answer isn't always first.
function shuffled(q: Question) {
  let h = 0
  for (const c of q.id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return q.options.map((o, i) => ({ o, i, k: (h = (h * 1103515245 + 12345) >>> 0) })).sort((a, b) => a.k - b.k)
}
const SELF = ["New to it", "Some exposure", "Comfortable", "Strong", "Expert"]

export default function AssessmentSession({ params }: { params: Promise<{ skill: string }> }) {
  const { skill } = use(params)
  const bank = bankBySlug(skill)
  const router = useRouter()
  const [self, setSelf] = useState<number | null>(null)
  const [started, setStarted] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const [asked, setAsked] = useState<{ q: Question; picked: number }[]>([])
  const [level, setLevel] = useState<Level>(2)
  const [picked, setPicked] = useState<number | null>(null)

  // The next question: unused, at the current level, else the nearest level.
  const current = useMemo(() => {
    if (!bank || asked.length >= ASSESSMENT_LENGTH) return null
    const unused = bank.questions.filter((q) => !asked.some((a) => a.q.id === q.id))
    return [...unused].sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level))[0] ?? null
  }, [bank, asked, level])
  const options = useMemo(() => (current ? shuffled(current) : []), [current])

  useEffect(() => {
    if (started === null) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [started])
  // Keys 1-4 pick an answer, Enter confirms.
  useEffect(() => {
    if (started === null || !current) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return
      const n = Number(e.key)
      if (n >= 1 && n <= options.length) setPicked(options[n - 1].i)
      if (e.key === "Enter" && picked !== null) next()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (!bank)
    return (
      <div className={PAGE}>
        <PageHeader crumbs={[{ label: "Career", href: "/career" }, { label: "Assessments", href: "/career/assessments" }]} title="Assessment not found" />
        <Link href="/career/assessments" className="text-sm font-semibold text-primary">See all assessments</Link>
      </div>
    )

  function next() {
    if (!bank || !current || picked === null) return
    const all = [...asked, { q: current, picked }]
    const right = picked === 0
    setAsked(all)
    setPicked(null)
    setLevel((l) => (right ? Math.min(3, l + 1) : Math.max(1, l - 1)) as Level)
    if (all.length >= ASSESSMENT_LENGTH) finish(all)
  }

  function finish(all: { q: Question; picked: number }[]) {
    if (!bank) return
    const score = Math.round((100 * all.reduce((s, a) => s + (a.picked === 0 ? LEVEL_WEIGHT[a.q.level] : 0), 0)) / (all.length * LEVEL_WEIGHT[3]))
    const topics = [...new Set(all.map((a) => a.q.topic))]
    const breakdown = topics.map((t) => {
      const xs = all.filter((a) => a.q.topic === t)
      return { label: t, score: Math.round((xs.filter((a) => a.picked === 0).length / xs.length) * 100) }
    })
    const hardest = Math.max(...all.filter((a) => a.picked === 0).map((a) => a.q.level), 0)
    const id = saveResult({
      kind: "assessment",
      title: `${bank.skill} assessment`,
      subtitle: `${levelLabel(score)} · ${all.filter((a) => a.picked === 0).length} of ${all.length} right`,
      skill: bank.skill,
      score,
      breakdown,
      strengths: [...breakdown.filter((b) => b.score >= 75).map((b) => `${b.label}: solid`), hardest === 3 ? "Answered advanced questions correctly" : ""].filter(Boolean),
      improve: breakdown.filter((b) => b.score < 60).map((b) => `Review ${b.label.toLowerCase()}`),
      items: all.map((a) => ({ label: a.q.q, answer: a.q.options[a.picked], score: a.picked === 0 ? 1 : 0, max: 1, feedback: a.picked === 0 ? a.q.why : `Answer: ${a.q.options[0]}. ${a.q.why}` })),
      retryHref: `/career/assessments/${slug(bank.skill)}`,
      minutes: Math.max(1, Math.round((Date.now() - (started ?? Date.now())) / 60000)),
      selfRating: self ?? undefined,
    })
    router.push(`/career/results/${id}`)
  }

  const crumbs = [{ label: "Career", href: "/career" }, { label: "Assessments", href: "/career/assessments" }]
  const elapsed = started ? Math.max(0, Math.floor((now - started) / 1000)) : 0

  if (started === null)
    return (
      <div className={PAGE}>
        <PageHeader crumbs={crumbs} title={`${bank.skill} assessment`} description={bank.blurb} />
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-2xl border bg-card p-6">
          <PlatoNote label="Before you start">Seven questions, about eight minutes. Questions adapt to your answers, and you&apos;ll see an explanation for each one at the end. Your result updates your profile snapshot.</PlatoNote>
          <div className="flex flex-col gap-2.5">
            <b className="text-[15px]">How would you rate your {bank.skill} today?</b>
            <p className="-mt-1.5 text-[13px] text-text-secondary">Plato compares this with your result, so you know whether to aim higher or brush up.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {SELF.map((s, i) => (
                <button key={s} type="button" data-ai={`assessment.self.${i + 1}`} aria-pressed={self === i + 1} onClick={() => setSelf(i + 1)} className={cn("rounded-xl border px-2 py-2.5 text-[13px] font-medium transition-colors", self === i + 1 ? "border-primary bg-primary-soft text-primary" : "bg-card hover:border-primary-line")}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Link href="/career/assessments" className="text-sm font-semibold text-text-secondary hover:text-foreground">Back</Link>
            <Button data-ai="assessment.begin" onClick={() => (setStarted(Date.now()), setNow(Date.now()))} disabled={self === null}>
              Start assessment
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    )

  return (
    <div className={PAGE}>
      <PageHeader crumbs={crumbs} title={`${bank.skill} assessment`} />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <SessionBar label={current ? `Question ${asked.length + 1} · ${current.topic}` : "Scoring…"} step={asked.length + (current ? 1 : 0)} total={ASSESSMENT_LENGTH} onExit={<Link href="/career" data-ai="assessment.exit" className="font-semibold text-primary hover:underline">Exit</Link>} />
        {current && (
          <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between text-xs text-text-tertiary">
              <span className="flex gap-1" aria-label={`Difficulty ${current.level} of 3`}>
                {[1, 2, 3].map((l) => (
                  <span key={l} className={cn("h-1.5 w-5 rounded-full", l <= current.level ? "bg-primary" : "bg-divider")} />
                ))}
              </span>
              <span className="flex items-center gap-1 tabular-nums">
                <Clock className="size-3.5" />
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
              </span>
            </div>
            <h2 className="text-lg leading-snug font-bold">{current.q}</h2>
            <div role="radiogroup" className="flex flex-col gap-2">
              {options.map(({ o, i }, n) => (
                <button key={o} type="button" role="radio" aria-checked={picked === i} data-ai={`assessment.option:${n + 1}`} onClick={() => setPicked(i)} className={cn("flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-[14.5px] transition-colors", picked === i ? "border-primary bg-primary-tint" : "bg-card hover:border-primary-line")}>
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-bold", picked === i ? "border-primary bg-primary text-white" : "text-text-secondary")}>{picked === i ? <Check className="size-3.5" /> : n + 1}</span>
                  <span className="min-w-0 break-words">{o}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="hidden text-xs text-text-tertiary sm:block">Keys 1–4 to pick, Enter to continue</span>
              <Button data-ai="assessment.next" onClick={next} disabled={picked === null} className="ml-auto">
                {asked.length + 1 === ASSESSMENT_LENGTH ? "Finish and see results" : "Next question"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
