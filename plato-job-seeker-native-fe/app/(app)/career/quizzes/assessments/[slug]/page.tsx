"use client"

import { type ReactNode, use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Clock, ListChecks, Loader2, Play, RotateCcw, Scale, Send, Timer } from "lucide-react"
import { cn } from "cn"
import { PAGE } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { getAssessment, submitAssessment } from "@/lib/quizzes/api"
import type { AssessmentAnswer, AssessmentDetail } from "@/lib/quizzes/contract"
import { LikertQuestion } from "../../_ui/likert"
import { ElementPalette, MatrixGrid } from "../../_ui/matrix"
import { ActionBar, AttemptsCard, BTN_PRIMARY, BTN_SECONDARY, CATEGORY, MainCard, mmss, Navigator, ProgressTop, SideCard, TestHeader, TestLayout } from "../../_ui/shell"
import { useLeaveGuard } from "@/lib/use-leave-guard"

// A standard assessment: intro, then one item per screen in the same frame, then the results page.
// Progress (answers, position, the deadline) is kept in this tab, so a refresh never loses it.

type Saved = { phase: "intro" | "play"; i: number; answers: Record<string, AssessmentAnswer>; startedAt: number; deadline: number | null }
const KEY = (slug: string) => `plato:assessment:${slug}`
const load = (slug: string): Saved | null => {
  try {
    const v = sessionStorage.getItem(KEY(slug))
    return v ? (JSON.parse(v) as Saved) : null
  } catch {
    return null
  }
}
const save = (slug: string, v: Saved | null) => {
  try {
    if (v) sessionStorage.setItem(KEY(slug), JSON.stringify(v))
    else sessionStorage.removeItem(KEY(slug))
  } catch {
    /* storage off: the test still works; a refresh starts over */
  }
}
// ponytail: wall clock behind a function so render-purity lint can't confuse handlers with render
const now = () => Date.now()

export default function AssessmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()
  const [a, setA] = useState<AssessmentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [s, setS] = useState<Saved>({ phase: "intro", i: 0, answers: {}, startedAt: 0, deadline: null })
  const [left, setLeft] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [confirm, setConfirm] = useState(false)
  useLeaveGuard(s.phase === "play" && !sending, "Your assessment is in progress. Leave now? Your answers stay in this tab" + (a?.timeLimitSec ? ", but the clock keeps running." : "."))

  useEffect(() => {
    getAssessment(slug)
      .then((d) => {
        setA(d)
        const v = load(slug)
        if (v?.phase === "play") setS(v)
      })
      .catch((e: Error) => setError(e.message))
  }, [slug])

  const update = useCallback(
    (f: (p: Saved) => Saved) =>
      setS((p) => {
        const n = f(p)
        save(slug, n)
        return n
      }),
    [slug],
  )

  const items = a?.items ?? []
  const item = items[s.i]
  const answered = (i: number) => !!items[i] && !!s.answers[items[i].id] && (s.answers[items[i].id].type !== "matrix" || (s.answers[items[i].id] as { mask: string }).mask.includes("1"))
  const done = items.filter((_, i) => answered(i)).length
  const open = items.length - done

  const submit = useCallback(async () => {
    if (!a) return
    setSending(true)
    setError(null)
    try {
      const answers = Object.fromEntries(Object.entries(s.answers).filter(([, v]) => v.type !== "matrix" || v.mask.includes("1")))
      const r = await submitAssessment(slug, { answers, seconds: Math.round((now() - s.startedAt) / 1000) })
      save(slug, null)
      router.push(`/career/quizzes/assessments/${slug}/results/${r.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit")
      setSending(false)
    }
  }, [a, router, s.answers, s.startedAt, slug])

  // the clock: reasoning tests only; at zero the answers so far are submitted
  const submitRef = useRef(submit)
  useEffect(() => {
    submitRef.current = submit
  }, [submit])
  useEffect(() => {
    if (s.phase !== "play" || !s.deadline) return
    const tick = () => {
      const l = Math.round((s.deadline! - now()) / 1000)
      setLeft(l)
      if (l <= 0) void submitRef.current()
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [s.phase, s.deadline])

  const start = () => {
    setConfirm(false)
    update(() => ({ phase: "play", i: 0, answers: {}, startedAt: now(), deadline: a?.timeLimitSec ? now() + a.timeLimitSec * 1000 : null }))
    window.scrollTo({ top: 0 })
  }
  const go = useCallback(
    (i: number) => {
      setConfirm(false)
      update((p) => ({ ...p, i: Math.max(0, Math.min(items.length - 1, i)) }))
    },
    [items.length, update],
  )
  const answer = useCallback((id: string, v: AssessmentAnswer) => update((p) => ({ ...p, answers: { ...p.answers, [id]: v } })), [update])

  const last = s.i === items.length - 1
  const next = () => {
    if (!last) return go(s.i + 1)
    if (open > 0 && !confirm) return setConfirm(true)
    void submit()
  }

  // keys: 1-5 answer a statement (and move on), arrows move
  const pickLikert = useCallback(
    (v: number) => {
      if (!item || item.type !== "likert") return
      answer(item.id, { type: "likert", value: v })
      if (s.i < items.length - 1) setTimeout(() => go(s.i + 1), 180)
    },
    [answer, go, item, items.length, s.i],
  )
  useEffect(() => {
    if (s.phase !== "play") return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return
      if (/^[1-5]$/.test(e.key) && item?.type === "likert") pickLikert(Number(e.key))
      if (e.key === "ArrowRight" && s.i < items.length - 1) go(s.i + 1)
      if (e.key === "ArrowLeft" && s.i > 0) go(s.i - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, item, items.length, pickLikert, s.i, s.phase])

  const cat = a ? CATEGORY[a.category] : null
  const attempts = useMemo(() => <AttemptsCard items={a?.history ?? []} hrefOf={(id) => `/career/quizzes/assessments/${slug}/results/${id}`} />, [a?.history, slug])

  if (error && !a)
    return (
      <div className={PAGE}>
        <TestHeader title="Assessment" />
        <p role="alert" className="rounded-2xl border bg-card p-6 text-sm text-destructive">
          {error}
        </p>
      </div>
    )
  if (!a || !cat)
    return (
      <div className={PAGE}>
        <Skeleton className="h-16 w-80 rounded-xl" />
        <TestLayout main={<Skeleton className="h-[520px] rounded-2xl" />} side={<Skeleton className="h-64 rounded-2xl" />} />
      </div>
    )

  const Icon = cat.icon

  // ---- intro --------------------------------------------------------------------------------------------------
  if (s.phase === "intro")
    return (
      <div className={PAGE}>
        <TestHeader eyebrow={cat.label} title={a.title} />
        <TestLayout
          main={
            <MainCard
              bar={
                <ActionBar
                  left={
                    <Link href="/career/quizzes" className={BTN_SECONDARY}>
                      <ArrowLeft className="size-4" /> All assessments
                    </Link>
                  }
                  note={a.timeLimitSec ? `The clock starts when you press ${a.attempts ? "Retake" : "Start"}.` : "No time limit. Takes about " + a.minutes + " minutes."}
                  right={
                    <button type="button" onClick={start} className={BTN_PRIMARY}>
                      {a.attempts ? <RotateCcw className="size-4" /> : <Play className="size-4" />} {a.attempts ? "Retake" : "Start"}
                    </button>
                  }
                />
              }
            >
              <div className="flex flex-col gap-7">
                <div className="flex items-start gap-4">
                  <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", cat.tint)}>
                    <Icon className="size-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] leading-relaxed text-text-secondary">{a.about}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Chip icon={ListChecks}>{a.questionCount} questions</Chip>
                      <Chip icon={Clock}>About {a.minutes} min</Chip>
                      {a.timeLimitSec ? <Chip icon={Timer}>Timed · {Math.round(a.timeLimitSec / 60)} min</Chip> : <Chip icon={Timer}>Untimed</Chip>}
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="mb-2.5 text-sm font-semibold text-foreground">What it measures</h2>
                  <div className="flex flex-wrap gap-1.5">
                    {a.measures.map((m) => (
                      <span key={m} className="rounded-full border bg-card px-3 py-1 text-sm text-foreground">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="mb-3 text-sm font-semibold text-foreground">How it works</h2>
                  <ol className="grid gap-3">
                    {a.instructions.map((t, i) => (
                      <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-text-secondary">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary tabular-nums">{i + 1}</span>
                        {t}
                      </li>
                    ))}
                  </ol>
                </div>

                {a.example && (
                  <div className="rounded-2xl border bg-muted/30 p-5">
                    <h2 className="mb-1 text-sm font-semibold text-foreground">Worked example</h2>
                    <p className="mb-4 text-sm text-text-secondary">In each row, the third cell is the first two put together. So the missing cell is the bottom-left plus the bottom-middle.</p>
                    <div className="flex flex-wrap items-center gap-6">
                      <MatrixGrid cells={a.example.cells.slice(0, 8)} answer={a.example.answer} answerTone="right" className="max-w-[240px]" />
                      <p className="max-w-xs text-sm text-text-secondary">
                        The green cell is the answer you would build by picking its parts. In the test, the missing cell starts empty and fills in as you pick.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </MainCard>
          }
          side={
            <>
              {attempts}
              <SideCard title="About the scores" icon={Scale}>
                <p className="text-sm leading-relaxed text-text-secondary">
                  {a.category === "reasoning"
                    ? "Your result is a percentile against the 2,572 people the items were calibrated with (medical-school applicants), so it reads a little low for the general population. Every set you take also refines one pooled reasoning score on your profile."
                    : "There are no right answers. Each trait is scored from 0 to 100 on the scale's own range; the results explain what high and low mean. Your latest results feed your candidate profile."}
                </p>
              </SideCard>
              <SideCard title="Source" icon={BookOpen}>
                <p className="text-sm text-text-secondary">
                  <a href={a.source.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                    {a.source.name}
                  </a>{" "}
                  · {a.source.license}. Validated items; the AI does not write these questions.
                </p>
              </SideCard>
            </>
          }
        />
      </div>
    )

  // ---- questions ----------------------------------------------------------------------------------------------
  const given = item ? s.answers[item.id] : undefined
  return (
    <div className={PAGE}>
      <TestHeader eyebrow={cat.label} title={a.title} back={{ href: "/career/quizzes", label: "Leave (your progress is kept in this tab)" }} />
      <TestLayout
        main={
          <MainCard
            top={<ProgressTop label={item?.type === "matrix" ? "Complete the grid" : "Describe yourself"} index={s.i} total={items.length} answered={done} timeLeft={a.timeLimitSec ? left : null} />}
            bar={
              <ActionBar
                left={
                  <button type="button" onClick={() => go(s.i - 1)} disabled={s.i === 0 || sending} className={BTN_SECONDARY}>
                    <ArrowLeft className="size-4" /> Back
                  </button>
                }
                note={
                  error ? (
                    <span role="alert" className="text-destructive">
                      {error}
                    </span>
                  ) : confirm ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-warning-ink">
                      <AlertTriangle className="size-4" /> {open} unanswered {a.category === "reasoning" ? "(they count as wrong)" : "(left out of your scores)"}
                    </span>
                  ) : item?.type === "likert" ? (
                    <span className="hidden sm:inline">Tip: press 1–5 to answer</span>
                  ) : null
                }
                right={
                  <button type="button" onClick={next} disabled={sending} className={BTN_PRIMARY}>
                    {sending ? <Loader2 className="size-4 animate-spin" /> : last ? <Send className="size-4" /> : null}
                    {last ? (confirm ? "Submit anyway" : "Submit") : "Next"}
                    {!last && <ArrowRight className="size-4" />}
                  </button>
                }
              />
            }
          >
            {item?.type === "matrix" ? (
              <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="flex flex-col items-center gap-3">
                  <MatrixGrid cells={item.cells} answer={given?.type === "matrix" ? given.mask : null} size="lg" />
                  <p className="text-center text-sm text-text-tertiary">Find the rule in each row, then build the missing cell.</p>
                </div>
                <ElementPalette mask={given?.type === "matrix" ? given.mask : "0".repeat(20)} onChange={(mask) => answer(item.id, { type: "matrix", mask })} disabled={sending} />
              </div>
            ) : item?.type === "likert" ? (
              <div className="mx-auto max-w-3xl py-2 sm:py-6">
                <LikertQuestion text={item.text} value={given?.type === "likert" ? given.value : null} onPick={pickLikert} />
              </div>
            ) : null}
          </MainCard>
        }
        side={
          <>
            <Navigator total={items.length} current={s.i} isAnswered={answered} onJump={go} />
            <SideCard title="Before you submit" icon={Send}>
              <p className="text-sm text-text-secondary">{open === 0 ? "Everything is answered. Submit from the last question, or now." : `${open} still open. You can jump to any question above.`}</p>
              <button type="button" onClick={() => (open > 0 && !confirm ? (go(items.length - 1), setConfirm(true)) : void submit())} disabled={sending} className={cn(BTN_SECONDARY, "mt-3 w-full")}>
                Finish now {a.timeLimitSec && left != null ? <span className="text-text-tertiary tabular-nums">· {mmss(left)} left</span> : null}
              </button>
            </SideCard>
          </>
        }
      />
    </div>
  )
}

function Chip({ icon: Icon, children }: { icon: typeof Clock; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium text-text-secondary tabular-nums">
      <Icon className="size-3.5" /> {children}
    </span>
  )
}
