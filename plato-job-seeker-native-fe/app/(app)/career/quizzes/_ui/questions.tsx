"use client"

import { useState } from "react"
import { Check, RotateCcw } from "lucide-react"
import { cn } from "cn"
import type { Answer, Choice, Question } from "@/lib/quizzes/contract"
import { FigureSvg } from "./figure"
import { MediaBlock } from "./media"

// One renderer per question type. Each is controlled: it shows `answer` and reports a new one.

type Props<T extends Question["type"]> = { q: Extract<Question, { type: T }>; answer: Extract<Answer, { type: T }> | null; onAnswer: (a: Extract<Answer, { type: T }>) => void }

const OPTION =
  "group flex min-h-12 w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left text-[15px] text-foreground transition-colors duration-150 hover:border-primary-line hover:bg-primary-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
const ON = "border-primary bg-primary-tint ring-1 ring-primary"

function Mark({ on, square }: { on: boolean; square?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-5 shrink-0 place-items-center border-2 transition-colors",
        square ? "rounded-md" : "rounded-full",
        on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
      )}
    >
      {on && (square ? <Check className="size-3.5" strokeWidth={3} /> : <span className="size-2 rounded-full bg-primary-foreground" />)}
    </span>
  )
}

function ChoiceBody({ c }: { c: Choice }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      {c.figure && <FigureSvg figure={c.figure} size={56} className="shrink-0" />}
      {c.text && <span className="min-w-0">{c.text}</span>}
    </span>
  )
}

export function SingleChoice({ q, answer, onAnswer }: Props<"single_choice">) {
  return (
    <div role="radiogroup" aria-label={q.prompt} className="flex flex-col gap-2.5">
      {q.choices.map((c) => {
        const on = answer?.choice === c.id
        return (
          <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => onAnswer({ type: "single_choice", choice: c.id })} className={cn(OPTION, on && ON)}>
            <Mark on={on} />
            <ChoiceBody c={c} />
          </button>
        )
      })}
    </div>
  )
}

export function MultiChoice({ q, answer, onAnswer }: Props<"multi_choice">) {
  const picked = answer?.choices ?? []
  const full = !!q.pick && picked.length >= q.pick
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm text-text-secondary">{q.pick ? `Choose ${q.pick}.` : "Choose all that apply."}</p>
      <div role="group" aria-label={q.prompt} className="flex flex-col gap-2.5">
        {q.choices.map((c) => {
          const on = picked.includes(c.id)
          return (
            <button
              key={c.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              disabled={!on && full}
              onClick={() => onAnswer({ type: "multi_choice", choices: on ? picked.filter((x) => x !== c.id) : [...picked, c.id] })}
              className={cn(OPTION, on && ON, "disabled:cursor-not-allowed disabled:opacity-50")}
            >
              <Mark on={on} square />
              <ChoiceBody c={c} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// A 1..N scale, like a hiring test's effectiveness rating: segmented buttons, the scale's meaning under the ends.
export function Rating({ q, answer, onAnswer }: Props<"rating">) {
  const values = Array.from({ length: q.scale.max - q.scale.min + 1 }, (_, i) => q.scale.min + i)
  return (
    <div className="flex flex-col gap-2">
      <div
        role="radiogroup"
        aria-label={`${q.prompt} (${q.scale.min} = ${q.scale.minLabel}, ${q.scale.max} = ${q.scale.maxLabel})`}
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}
      >
        {values.map((v) => {
          const on = answer?.value === v
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${v}${v === q.scale.min ? `, ${q.scale.minLabel}` : v === q.scale.max ? `, ${q.scale.maxLabel}` : ""}`}
              onClick={() => onAnswer({ type: "rating", value: v })}
              className={cn(
                "flex h-14 items-center justify-center rounded-xl border bg-card text-lg font-bold tabular-nums transition-colors duration-150 hover:border-primary-line hover:bg-primary-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                on ? "border-primary bg-primary text-primary-foreground hover:bg-primary" : "text-foreground",
              )}
            >
              {v}
            </button>
          )
        })}
      </div>
      <div className="flex justify-between gap-4 text-sm text-text-secondary">
        <span>{q.scale.minLabel}</span>
        <span className="text-right">{q.scale.maxLabel}</span>
      </div>
    </div>
  )
}

// Rank every item once. Tap items in order (1 first), or drag one onto a rank slot. Tap a filled slot to clear it.
export function Ranking({ q, answer, onAnswer }: Props<"ranking">) {
  const order = answer?.order ?? []
  const [drag, setDrag] = useState<string | null>(null)
  const text = (id: string) => q.items.find((i) => i.id === id)?.text ?? id
  const place = (id: string, at?: number) => {
    const rest = order.filter((x) => x !== id)
    const next = at === undefined ? [...rest, id] : [...rest.slice(0, at), id, ...rest.slice(at)]
    onAnswer({ type: "ranking", order: next.slice(0, q.items.length) })
  }
  const unplace = (id: string) => onAnswer({ type: "ranking", order: order.filter((x) => x !== id) })
  const left = q.items.filter((i) => !order.includes(i.id))
  return (
    <div className="flex flex-col gap-4">
      <ol aria-label="Your ranking" className="grid gap-2.5 sm:grid-cols-2">
        {q.items.map((_, i) => {
          const id = order[i]
          return (
            <li key={i} onDragOver={(e) => e.preventDefault()} onDrop={() => drag && place(drag, i)}>
              <button
                type="button"
                disabled={!id}
                onClick={() => id && unplace(id)}
                aria-label={id ? `Rank ${i + 1}: ${text(id)}. Press to clear.` : `Rank ${i + 1}: empty`}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  id ? "border-primary-line bg-primary-tint hover:border-primary" : "border-dashed bg-muted/40",
                )}
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold tabular-nums", id ? "bg-primary text-primary-foreground" : "bg-card text-text-tertiary")}>
                  {i + 1}
                </span>
                <span className={cn("min-w-0 flex-1 text-[15px]", id ? "font-medium text-foreground" : "text-text-tertiary")}>{id ? text(id) : `Rank ${i + 1}`}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {left.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">{order.length ? "Tap the next one, or drag it onto a rank." : "Tap the item you would rank first, then the next, or drag them onto the ranks."}</p>
          <div className="flex flex-wrap gap-2">
            {left.map((i) => (
              <button
                key={i.id}
                type="button"
                draggable
                onDragStart={() => setDrag(i.id)}
                onDragEnd={() => setDrag(null)}
                onClick={() => place(i.id)}
                className="min-h-11 cursor-grab rounded-xl border bg-card px-4 py-2 text-left text-[15px] font-medium text-foreground shadow-card transition-colors duration-150 hover:border-primary-line hover:bg-primary-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:cursor-grabbing"
              >
                {i.text}
              </button>
            ))}
          </div>
        </div>
      )}
      {order.length > 0 && (
        <button
          type="button"
          onClick={() => onAnswer({ type: "ranking", order: [] })}
          className="inline-flex items-center gap-1.5 self-start rounded-lg px-2 py-1 text-sm font-semibold text-primary hover:bg-primary-tint"
        >
          <RotateCcw className="size-3.5" /> Start over
        </button>
      )}
    </div>
  )
}

// Two statements; choose one and how strongly it describes you (Most like me / More like me, either side).
export function WorkStyle({ q, answer, onAnswer }: Props<"work_style">) {
  const opts = [
    { side: "left", strength: "most", label: "Most like me" },
    { side: "left", strength: "more", label: "More like me" },
    { side: "right", strength: "more", label: "More like me" },
    { side: "right", strength: "most", label: "Most like me" },
  ] as const
  const on = (o: (typeof opts)[number]) => answer?.side === o.side && answer.strength === o.strength
  const lean = answer?.side
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {(["left", "right"] as const).map((side) => (
          <div key={side} className={cn("flex min-h-28 flex-col gap-2 rounded-2xl border bg-card p-5 transition-colors", lean === side && "border-primary bg-primary-tint")}>
            <span className="text-xs font-semibold tracking-[0.08em] text-text-tertiary uppercase">Statement {side === "left" ? "A" : "B"}</span>
            <p className="text-[17px] leading-snug font-semibold text-foreground">{side === "left" ? q.left : q.right}</p>
          </div>
        ))}
      </div>
      <div role="radiogroup" aria-label="How strongly does it describe you?" className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_1fr_auto_1fr_1fr]">
        {opts.map((o, i) => (
          <div key={i} className={cn("contents", i === 2 && "sm:contents")}>
            {i === 2 && (
              <span aria-hidden className="col-span-2 mx-auto rounded-md bg-foreground px-2 py-1 text-xs font-bold text-background sm:col-span-1">
                ‹ or ›
              </span>
            )}
            <button
              type="button"
              role="radio"
              aria-checked={on(o)}
              aria-label={`Statement ${o.side === "left" ? "A" : "B"}: ${o.label}`}
              onClick={() => onAnswer({ type: "work_style", side: o.side, strength: o.strength })}
              className={cn(OPTION, "min-h-14 justify-between", on(o) && ON)}
            >
              <span className="text-sm font-semibold">
                <span className="mr-1 text-text-tertiary">{o.side === "left" ? "A" : "B"}</span>
                {o.label}
              </span>
              <Mark on={on(o)} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// A sequence of figures with the next one missing; choose the figure that comes next.
export function Pattern({ q, answer, onAnswer }: Props<"pattern">) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-muted/40 p-3" aria-label="The sequence">
        {q.sequence.map((f, i) => (
          <span key={i} className="grid place-items-center rounded-xl border bg-card p-1.5">
            <FigureSvg figure={f} size={76} label={`Figure ${i + 1}`} />
          </span>
        ))}
        <span className="grid size-[90px] place-items-center rounded-xl border-2 border-dashed border-primary-line bg-primary-tint text-3xl font-bold text-primary" aria-label="The missing figure">
          ?
        </span>
      </div>
      <div role="radiogroup" aria-label="Which figure comes next?" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {q.choices.map((c, i) => {
          const on = answer?.choice === c.id
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`Option ${String.fromCharCode(65 + i)}`}
              onClick={() => onAnswer({ type: "pattern", choice: c.id })}
              className={cn(OPTION, "flex-col justify-center gap-1 p-3", on && ON)}
            >
              {c.figure ? <FigureSvg figure={c.figure} size={84} /> : <span>{c.text}</span>}
              <span className="text-xs font-semibold text-text-tertiary">{String.fromCharCode(65 + i)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The question's own prompt and media, then its answer control. */
export function QuestionView({ q, answer, onAnswer }: { q: Question; answer: Answer | null; onAnswer: (a: Answer) => void }) {
  const prompt = q.type === "work_style" ? "Choose the statement that describes you better, and how strongly." : q.prompt
  const a = (t: Question["type"]) => (answer?.type === t ? answer : null)
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-xl leading-snug font-semibold tracking-tight text-foreground">{prompt}</h2>
      {q.media?.map((m, i) => (
        <MediaBlock key={i} m={m} />
      ))}
      {q.type === "single_choice" && <SingleChoice q={q} answer={a("single_choice") as never} onAnswer={onAnswer} />}
      {q.type === "multi_choice" && <MultiChoice q={q} answer={a("multi_choice") as never} onAnswer={onAnswer} />}
      {q.type === "rating" && <Rating q={q} answer={a("rating") as never} onAnswer={onAnswer} />}
      {q.type === "ranking" && <Ranking q={q} answer={a("ranking") as never} onAnswer={onAnswer} />}
      {q.type === "work_style" && <WorkStyle q={q} answer={a("work_style") as never} onAnswer={onAnswer} />}
      {q.type === "pattern" && <Pattern q={q} answer={a("pattern") as never} onAnswer={onAnswer} />}
    </div>
  )
}

/** Whether an answer is complete for its question (a ranking needs every item ranked). */
export function isAnswered(q: Question, a: Answer | null | undefined) {
  if (!a || a.type !== q.type) return false
  if (a.type === "multi_choice") return q.type === "multi_choice" && (q.pick ? a.choices.length === q.pick : a.choices.length > 0)
  if (a.type === "ranking") return q.type === "ranking" && a.order.length === q.items.length
  return true
}

/** The answer in words, for the review and results screens. */
export function answerText(q: Question, a: Answer | null | undefined): string {
  if (!a) return "Not answered"
  if (a.type === "single_choice" || a.type === "pattern") {
    const choices = q.type === "single_choice" || q.type === "pattern" ? q.choices : []
    const i = choices.findIndex((c) => c.id === a.choice)
    return choices[i]?.text ?? `Option ${String.fromCharCode(65 + Math.max(0, i))}`
  }
  if (a.type === "multi_choice")
    return q.type === "multi_choice"
      ? q.choices
          .filter((c) => a.choices.includes(c.id))
          .map((c) => c.text ?? c.id)
          .join(", ")
      : ""
  if (a.type === "rating") return q.type === "rating" ? `${a.value} of ${q.scale.max}` : String(a.value)
  if (a.type === "ranking") return q.type === "ranking" ? a.order.map((id, i) => `${i + 1}. ${q.items.find((x) => x.id === id)?.text ?? id}`).join("  ") : ""
  return `${a.side === "left" ? "A" : "B"} · ${a.strength === "most" ? "Most like me" : "More like me"}`
}
