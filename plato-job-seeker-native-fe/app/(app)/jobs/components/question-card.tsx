"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowLeft, ArrowRight, Check, Plus } from "lucide-react"
import { cn } from "cn"
import type { CardQuestion, Choice, QuestionCard, SalaryAnswer, ThreadMessage } from "@/lib/jobs/api"
import { Input } from "@/components/ui/input"

type Answer = string | string[] | SalaryAnswer | null

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "AED", "SAR", "EGP", "INR"]
// How each answer reads in the message Plato receives.
const LEAD: Record<string, string> = {
  residence_country: "Where I live now",
  target_countries: "Countries I want to work in",
  work_setup: "How I want to work",
  visa: "Visa sponsorship",
  employment: "Employment",
  min_salary: "Minimum salary",
}

// The card is open only while it is the last thing said: once the seeker has
// replied it becomes history and the reply carries their answers.
export function pendingCardId(messages: ThreadMessage[]) {
  const last = messages.at(-1)
  return last?.role === "ASSISTANT" && last.ui ? last.id : null
}

function Chip({ label, selected, onClick, disabled }: { label: string; selected: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
        selected ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {selected && <Check className="size-3.5" />}
      {label}
    </button>
  )
}

// Countries: tap a suggestion, or type any other country or city.
function OtherPlace({ onAdd, disabled }: { onAdd: (text: string) => void; disabled?: boolean }) {
  const [text, setText] = useState("")
  function add() {
    const t = text.trim()
    if (!t) return
    onAdd(t)
    setText("")
  }
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            add()
          }
        }}
        placeholder="Other country or city…"
        className="h-9 w-48 text-sm"
      />
      <button type="button" disabled={disabled || !text.trim()} onClick={add} aria-label="Add" className="flex size-9 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted disabled:opacity-40">
        <Plus className="size-4" />
      </button>
    </div>
  )
}

function Field({
  q,
  value,
  extras,
  onChange,
  onAddExtra,
  disabled,
}: {
  q: CardQuestion
  value: Answer
  extras: Choice[]
  onChange: (v: Answer) => void
  onAddExtra: (c: Choice) => void
  disabled?: boolean
}) {
  const options = [...(q.options ?? []), ...extras]
  if (q.kind === "salary") {
    const s = (value as SalaryAnswer | null) ?? { amount: null, currency: "USD", period: "MONTHLY" as const }
    const set = (patch: Partial<SalaryAnswer>) => onChange({ ...s, ...patch })
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          disabled={disabled}
          value={s.amount ?? ""}
          onChange={(e) => set({ amount: e.target.value === "" ? null : Number(e.target.value) })}
          placeholder="e.g. 3000"
          className="h-9 w-32 text-sm"
        />
        <select
          value={s.currency}
          disabled={disabled}
          onChange={(e) => set({ currency: e.target.value })}
          aria-label="Currency"
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
        >
          {[...new Set([s.currency, ...CURRENCIES])].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {(["MONTHLY", "YEARLY"] as const).map((p) => (
          <Chip key={p} disabled={disabled} label={p === "MONTHLY" ? "per month" : "per year"} selected={s.period === p} onClick={() => set({ period: p })} />
        ))}
      </div>
    )
  }

  const multi = q.kind === "countries" || q.kind === "multi"
  const chosen = multi ? ((value as string[] | null) ?? []) : value ? [value as string] : []
  const toggle = (v: string) => {
    if (multi) onChange(chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v])
    else onChange(v)
  }
  const isCountry = q.kind === "country" || q.kind === "countries"
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o.value} disabled={disabled} label={o.label} selected={chosen.includes(o.value)} onClick={() => toggle(o.value)} />
        ))}
      </div>
      {isCountry && (
        <OtherPlace
          disabled={disabled}
          onAdd={(text) => {
            onAddExtra({ value: text, label: text })
            toggle(text)
          }}
        />
      )}
    </div>
  )
}

function summarize(card: QuestionCard, answers: Record<string, Answer>, extras: Record<string, Choice[]>) {
  const lines = card.questions.map((q) => {
    const a = answers[q.id]
    const options = [...(q.options ?? []), ...(extras[q.id] ?? [])]
    const label = (v: string) => {
      const o = options.find((x) => x.value === v)
      // ISO codes travel with the name so the country is never ambiguous.
      return o && (q.kind === "country" || q.kind === "countries") && o.value !== o.label ? `${o.label} (${o.value})` : (o?.label ?? v)
    }
    let text = "not answered"
    if (q.kind === "salary") {
      const s = a as SalaryAnswer | null
      text = s?.amount ? `${s.amount} ${s.currency} per ${s.period === "YEARLY" ? "year" : "month"}` : "not answered"
    } else if (Array.isArray(a)) text = a.length ? a.map(label).join(", ") : "none selected"
    else if (typeof a === "string" && a) text = label(a)
    return `- ${LEAD[q.id] ?? q.label}: ${text}`
  })
  return `My answers:\n${lines.join("\n")}`
}

function isEmpty(a: Answer, q: CardQuestion) {
  if (q.kind === "salary") return !(a as SalaryAnswer | null)?.amount
  return Array.isArray(a) ? a.length === 0 : !a
}

// One question at a time. Single choices advance on tap; the rest use Next.
// Skipping keeps the profile's pre-filled answer.
function QuestionCardView({ card, onSubmit, busy }: { card: QuestionCard; onSubmit: (text: string) => void; busy: boolean }) {
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => Object.fromEntries(card.questions.map((q) => [q.id, q.default ?? (q.kind === "countries" || q.kind === "multi" ? [] : null)])))
  const [extras, setExtras] = useState<Record<string, Choice[]>>({})
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)

  const total = card.questions.length
  const q = card.questions[step]
  const last = step === total - 1
  const go = (to: number) => {
    setDir(to > step ? 1 : -1)
    setStep(Math.min(Math.max(to, 0), total - 1))
  }
  const submit = () => onSubmit(summarize(card, answers, extras))
  const next = () => (last ? submit() : go(step + 1))
  const single = q.kind === "country" || q.kind === "choice"

  function change(v: Answer) {
    setAnswers((a) => ({ ...a, [q.id]: v }))
    // Tapping a single choice is the answer: move on after a beat.
    if (single && v && !last) setTimeout(() => go(step + 1), 220)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex w-[min(540px,100%)] flex-col gap-4 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-text-tertiary">
          <span className="font-semibold text-foreground">{card.title}</span>
          <span>
            Step {step + 1} of {total}
          </span>
        </div>
        <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step + 1}>
          {card.questions.map((item, i) => (
            <button key={item.id} type="button" disabled={busy} aria-label={`Go to step ${i + 1}`} onClick={() => go(i)} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={q.id}
          custom={dir}
          initial={{ opacity: 0, x: dir * 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir * -24 }}
          transition={{ duration: 0.18 }}
          className="flex min-h-[132px] flex-col gap-3"
        >
          <p className="text-[15px] font-medium text-foreground">{q.label}</p>
          <Field
            q={q}
            value={answers[q.id] ?? null}
            extras={extras[q.id] ?? []}
            disabled={busy}
            onChange={change}
            onAddExtra={(c) => setExtras((e) => ({ ...e, [q.id]: [...(e[q.id] ?? []), c] }))}
          />
        </motion.div>
      </AnimatePresence>

      <div className="flex flex-wrap items-center gap-2">
        {step > 0 && (
          <button type="button" disabled={busy} onClick={() => go(step - 1)} className="inline-flex items-center gap-1 rounded-sm px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">
            <ArrowLeft className="size-4" /> Back
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!last && isEmpty(answers[q.id] ?? null, q) && (
            <button type="button" disabled={busy} onClick={() => go(step + 1)} className="rounded-sm px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">
              Skip
            </button>
          )}
          <button type="button" disabled={busy} onClick={next} className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {last ? "Find jobs" : "Next"} <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
      <button type="button" disabled={busy} onClick={() => onSubmit("Use my saved profile for all of this.")} className="self-start text-xs text-text-tertiary underline-offset-2 hover:underline disabled:opacity-50">
        Just use my saved profile
      </button>
    </motion.div>
  )
}

export { QuestionCardView }
