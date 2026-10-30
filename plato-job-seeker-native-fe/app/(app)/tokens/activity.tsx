"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronDown, Leaf } from "lucide-react"
import { cn } from "cn"
import { PillTabs } from "@/components/pill-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { formatTokens, type TokenMove } from "@/lib/credits/api"
import { timeAgo } from "@/lib/jobs/links"
import { ease, spring } from "@/lib/motion-system"
import { CATEGORIES, categoryOf, dayLabel, describeMove } from "./token-ui"

// Holds and their releases are bookkeeping for a voice call: the call's own charge is the line people care about.
const visible = (m: TokenMove) => m.kind !== "hold" && m.kind !== "release"
const FILTERS = [
  { key: "all", label: "All" },
  { key: "spent", label: "Spent" },
  { key: "added", label: "Added" },
] as const
type FilterKey = (typeof FILTERS)[number]["key"]
const amount = (n: number) => (Math.abs(n) < 1 ? Math.abs(n).toFixed(1) : formatTokens(Math.abs(n)))

// This month's spending by kind of work: one bar, one colour per kind.
export function SpendingBreakdown({ history, periodStart }: { history: TokenMove[] | null; periodStart: string | null }) {
  const reduced = !!useReducedMotion()
  const parts = useMemo(() => {
    if (!history || !periodStart) return null
    const since = new Date(periodStart).getTime()
    const sums = new Map<string, number>()
    for (const m of history) if (m.kind === "consume" && new Date(m.at).getTime() >= since) sums.set(categoryOf(m.feature).key, (sums.get(categoryOf(m.feature).key) ?? 0) - m.amount)
    const total = [...sums.values()].reduce((a, b) => a + b, 0)
    return { total, rows: CATEGORIES.map((c) => ({ ...c, value: sums.get(c.key) ?? 0 })).filter((c) => c.value > 0).sort((a, b) => b.value - a.value) }
  }, [history, periodStart])

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-foreground">Where your tokens went</h2>
          <p className="text-sm text-text-secondary">This month, by the kind of work Plato did for you.</p>
        </div>
        {parts && parts.total > 0 && (
          <span className="text-sm text-text-tertiary">
            <span className="font-bold text-foreground tabular-nums">{formatTokens(parts.total)}</span> used so far
          </span>
        )}
      </div>
      {!parts ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-full rounded-full" />
          <div className="flex gap-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      ) : parts.total === 0 ? (
        <div className="flex items-center gap-3 rounded-lg bg-primary-tint p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
            <Leaf className="size-4" />
          </span>
          <p className="text-sm text-text-secondary">
            <span className="font-semibold text-foreground">Nothing spent yet this month.</span> Your first search or career chat will show up here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex h-3 w-full gap-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={parts.rows.map((r) => `${r.label} ${Math.round((r.value / parts.total) * 100)}%`).join(", ")}>
            {parts.rows.map((r, i) => (
              <motion.span
                key={r.key}
                className={cn("h-full rounded-full", r.bar)}
                initial={{ width: reduced ? `${(r.value / parts.total) * 100}%` : 0 }}
                whileInView={{ width: `${(r.value / parts.total) * 100}%` }}
                viewport={{ once: true }}
                transition={{ duration: reduced ? 0 : 0.8, ease: ease.out, delay: reduced ? 0 : 0.1 + i * 0.08 }}
              />
            ))}
          </div>
          <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {parts.rows.map(({ key, label, icon: Icon, tone, value }) => (
              <li key={key} className="flex items-center gap-3">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", tone)}>
                  <Icon className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{label}</span>
                  <span className="text-xs text-text-tertiary tabular-nums">
                    {formatTokens(value)} tokens · {Math.round((value / parts.total) * 100)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

// Every movement, newest first, grouped by day.
export function History({ history }: { history: TokenMove[] | null }) {
  const reduced = !!useReducedMotion()
  const [filter, setFilter] = useState<FilterKey>("all")
  const [limit, setLimit] = useState(12)
  const moves = (history ?? []).filter(visible).filter((m) => (filter === "all" ? true : filter === "spent" ? m.amount < 0 : m.amount > 0))
  const shown = moves.slice(0, limit)
  const days = shown.reduce<{ day: string; items: TokenMove[] }[]>((acc, m) => {
    const d = dayLabel(m.at)
    const last = acc.at(-1)
    if (last?.day === d) last.items.push(m)
    else acc.push({ day: d, items: [m] })
    return acc
  }, [])

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">History</h2>
        <PillTabs id="history-filter" tabs={FILTERS} value={filter} onChange={(k) => (setFilter(k), setLimit(12))} label="Filter history" dataAi="tokens.history" />
      </div>

      {history === null ? (
        <ul aria-busy="true" className="flex flex-col">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 border-b border-divider py-3.5 last:border-b-0">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-12" />
            </li>
          ))}
        </ul>
      ) : moves.length === 0 ? (
        <p className="py-10 text-center text-sm text-text-secondary">{filter === "added" ? "Nothing added yet." : "Nothing spent yet. Your first search or career chat will show up here."}</p>
      ) : (
        <div className="flex flex-col gap-5">
          <AnimatePresence mode="popLayout" initial={false}>
            {days.map(({ day, items }) => (
              <motion.div key={`${filter}-${day}`} layout={!reduced} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.settle} className="flex flex-col">
                <span className="sticky top-0 pb-1.5 text-xs font-semibold tracking-wide text-text-tertiary uppercase">{day}</span>
                <ul className="flex flex-col">
                  {items.map((m, i) => {
                    const { title, icon: Icon, tone } = describeMove(m)
                    const gain = m.amount > 0
                    return (
                      <motion.li
                        key={m.id}
                        initial={reduced ? false : { opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, ease: ease.out, delay: reduced ? 0 : Math.min(i, 8) * 0.03 }}
                        className="group flex items-center gap-3 rounded-lg px-2 py-2.5 -mx-2 transition-colors hover:bg-primary-tint"
                      >
                        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tone)}>
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{title}</span>
                          <span className="block text-xs text-text-tertiary">{timeAgo(m.at)}</span>
                        </span>
                        <span className={cn("text-sm font-semibold tabular-nums", gain ? "text-success" : "text-foreground")}>
                          {gain ? "+" : "−"}
                          {amount(m.amount)}
                        </span>
                      </motion.li>
                    )
                  })}
                </ul>
              </motion.div>
            ))}
          </AnimatePresence>
          {moves.length > limit && (
            <button type="button" onClick={() => setLimit((l) => l + 20)} className="mx-auto flex items-center gap-1.5 rounded-full border bg-card px-4 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary">
              Show more
              <ChevronDown className="size-4" />
            </button>
          )}
        </div>
      )}
    </section>
  )
}
