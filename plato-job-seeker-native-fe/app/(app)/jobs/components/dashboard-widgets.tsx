"use client"

import type { ComponentType, ReactNode } from "react"
import { motion } from "motion/react"
import { cn } from "cn"
import { fadeUpItem } from "@/lib/motion-variants"

// Colour "tones" for icon tiles and bars. Each is a soft background + a
// strong foreground from the Plato palette.
export const TONES = {
  violet: { tile: "bg-primary-soft text-primary", bar: "bg-primary", dot: "bg-primary" },
  green: { tile: "bg-success-soft text-success", bar: "bg-success", dot: "bg-success" },
  blue: { tile: "bg-info-soft text-info", bar: "bg-info", dot: "bg-info" },
  amber: { tile: "bg-warning-soft text-warning", bar: "bg-warning", dot: "bg-warning" },
  rose: { tile: "bg-rose-soft text-rose", bar: "bg-rose", dot: "bg-rose" },
  teal: { tile: "bg-teal-soft text-teal", bar: "bg-teal", dot: "bg-teal" },
  slate: { tile: "bg-muted text-text-secondary", bar: "bg-lavender", dot: "bg-lavender" },
} as const
export type Tone = keyof typeof TONES

export function Card({ title, icon: Icon, tone = "violet", action, className, children }: { title?: string; icon?: ComponentType<{ className?: string }>; tone?: Tone; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <motion.section variants={fadeUpItem} className={cn("flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-5", className)}>
      {title && (
        <header className="flex items-center gap-2.5">
          {Icon && (
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-sm", TONES[tone].tile)}>
              <Icon className="size-4" />
            </span>
          )}
          <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
          {action && <span className="ml-auto">{action}</span>}
        </header>
      )}
      {children}
    </motion.section>
  )
}

export function KpiCard({ icon: Icon, tone, value, label, hint }: { icon: ComponentType<{ className?: string }>; tone: Tone; value: string | number; label: string; hint?: string }) {
  return (
    <motion.div variants={fadeUpItem} className="relative flex items-center gap-4 overflow-hidden rounded-lg border bg-card p-5">
      <span className={cn("pointer-events-none absolute -top-8 -right-8 size-28 rounded-full opacity-60", TONES[tone].tile)} aria-hidden />
      <span className={cn("relative flex size-12 shrink-0 items-center justify-center rounded-md", TONES[tone].tile)}>
        <Icon className="size-6" />
      </span>
      <div className="relative min-w-0">
        <p className="text-[26px] leading-none font-bold text-foreground">{value}</p>
        <p className="mt-1 text-sm font-medium text-text-secondary">{label}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-text-tertiary">{hint}</p>}
      </div>
    </motion.div>
  )
}

export function Bar({ value, max, tone, className }: { value: number; max: number; tone: Tone; className?: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className={cn("h-full rounded-full", TONES[tone].bar)} />
    </div>
  )
}

export function BreakdownRows({ rows, tone, empty = "Nothing yet." }: { rows: { key: string; label: ReactNode; count: number; tone?: Tone; leading?: ReactNode }[]; tone: Tone; empty?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.count))
  const total = rows.reduce((n, r) => n + r.count, 0)
  if (!rows.length) return <p className="text-sm text-text-tertiary">{empty}</p>
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5 text-sm">
            {r.leading}
            <span className="min-w-0 flex-1 truncate text-text-secondary">{r.label}</span>
            <span className="font-semibold text-foreground tabular-nums">{r.count}</span>
            <span className="w-9 text-right text-xs text-text-tertiary tabular-nums">{total ? Math.round((r.count / total) * 100) : 0}%</span>
          </div>
          <Bar value={r.count} max={max} tone={r.tone ?? tone} />
        </li>
      ))}
    </ul>
  )
}

// Conic ring with a legend — no chart lib needed for three slices.
export function Ring({ slices, centerLabel, centerValue }: { slices: { label: string; value: number; tone: Tone; color: string }[]; centerLabel: string; centerValue: string | number }) {
  const total = slices.reduce((n, s) => n + s.value, 0)
  let acc = 0
  const stops = slices
    .map((s) => {
      const from = total ? (acc / total) * 100 : 0
      acc += s.value
      const to = total ? (acc / total) * 100 : 0
      return `${s.color} ${from}% ${to}%`
    })
    .join(", ")
  return (
    <div className="flex items-center gap-5">
      <div className="relative size-28 shrink-0 rounded-full" style={{ background: total ? `conic-gradient(${stops})` : "var(--muted)" }} aria-hidden>
        <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-card">
          <span className="text-xl leading-none font-bold text-foreground">{centerValue}</span>
          <span className="mt-1 text-[10px] font-medium tracking-wide text-text-tertiary uppercase">{centerLabel}</span>
        </div>
      </div>
      <ul className="flex flex-1 flex-col gap-2">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <span className={cn("size-2.5 rounded-full", TONES[s.tone].dot)} />
            <span className="flex-1 text-text-secondary">{s.label}</span>
            <span className="font-semibold text-foreground tabular-nums">{s.value}</span>
            <span className="w-9 text-right text-xs text-text-tertiary tabular-nums">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Sparkbars({ points, tone = "violet" }: { points: { date: string; jobs: number; runs: number }[]; tone?: Tone }) {
  const max = Math.max(1, ...points.map((p) => p.jobs))
  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-28 items-end gap-1.5">
        {points.map((p) => (
          <div key={p.date} className="group relative flex flex-1 flex-col items-center justify-end" title={`${fmt(p.date)}: ${p.jobs} postings · ${p.runs} run${p.runs === 1 ? "" : "s"}`}>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(p.jobs ? 8 : 3, (p.jobs / max) * 100)}%` }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className={cn("w-full rounded-t-sm", p.jobs ? TONES[tone].bar : "bg-muted")}
            />
            {p.runs > 0 && <span className={cn("mt-1 size-1.5 rounded-full", TONES.green.dot)} />}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-text-tertiary">
        <span>{fmt(points[0]?.date ?? new Date().toISOString())}</span>
        <span>Today</span>
      </div>
    </div>
  )
}
