"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronDown, Clock, Loader2 } from "lucide-react"
import { PlatoMark } from "@/components/plato-orb"
import { Button } from "@/components/ui/button"
import { SessionBar } from "@/components/career-hub"
import type { InterviewQ } from "@/lib/career-hub/content"
import { scoreInterview } from "@/lib/career-hub/scoring"
import { saveResult, type HubKind } from "@/lib/career-hub/store"

const KIND_LABEL: Record<InterviewQ["kind"], string> = { behavioral: "Behavioral", technical: "Technical", situational: "Situational", motivation: "Motivation" }

// A written interview, one question at a time, scored at the end. Used by the general
// interview and by job simulations built from a pasted job description.
export function InterviewSession({ questions, title, subtitle, kind, retryHref, interviewer }: { questions: InterviewQ[]; title: string; subtitle: string; kind: HubKind; retryHref: string; interviewer: string }) {
  const router = useRouter()
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""))
  const [hint, setHint] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [startedAt] = useState(() => Date.now())
  const [qStart, setQStart] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const q = questions[i]
  const text = answers[i] ?? ""
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const secs = Math.floor((now - qStart) / 1000)
  const last = i === questions.length - 1

  function next() {
    if (!last) {
      setI(i + 1)
      setHint(false)
      setQStart(Date.now())
      return
    }
    setScoring(true)
    // A short pause so the scoring step reads as a step.
    setTimeout(() => {
      const s = scoreInterview(questions, answers)
      const id = saveResult({ kind, title, subtitle, score: s.overall, breakdown: s.breakdown, strengths: s.strengths, improve: s.improve, items: s.items, retryHref, minutes: Math.max(1, Math.round((Date.now() - startedAt) / 60000)) })
      router.push(`/career/results/${id}`)
    }, 900)
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <SessionBar label={`${title} · ${KIND_LABEL[q.kind]}`} step={i + 1} total={questions.length} onExit={<Link href="/career" data-ai="interview.session.exit" className="font-semibold text-primary hover:underline">Exit</Link>} />
      {/* Earlier answers stay visible, like a transcript. */}
      {questions.slice(0, i).map((pq, n) => (
        <div key={n} className="flex flex-col gap-1.5 rounded-2xl border bg-card/70 px-4 py-3 text-[13.5px]">
          <b className="text-text-secondary">{n + 1}. {pq.text}</b>
          <p className="line-clamp-2 whitespace-pre-wrap text-text-tertiary">{answers[n] || "(skipped)"}</p>
        </div>
      ))}
      <div className="flex flex-col gap-4 rounded-2xl border-2 border-primary-line bg-card p-5">
        <div className="flex items-start gap-3">
          <PlatoMark size={30} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-text-tertiary">{interviewer} asks</p>
            <h2 className="mt-0.5 text-[17px] leading-snug font-bold">{q.text}</h2>
          </div>
        </div>
        <button type="button" onClick={() => setHint((h) => !h)} className="flex items-center gap-1 self-start text-[13px] font-semibold text-primary">
          What a good answer covers
          <ChevronDown className={`size-4 transition-transform ${hint ? "rotate-180" : ""}`} />
        </button>
        {hint && <p className="-mt-2 rounded-lg bg-primary-tint px-3 py-2 text-[13px] text-foreground">{q.good}</p>}
        <textarea
          data-ai="interview.session.answer"
          value={text}
          onChange={(e) => setAnswers((a) => a.map((x, n) => (n === i ? e.target.value : x)))}
          rows={8}
          maxLength={4000}
          disabled={scoring}
          placeholder="Answer as you would out loud. Situation, what you did, and the result, with a number if you can."
          className="w-full rounded-xl border bg-background p-3.5 text-[14.5px] leading-relaxed outline-none focus:border-primary-line"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-tertiary">
          <span className="flex items-center gap-3 tabular-nums">
            <span className={words >= 60 ? "font-semibold text-success-ink" : ""}>{words} words{words < 60 ? " · aim for 60+" : ""}</span>
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
            </span>
          </span>
          <span className="flex items-center gap-2">
            {!last && (
              <Button variant="ghost" size="sm" onClick={next} disabled={scoring} data-ai="interview.session.skip">
                Skip
              </Button>
            )}
            <Button onClick={next} disabled={scoring || !text.trim()} data-ai="interview.session.next">
              {scoring && <Loader2 className="size-4 animate-spin" />}
              {scoring ? "Scoring your answers…" : last ? "Finish and get my score" : "Next question"}
            </Button>
          </span>
        </div>
      </div>
    </div>
  )
}
