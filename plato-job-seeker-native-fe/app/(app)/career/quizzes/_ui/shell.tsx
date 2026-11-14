"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, Brain, Check, Clock, HeartHandshake, History, type LucideIcon, Timer, UserRound } from "lucide-react"
import { cn } from "cn"
import { CARD } from "@/components/plato-ui"
import type { AssessmentCategory } from "@/lib/quizzes/contract"

// One frame for every test screen (intro, questions, results), so nothing moves between steps:
//   main card: header · body · action bar (secondary action left, primary action right — always there)
//   side column (desktop right, phone below): navigator, attempts, notes.

export const CATEGORY: Record<AssessmentCategory, { label: string; icon: LucideIcon; tint: string }> = {
  reasoning: { label: "Reasoning", icon: Brain, tint: "bg-primary-soft text-primary" },
  personality: { label: "Personality", icon: UserRound, tint: "bg-info-soft text-info" },
  work_style: { label: "Work style", icon: HeartHandshake, tint: "bg-teal-soft text-teal" },
}

export const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.floor(s) % 60)).padStart(2, "0")}`
export const ago = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })

/** Back link + page title, the same on every test screen. */
export function TestHeader({
  back = { href: "/career/quizzes", label: "Quizzes" },
  eyebrow,
  title,
  aside,
}: {
  back?: { href: string; label: string }
  eyebrow?: ReactNode
  title: ReactNode
  aside?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-3">
      <Link href={back.href} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" /> {back.label}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-sm font-medium text-text-tertiary">{eyebrow}</div>}
          <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-[28px]">{title}</h1>
        </div>
        {aside}
      </div>
    </header>
  )
}

/** Main card + side column. */
export function TestLayout({ main, side }: { main: ReactNode; side?: ReactNode }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">{main}</div>
      {side && <aside className="flex min-w-0 flex-col gap-4">{side}</aside>}
    </div>
  )
}

export function MainCard({ top, children, bar, className }: { top?: ReactNode; children: ReactNode; bar: ReactNode; className?: string }) {
  return (
    <section className={cn(CARD, "flex flex-col overflow-hidden", className)}>
      {top && <div className="border-b border-divider px-5 py-4 sm:px-7">{top}</div>}
      <div className="flex-1 px-5 py-6 sm:px-7 sm:py-7">{children}</div>
      {bar}
    </section>
  )
}

/** The action bar: secondary on the left, primary on the right, an optional note between. Never moves. */
export function ActionBar({ left, right, note }: { left?: ReactNode; right: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-divider bg-muted/30 px-5 py-4 sm:px-7">
      <div className="flex min-w-0 items-center">{left}</div>
      <div className="order-last w-full min-w-0 text-sm text-text-secondary sm:order-none sm:w-auto sm:flex-1 sm:text-right">{note}</div>
      <div className="ml-auto flex items-center gap-2">{right}</div>
    </div>
  )
}

export const BTN_PRIMARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50"
export const BTN_SECONDARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border bg-card px-4 text-[15px] font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"

export function SideCard({ title, icon: Icon, children, className }: { title: string; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <section className={cn(CARD, "p-5", className)}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        {Icon && <Icon className="size-4 text-text-tertiary" />} {title}
      </h2>
      {children}
    </section>
  )
}

/** "Question 4 of 20" + bar + clock, at the top of the question card. */
export function ProgressTop({ label, index, total, answered, timeLeft }: { label: ReactNode; index: number; total: number; answered: number; timeLeft?: number | null }) {
  const low = timeLeft != null && timeLeft <= 60
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">{label}</span>
        <span className="flex shrink-0 items-center gap-3 text-sm text-text-secondary tabular-nums">
          <span>
            {index + 1} / {total}
          </span>
          {timeLeft != null && (
            <span
              className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold", low ? "bg-danger-soft text-destructive" : "bg-muted text-foreground")}
              aria-live={low ? "polite" : "off"}
            >
              <Timer className="size-3.5" /> {mmss(timeLeft)}
            </span>
          )}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered} aria-label="Answered">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${(answered / Math.max(1, total)) * 100}%` }} />
      </div>
    </div>
  )
}

/** Numbered squares to jump between questions: answered, current, open. */
export function Navigator({ total, current, isAnswered, onJump }: { total: number; current: number; isAnswered: (i: number) => boolean; onJump: (i: number) => void }) {
  const done = Array.from({ length: total }, (_, i) => isAnswered(i)).filter(Boolean).length
  return (
    <SideCard title="Questions" icon={Clock}>
      <p className="-mt-1 mb-3 text-sm text-text-secondary tabular-nums">
        {done} of {total} answered
      </p>
      <div className="grid grid-cols-8 gap-1.5 lg:grid-cols-6">
        {Array.from({ length: total }, (_, i) => {
          const on = i === current
          const ok = isAnswered(i)
          return (
            <button
              key={i}
              type="button"
              onClick={() => onJump(i)}
              aria-label={`Question ${i + 1}${ok ? ", answered" : ""}`}
              aria-current={on ? "step" : undefined}
              className={cn(
                "grid aspect-square place-items-center rounded-lg border text-xs font-semibold tabular-nums transition-colors",
                on ? "border-primary bg-primary text-primary-foreground" : ok ? "border-primary-line bg-primary-soft text-primary" : "bg-card text-text-secondary hover:bg-muted",
              )}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-tertiary">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-primary-line bg-primary-soft" /> Answered
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border bg-card" /> Open
        </span>
      </div>
    </SideCard>
  )
}

/** The seeker's attempts at this test, newest first, each opening its results. */
export function AttemptsCard({ items, hrefOf, current }: { items: { id: string; headline: string; createdAt: string; seconds: number }[]; hrefOf: (id: string) => string; current?: string }) {
  return (
    <SideCard title="Your attempts" icon={History}>
      {items.length === 0 ? (
        <p className="text-sm text-text-secondary">No attempts yet. Your results will be kept here, and each retake is added to this list.</p>
      ) : (
        <ol className="-mx-2 flex flex-col">
          {items.slice(0, 8).map((a, i) => (
            <li key={a.id}>
              <Link
                href={hrefOf(a.id)}
                aria-current={a.id === current ? "page" : undefined}
                className={cn("flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted", a.id === current && "bg-primary-tint")}
              >
                <span
                  className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums", i === 0 ? "bg-primary-soft text-primary" : "bg-muted text-text-secondary")}
                >
                  {items.length - i}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{a.headline}</span>
                  <span className="block text-xs text-text-tertiary tabular-nums">
                    {ago(a.createdAt)} · {mmss(a.seconds)}
                  </span>
                </span>
                {a.id === current && <Check className="size-4 text-primary" />}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </SideCard>
  )
}
