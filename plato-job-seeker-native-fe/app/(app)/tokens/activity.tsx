"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronDown, Leaf, PieChart, ReceiptText } from "lucide-react"
import { cn } from "cn"
import { PillTabs } from "@/components/pill-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { CARD, EmptyState, SectionHeader } from "@/components/plato-ui"
import { CountUp } from "@/components/count-up"
import { formatTokens, type TokenAccount, type TokenMove } from "@/lib/credits/api"
import { timeAgo } from "@/lib/jobs/links"
import { ease, spring } from "@/lib/motion-system"
import { InfoTip } from "@/components/info-tip"
import { CATEGORIES, dayLabel, describeMove } from "./token-ui"

const FILTERS = [
  { key: "all", label: "All" },
  { key: "spent", label: "Spent" },
  { key: "added", label: "Added" },
] as const
type FilterKey = (typeof FILTERS)[number]["key"]
const amount = (n: number) => (Math.abs(n) < 1 ? Math.abs(n).toFixed(1) : formatTokens(Math.abs(n)))

// This month's spending by kind of work (summed on the server over the whole period): ranked rows, one thin cobalt bar each, biggest first.
export function SpendingBreakdown({ spent }: { spent: TokenAccount["spent"] | null }) {
  const reduced = !!useReducedMotion()
  const parts = useMemo(() => {
    if (!spent) return null
    return { total: spent.total, rows: CATEGORIES.map((c) => ({ ...c, value: spent.byCategory[c.key] ?? 0 })).filter((c) => c.value > 0).sort((a, b) => b.value - a.value) }
  }, [spent])
  const top = parts?.rows[0]?.value ?? 1

  return (
    <section data-tour="tokens-spending" className={cn(CARD, "flex flex-col gap-4 p-5 sm:p-6")}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1.5">
          <SectionHeader title="Where your tokens went" icon={PieChart} accent="cobalt" />
          <p className="flex items-center gap-1.5 text-sm text-text-secondary">
            This month, by the kind of work Plato did for you.
            <InfoTip text="Tokens spent since your last monthly refill, grouped by feature. Refills, top-ups and gifts are not counted here." label="What counts as spent" />
          </p>
        </div>
        {parts && parts.total > 0 && (
          <span className="text-sm text-text-tertiary">
            <span className="type-section-title text-foreground tabular-nums">
              <CountUp value={formatTokens(parts.total)} />
            </span>{" "}
            used so far
          </span>
        )}
      </div>
      {!parts ? (
        <ul aria-busy="true" className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-1.5 flex-1 rounded-full" />
              <Skeleton className="h-4 w-16" />
            </li>
          ))}
        </ul>
      ) : parts.total === 0 ? (
        <EmptyState icon={Leaf} title="Nothing spent yet this month" hint="Your first search or career chat will show up here." />
      ) : (
        <ul className="flex flex-col" aria-label="Tokens spent this month by kind of work">
          {parts.rows.map(({ key, label, icon: Icon, value }, i) => {
            const pct = Math.round((value / parts.total) * 100)
            return (
              <li
                key={key}
                className="-mx-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-2 transition-colors duration-200 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both hover:bg-muted/60 motion-reduce:animate-none sm:grid-cols-[auto_10rem_minmax(0,1fr)_7.5rem]"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <span className="row-span-2 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary sm:row-span-1">
                  <Icon className="size-4" />
                </span>
                <span className="truncate text-sm font-medium text-foreground">{label}</span>
                <span className="col-start-2 col-end-4 h-1.5 overflow-hidden rounded-full bg-muted sm:col-start-3 sm:col-end-4 sm:row-start-1" aria-hidden>
                  <motion.span
                    className="block h-full rounded-full bg-primary"
                    initial={{ width: reduced ? `${(value / top) * 100}%` : 0 }}
                    whileInView={{ width: `${(value / top) * 100}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: reduced ? 0 : 0.7, ease: ease.out, delay: reduced ? 0 : 0.1 + i * 0.06 }}
                  />
                </span>
                <span className="col-start-3 row-start-1 text-right text-sm tabular-nums sm:col-start-4">
                  <span className="font-semibold text-foreground">{formatTokens(value)}</span>
                  <span className="inline-block w-12 text-text-tertiary">{pct < 1 ? "<1" : pct}%</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// Every movement, newest first, grouped by day; older pages load from the server on "Show more".
export function History({ history, onMore }: { history: TokenMove[] | null; onMore: (() => Promise<void>) | null }) {
  const reduced = !!useReducedMotion()
  const [filter, setFilter] = useState<FilterKey>("all")
  const [limit, setLimit] = useState(12)
  const [loading, setLoading] = useState(false)
  const all = history ?? []
  const counts = { all: all.length, spent: all.filter((m) => m.amount < 0).length, added: all.filter((m) => m.amount > 0).length }
  const tabs = FILTERS.map((f) => ({ ...f, count: history ? counts[f.key] : undefined }))
  const moves = all.filter((m) => (filter === "all" ? true : filter === "spent" ? m.amount < 0 : m.amount > 0))
  const shown = moves.slice(0, limit)
  const days = shown.reduce<{ day: string; items: TokenMove[] }[]>((acc, m) => {
    const d = dayLabel(m.at)
    const last = acc.at(-1)
    if (last?.day === d) last.items.push(m)
    else acc.push({ day: d, items: [m] })
    return acc
  }, [])

  return (
    <section data-tour="tokens-history" className={cn(CARD, "flex flex-col gap-4 p-5 sm:p-6")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-1.5">
          <SectionHeader title="History" icon={ReceiptText} accent="cobalt" />
          <InfoTip text="Every charge, refill and top-up, newest first. A search's board runs are one line. A voice call or a search in progress first reserves tokens (listed as Reserved); when it ends, only what it really used is charged." label="What the history shows" />
        </span>
        <PillTabs id="history-filter" tabs={tabs} value={filter} onChange={(k) => (setFilter(k), setLimit(12))} label="Filter history" dataAi="tokens.history" />
      </div>

      {history === null ? (
        <ul aria-busy="true" className="flex flex-col">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 border-b border-divider py-3 last:border-b-0">
              <Skeleton className="size-8 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-12" />
            </li>
          ))}
        </ul>
      ) : moves.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={filter === "added" ? "Nothing added yet" : filter === "spent" ? "Nothing spent yet" : "No activity yet"}
          hint={filter === "added" ? "Refills and top-ups show up here." : "Your first search or career chat will show up here."}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <AnimatePresence mode="popLayout" initial={false}>
            {days.map(({ day, items }) => (
              <motion.div key={`${filter}-${day}`} layout={!reduced} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.settle} className="flex flex-col">
                <div className="flex items-center justify-between border-b border-divider pb-1.5">
                  <span className="eyebrow">{day}</span>
                  <span className="eyebrow hidden w-28 text-right sm:block">Balance after</span>
                </div>
                <ul className="flex flex-col divide-y divide-divider">
                  {items.map((m, i) => {
                    const { title, icon: Icon, tone } = describeMove(m)
                    const gain = m.amount > 0
                    return (
                      <motion.li
                        key={m.id}
                        initial={reduced ? false : { opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, ease: ease.out, delay: reduced ? 0 : Math.min(i, 8) * 0.03 }}
                        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-200 hover:bg-muted/60"
                      >
                        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", tone)}>
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{title}</span>
                          <span className="type-meta block text-text-tertiary">{timeAgo(m.at)}</span>
                        </span>
                        <span className={cn("w-16 text-right text-sm font-semibold tabular-nums", gain ? "text-success" : "text-foreground")}>
                          {gain ? "+" : "−"}
                          {amount(m.amount)}
                        </span>
                        <span className="type-meta hidden w-28 text-right text-text-tertiary tabular-nums sm:block">{formatTokens(m.balanceAfter)}</span>
                      </motion.li>
                    )
                  })}
                </ul>
              </motion.div>
            ))}
          </AnimatePresence>
          {(moves.length > limit || onMore) && (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setLimit((l) => l + 20)
                if (moves.length <= limit + 20 && onMore) {
                  setLoading(true)
                  void onMore().finally(() => setLoading(false))
                }
              }}
              className="mx-auto flex items-center gap-1.5 rounded-full border bg-card px-4 py-1.5 text-sm font-medium text-text-secondary transition-colors duration-200 hover:border-primary-line hover:bg-primary-tint hover:text-primary disabled:opacity-60"
            >
              Show more
              <ChevronDown className="size-4" />
            </button>
          )}
        </div>
      )}
    </section>
  )
}
