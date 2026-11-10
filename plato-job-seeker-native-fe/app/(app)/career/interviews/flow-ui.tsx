"use client"

import { useEffect, type ReactNode } from "react"
import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { ArrowLeft, Check, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { StatIcon } from "@/components/plato-ui"
import { TOTAL_STEPS } from "@/lib/interviews/flow"

// The interview flow's frame, the same from the first question to the interview itself:
// a way out on the left, "STEP n OF 7 · NAME" and the step bars on the right (as in
// onboarding), then one screen of content. No Career tabs, no modals.
export function FlowShell({ step, name, exit, children, wide }: { step: number; name: string; exit?: ReactNode; children: ReactNode; wide?: boolean }) {
  const reduced = !!useReducedMotion()
  return (
    <div className="relative isolate flex flex-1 flex-col px-4 pt-5 pb-24 sm:px-6 lg:px-8 lg:pt-6">
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(45%_70%_at_0%_0%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_65%),radial-gradient(40%_60%_at_100%_0%,color-mix(in_oklch,var(--azure)_8%,transparent),transparent_70%)]" />
      <header className={cn("mx-auto flex w-full flex-wrap items-center justify-between gap-3", wide ? "max-w-5xl" : "max-w-3xl")}>
        {exit ?? (
          <Link href="/career/interviews" data-ai="interview.new.exit" className="group inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-text-secondary transition-colors duration-200 hover:text-primary">
            <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
            Interviews
          </Link>
        )}
        <div data-tour="interview-steps" className="flex items-center gap-3" aria-label={`Step ${step} of ${TOTAL_STEPS}: ${name}`}>
          <span className="font-mono text-[11px] tracking-[0.16em] whitespace-nowrap text-text-secondary uppercase sm:text-[12px]">
            Step {step} of {TOTAL_STEPS} · <span className="font-semibold text-primary">{name}</span>
          </span>
          <span className="flex items-center gap-1" aria-hidden>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span key={i} className={cn("relative h-[5px] overflow-hidden rounded-full bg-foreground/10 transition-[width] duration-500 ease-out", i + 1 === step ? "w-8 sm:w-10" : "w-3 sm:w-5")}>
                <motion.span initial={false} animate={{ scaleX: i < step ? 1 : 0 }} transition={{ duration: reduced ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }} className="absolute inset-0 origin-left rounded-full bg-brand-gradient" />
              </span>
            ))}
          </span>
        </div>
      </header>
      <main className={cn("mx-auto mt-6 flex w-full min-w-0 flex-1 flex-col sm:mt-10", wide ? "max-w-5xl" : "max-w-3xl")}>{children}</main>
    </div>
  )
}

// One question: a big title, an optional line under it, the answers, and Back / Next.
export function Question({ id, title, hint, children, footer, tourState }: { id: string; title: ReactNode; hint?: ReactNode; children: ReactNode; footer?: ReactNode; tourState?: string }) {
  return (
    <section key={id} data-tour-state={tourState} aria-labelledby={`q-${id}`} className="flex flex-col gap-6 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 motion-reduce:animate-none">
      <div className="flex flex-col gap-2">
        <h1 id={`q-${id}`} className="text-[26px] leading-tight font-extrabold tracking-tight text-balance text-foreground sm:text-[30px]">
          {title}
        </h1>
        {hint && <p className="max-w-[60ch] text-[15px] leading-relaxed text-text-secondary">{hint}</p>}
      </div>
      {children}
      {footer}
    </section>
  )
}

// Back on the left, Next (the screen's one main action) on the right.
export function QuestionNav({ onBack, next, nextLabel = "Next", nextDisabled, onNext, dataAi, busy, extra }: { onBack?: () => void; next?: boolean; nextLabel?: ReactNode; nextDisabled?: boolean; onNext?: () => void; dataAi?: string; busy?: boolean; extra?: ReactNode }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-divider pt-5">
      {onBack && (
        <button type="button" data-ai="interview.new.back" onClick={onBack} disabled={busy} className="inline-flex h-12 items-center gap-2 rounded-xl border bg-card px-5 text-[15px] font-semibold text-foreground transition-colors duration-200 hover:border-primary-line hover:text-primary disabled:opacity-50">
          <ArrowLeft className="size-4" />
          Back
        </button>
      )}
      {extra}
      {next && (
        <button type="button" data-ai={dataAi} onClick={onNext} disabled={nextDisabled || busy} className="ml-auto inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-7 text-[15px] font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-[background-color,box-shadow,opacity] duration-200 hover:bg-primary-hover hover:shadow-lg hover:shadow-primary/35 disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none">
          {nextLabel}
        </button>
      )}
    </div>
  )
}

// A big answer card. Number keys pick it (shown as the small key on the right).
export function OptionCard({ "data-ai": dataAi, icon, title, body, selected, onPick, n, index = 0, children }: { "data-ai": string; icon?: LucideIcon; title: ReactNode; body?: ReactNode; selected: boolean; onPick: () => void; n?: number; index?: number; children?: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-ai={dataAi}
      onClick={onPick}
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
      className={cn(
        "group flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-card transition-[border-color,background-color,box-shadow,transform] duration-200 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both motion-reduce:animate-none sm:p-5",
        "hover:-translate-y-px hover:border-primary-line hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
        selected && "border-primary bg-primary-tint/70 shadow-md shadow-primary/10",
      )}
    >
      {icon &&
        (selected ? (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Icon icon={icon} />
          </span>
        ) : (
          <StatIcon icon={icon} accent="cobalt" className="size-11 rounded-xl" />
        ))}
      <span className="min-w-0 flex-1">
        <b className={cn("block text-[16px] leading-snug text-foreground", selected && "text-primary")}>{title}</b>
        {body && <span className="mt-0.5 block text-[13.5px] leading-relaxed text-text-secondary">{body}</span>}
        {children}
      </span>
      {selected ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : (
        n !== undefined && <kbd className="hidden shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-semibold text-text-tertiary transition-colors duration-200 group-hover:text-primary sm:inline">{n}</kbd>
      )}
    </button>
  )
}

function Icon({ icon: I }: { icon: LucideIcon }) {
  return <I className="size-[18px]" strokeWidth={2} />
}

// 1–9 pick the n-th option on a question screen (not while typing in a field).
export function useNumberKeys(count: number, pick: (i: number) => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) return
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1 && n <= count) {
        e.preventDefault()
        pick(n - 1)
      }
    }
    window.addEventListener("keydown", on)
    return () => window.removeEventListener("keydown", on)
  }, [count, pick])
}
