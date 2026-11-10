"use client"

import type { CSSProperties, ReactNode } from "react"
import Link from "next/link"
import { ArrowRight, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { CARD, StatIcon, type Accent } from "@/components/plato-ui"

// Small pieces shared by the Career practice pages (interviews, assessments, proof of skills).
// The look follows the app's polish spec: white cards, the brand glow on intro cards,
// one solid CTA per view and soft ones for repeats.

// Repeated CTAs: soft primary that fills on hover. The view's one main action uses SOLID.
export const SOFT = "inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary-soft px-3 py-1.5 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground"
export const SOLID = "inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary-hover"

// Categories have a fixed colour across Career (Interviews cobalt, Skills amber, …).
export const CAT_ACCENT = { interview: "cobalt", skills: "amber", aptitude: "azure", language: "teal", resume: "green" } as const satisfies Record<string, Accent>

// Cards in a grid fade up one after another (CSS, reduced-motion aware).
export const enter = (i: number): { className: string; style: CSSProperties } => ({
  className: "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 motion-reduce:animate-none",
  style: { animationDelay: `${Math.min(i, 10) * 60}ms` },
})

// The brand glow (as on Home): soft cobalt top-left, azure bottom-right, behind the card's content.
// Pages use the brand, not their sidebar accent; other colours only carry meaning.
export function BrandGlow() {
  return <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_120%_at_0%_0%,color-mix(in_oklch,var(--primary)_9%,transparent),transparent_60%),radial-gradient(50%_90%_at_100%_100%,color-mix(in_oklch,var(--azure)_10%,transparent),transparent_65%)]" />
}

// A short intro under the nav: what this tab is for, in one or two lines, plus optional facts.
export function IntroCard({ icon, title, children, aside, className, tour }: { icon: LucideIcon; title: ReactNode; children: ReactNode; aside?: ReactNode; className?: string; tour?: string }) {
  return (
    <section data-tour={tour} className={cn(CARD, "relative isolate flex flex-col gap-4 overflow-hidden p-5 sm:flex-row sm:items-center", className)}>
      <BrandGlow />
      <StatIcon icon={icon} accent="cobalt" className="size-10 rounded-xl" />
      <div className="min-w-0 flex-1">
        <h2 className="type-card-title text-foreground">{title}</h2>
        <p className="mt-1 max-w-[72ch] text-[13.5px] leading-relaxed text-text-secondary">{children}</p>
      </div>
      {aside}
    </section>
  )
}

// A practice item as a card: icon in its category colour, status on the right, title, body,
// meta line and a CTA. The whole card is the link, unless `actions` gives it its own buttons
// (Chat | Voice): then the card is a plain block and the buttons do the starting.
export function PracticeCard({ href, "data-ai": dataAi, icon, accent, status, title, body, note, meta, cta, solid, index = 0, actions }: { href: string; "data-ai"?: string; icon: LucideIcon; accent: Accent; status?: ReactNode; title: ReactNode; body: ReactNode; note?: ReactNode; meta?: ReactNode; cta: string; solid?: boolean; index?: number; actions?: ReactNode }) {
  const e = enter(index)
  if (actions)
    return (
      <div className={cn(CARD, "card-lift flex min-w-0 flex-col gap-2 p-4", e.className)} style={e.style}>
        <span className="flex items-start justify-between gap-2">
          <StatIcon icon={icon} accent={accent} />
          {status}
        </span>
        <b className="type-card-title mt-1 leading-snug text-foreground">{title}</b>
        <span className="text-[13px] leading-relaxed text-text-secondary">{body}</span>
        {note && <span className="text-xs font-medium text-primary">{note}</span>}
        <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <span className="type-meta text-text-secondary">{meta}</span>
          {actions}
        </span>
      </div>
    )
  return (
    <Link href={href} data-ai={dataAi} className={cn(CARD, "group card-lift flex min-w-0 flex-col gap-2 p-4", e.className)} style={e.style}>
      <span className="flex items-start justify-between gap-2">
        <StatIcon icon={icon} accent={accent} />
        {status}
      </span>
      <b className="type-card-title mt-1 leading-snug text-foreground">{title}</b>
      <span className="text-[13px] leading-relaxed text-text-secondary">{body}</span>
      {note && <span className="text-xs font-medium text-primary">{note}</span>}
      <span className="mt-auto flex items-center justify-between gap-2 pt-2">
        <span className="type-meta text-text-secondary">{meta}</span>
        <span className={solid ? SOLID : SOFT}>
          {cta}
          <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </span>
    </Link>
  )
}

// Progress through a run: "Question 3 of 7" with a bar, an optional detail and a way out.
export function RunProgress({ step, total, unit = "Question", detail, exit }: { step: number; total: number; unit?: string; detail?: ReactNode; exit?: ReactNode }) {
  const n = Math.min(Math.max(step, 1), total)
  return (
    <div className={cn(CARD, "flex flex-col gap-2.5 px-4 py-3")}>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="min-w-0 truncate">
          <b className="text-foreground tabular-nums">
            {unit} {n} of {total}
          </b>
          {detail && <span className="text-text-secondary"> · {detail}</span>}
        </span>
        {exit}
      </div>
      <span className="h-1.5 overflow-hidden rounded-full bg-divider" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={n} aria-label={`${unit} ${n} of ${total}`}>
        <span className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(n / total) * 100}%` }} />
      </span>
    </div>
  )
}

// A keyboard hint chip: <Kbd>Enter</Kbd>.
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border bg-muted px-1.5 py-px font-sans text-[11px] font-semibold text-text-secondary">{children}</kbd>
}
