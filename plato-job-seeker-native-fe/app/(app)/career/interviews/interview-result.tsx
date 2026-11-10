"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, ChevronDown, Compass, ListChecks, MessagesSquare, Mic, RotateCcw, Sparkles, Target } from "lucide-react"
import { cn } from "cn"
import { CARD, SectionHeader, StatusPill } from "@/components/plato-ui"
import { InfoTip } from "@/components/info-tip"
import { CareerGlow, Meter, OUTLINE_CTA, ScoreRing, scoreTone } from "@/components/career-hub"
import type { Interview } from "@/lib/interviews/api"
import type { VoiceScorecard } from "@/lib/career/api"
import type { HubResult } from "@/lib/career-hub/store"
import { interviewName, styleLabel, type FlowAnswers } from "@/lib/interviews/flow"

// One result screen for every interview, written or spoken: the score and what it means,
// what went well and what to work on, every answer with its feedback, and one next step.
export type ResultItem = { question: string; answer?: string; followUp?: string; followUpAnswer?: string; score?: number; feedback?: string; better?: string }
export type ResultModel = {
  title: string
  how: "chat" | "voice"
  style: "real" | "coach"
  when: string
  minutes?: number
  score: number
  communication?: { score: number; note: string }
  strengths: string[]
  gaps: string[]
  nextSteps: string[]
  items: ResultItem[]
  againHref: string
}

const HOW_SCORED = "Plato's interviewer scores each answer 1–5 (an unanswered one counts as 1) against the job or role. The total is your answers' average and your communication score, half each, out of 100. 75+ holds up in a real interview; 55+ is a solid base."
const meaning = (n: number) => (n >= 75 ? "Answers like these hold up in a real interview. Keep them fresh before the real one." : n >= 55 ? "A solid base. Tighten the structure and back each answer with a result or a number." : "Start with the feedback on each answer below, then practise again.")
const verdict = (n: number) => (n >= 75 ? "Strong result" : n >= 55 ? "Solid base, room to grow" : "A clear starting point")
const itemTone = (s: number) => (s >= 4 ? "bg-success-soft text-success-ink" : s >= 3 ? "bg-warning-soft text-warning-ink" : "bg-danger-soft text-destructive")

export function InterviewResult({ r }: { r: ResultModel }) {
  const [open, setOpen] = useState<number | null>(null)
  const next = r.nextSteps[0] ?? r.gaps[0] ?? null
  return (
    <div className="flex flex-col gap-6 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 motion-reduce:animate-none">
      <div className="flex flex-col gap-1.5">
        <p className="eyebrow">Your result</p>
        <h1 className="text-[26px] leading-tight font-extrabold tracking-tight text-balance text-foreground sm:text-[30px]">{r.title}</h1>
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
          <StatusPill tone="primary">
            {r.how === "voice" ? <Mic className="size-3" /> : <MessagesSquare className="size-3" />}
            {r.how === "voice" ? "Voice" : "Chat"}
          </StatusPill>
          <StatusPill tone="neutral">{styleLabel(r.style)}</StatusPill>
          <span>
            {new Date(r.when).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}
            {r.minutes ? ` · ${r.minutes} min` : ""}
          </span>
        </p>
      </div>

      <section data-tour="results-score" aria-label="Score" className={cn(CARD, "relative isolate flex flex-col gap-5 overflow-hidden p-5 sm:flex-row sm:items-center sm:p-6")}>
        <CareerGlow />
        <div className="flex items-center gap-4 sm:w-[190px] sm:shrink-0 sm:flex-col sm:gap-2 sm:text-center">
          <ScoreRing value={r.score} size={112} />
          <span>
            <b className={cn("block text-sm", scoreTone(r.score))}>{verdict(r.score)}</b>
            <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
              out of 100
              <InfoTip text={HOW_SCORED} label="How this score is worked out" />
            </span>
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <div>
            <p className="eyebrow">What it means</p>
            <p className="mt-1 text-[14.5px] leading-relaxed text-foreground">{meaning(r.score)}</p>
          </div>
          {r.communication && <Meter label="Communication" value={r.communication.score * 20} hint={r.communication.note} tone />}
        </div>
      </section>

      <div data-tour="results-feedback" className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className={cn(CARD, "flex flex-col gap-3 border-l-[3px] border-l-success p-4")}>
          <SectionHeader as="h3" title="What went well" icon={Sparkles} accent="green" />
          <ul className="flex flex-col gap-1.5 text-[13.5px]">
            {(r.strengths.length ? r.strengths : ["You finished it. That's the first data point."]).map((s) => (
              <li key={s} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className={cn(CARD, "flex flex-col gap-3 border-l-[3px] border-l-warning p-4")}>
          <SectionHeader as="h3" title="What to work on" icon={Target} accent="amber" />
          <ul className="flex flex-col gap-1.5 text-[13.5px]">
            {(r.gaps.length ? r.gaps : ["Nothing major. Try a harder round next."]).map((s) => (
              <li key={s} className="flex gap-2">
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-warning" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {r.items.length > 0 && (
        <section data-tour="results-items" className="flex flex-col gap-3">
          <SectionHeader title="Answer by answer" icon={ListChecks} accent="cobalt" />
          <div className={cn(CARD, "overflow-hidden")}>
            {r.items.map((it, i) => {
              const has = !!(it.answer || it.followUpAnswer || it.better)
              return (
                <div key={i} className="border-b border-divider last:border-b-0">
                  <button type="button" data-ai={`interview.result.item:${i}`} onClick={() => setOpen(open === i ? null : i)} aria-expanded={has ? open === i : undefined} disabled={!has} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-200 enabled:hover:bg-muted/40 disabled:cursor-default">
                    <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums", it.score ? itemTone(it.score) : "bg-muted text-text-tertiary")}>{it.score ?? i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-[14px] leading-snug">{it.question}</b>
                      {it.feedback && <span className="mt-0.5 block text-[13px] text-text-secondary">{it.feedback}</span>}
                    </span>
                    {has && <ChevronDown className={cn("mt-1 size-4 shrink-0 text-text-tertiary transition-transform duration-200", open === i && "rotate-180")} />}
                  </button>
                  {open === i && has && (
                    <div className="mx-4 mb-3 flex flex-col gap-2 text-[13px]">
                      {it.answer && <p className="rounded-lg bg-muted px-3 py-2 whitespace-pre-wrap text-text-secondary">{it.answer}</p>}
                      {it.followUp && <p className="font-semibold text-foreground">Follow-up: {it.followUp}</p>}
                      {it.followUpAnswer && <p className="rounded-lg bg-muted px-3 py-2 whitespace-pre-wrap text-text-secondary">{it.followUpAnswer}</p>}
                      {it.better && (
                        <p className="border-l-[3px] border-l-primary pl-3 text-foreground">
                          <b>A stronger way to say it: </b>
                          {it.better}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section data-tour="results-next" className={cn(CARD, "relative isolate flex flex-col gap-4 overflow-hidden p-5 sm:p-6")}>
        <CareerGlow />
        <SectionHeader title="Your next step" icon={Compass} accent="cobalt" />
        <p className="text-[15px] leading-relaxed text-foreground">{next ?? "Practise once more while the feedback is fresh, then try a harder round."}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={r.againHref} data-ai="interview.again" className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-colors duration-200 hover:bg-primary-hover">
            <RotateCcw className="size-4" />
            Practise again
          </Link>
          <Link href="/career/interviews" data-ai="interview.back" className={cn(OUTLINE_CTA, "h-11 rounded-xl px-4")}>
            Back to Interviews
          </Link>
          <Link href="/career/snapshot" data-ai="interview.snapshot" className="ml-auto text-[13px] font-semibold text-primary transition-colors duration-200 hover:text-primary-hover">
            See your snapshot
          </Link>
        </div>
      </section>
    </div>
  )
}

// ---- Adapters: every kind of interview into the one result ----

// The flow preset that runs the same interview again (it opens on the summary).
export function againFromInterview(iv: Interview) {
  const q = new URLSearchParams({ how: "chat", style: iv.style ?? "real" })
  if (iv.format && iv.format !== "standard") q.set("format", iv.format)
  if (iv.target === "general") {
    q.set("target", iv.format && iv.format !== "standard" ? "situation" : "general")
    if (iv.role || iv.jobTitle) q.set("role", (iv.role || iv.jobTitle).slice(0, 80))
    if (iv.focus) q.set("focus", iv.focus)
  } else {
    q.set("target", "job")
    q.set("retry", iv.id)
    q.set("jt", iv.jobTitle)
    if (iv.company) q.set("jc", iv.company)
    if (iv.round) q.set("round", iv.round)
  }
  return `/career/interviews/new?${q}`
}

export function fromInterview(iv: Interview): ResultModel {
  const card = iv.scorecard!
  return {
    title: interviewName({ target: iv.target, jobTitle: iv.target === "general" ? undefined : iv.jobTitle, round: iv.round, focus: iv.focus, format: iv.format }),
    how: "chat",
    style: iv.style ?? "real",
    when: iv.completedAt ?? iv.createdAt,
    minutes: iv.completedAt ? Math.max(1, Math.round((new Date(iv.completedAt).getTime() - new Date(iv.createdAt).getTime()) / 60000)) : undefined,
    score: card.overall,
    communication: card.communication,
    strengths: card.strengths,
    gaps: card.gaps,
    nextSteps: card.nextSteps,
    items: iv.turns.map((t, i) => {
      const fb = card.questions.find((q) => q.index === i)
      return { question: t.question, answer: t.answer, followUp: t.followUp, followUpAnswer: t.followUpAnswer, score: fb?.score ?? t.feedback?.score, feedback: fb?.feedback ?? t.feedback?.note, better: t.feedback?.better }
    }),
    againHref: againFromInterview(iv),
  }
}

// A voice call's scorecard, kept in this browser as a Career result (so it counts in the
// snapshot and shows in the history).
export function voiceResult(card: VoiceScorecard, a: FlowAnswers, title: string, minutes: number): Omit<HubResult, "id" | "createdAt"> {
  const again = new URLSearchParams(Object.entries(a).filter(([, v]) => !!v) as [string, string][])
  return {
    kind: a.target === "job" ? "simulation" : "interview",
    title,
    subtitle: [a.jc, a.role].filter(Boolean).join(" · "),
    score: card.overall,
    breakdown: [],
    strengths: card.strengths,
    improve: card.gaps,
    nextSteps: card.nextSteps,
    communication: card.communication,
    how: "voice",
    style: a.style ?? "real",
    items: card.questions.map((q) => ({ label: q.question, answer: q.answer || undefined, score: q.score, max: 5, feedback: q.feedback })),
    retryHref: `/career/interviews/new?${again}`,
    minutes,
  }
}

// Any interview kept in this browser (voice calls, and the older written practice).
export function fromHub(r: HubResult): ResultModel {
  return {
    title: r.title,
    how: r.how ?? "chat",
    style: r.style ?? "real",
    when: r.createdAt,
    minutes: r.minutes,
    score: r.score,
    communication: r.communication,
    strengths: r.strengths,
    gaps: r.improve,
    nextSteps: r.nextSteps ?? [],
    items: r.items.map((it) => ({ question: it.label, answer: it.answer, score: it.score, feedback: it.feedback })),
    // Older practice links pointed at the removed setup pages; they all start the flow now.
    againHref: r.retryHref.startsWith("/career/interviews/new") ? r.retryHref : `/career/interviews/new?target=${r.kind === "simulation" ? "job" : "general"}`,
  }
}
