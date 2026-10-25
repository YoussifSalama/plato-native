"use client"

import { useEffect, useState } from "react"
import { ArrowDownLeft, ArrowUpRight, Coins, RefreshCw } from "lucide-react"
import { cn } from "cn"
import { timeAgo } from "@/lib/jobs/links"
import { Skeleton } from "@/components/ui/skeleton"
import { resetLabel, useTokens } from "@/components/plato-tokens"
import { formatTokens, getTokenPrices, getTokens, type TokenMove, type TokenPrices } from "@/lib/credits/api"

// Holds and their releases are bookkeeping for a voice call: shown as one line by the call's charge.
const visible = (m: TokenMove) => m.kind !== "hold" && m.kind !== "release"

export default function TokensPage() {
  const acc = useTokens()
  const [history, setHistory] = useState<TokenMove[] | null>(null)
  const [prices, setPrices] = useState<TokenPrices | null>(null)

  useEffect(() => {
    getTokens(100)
      .then((a) => setHistory(a.history))
      .catch(() => setHistory([]))
    getTokenPrices()
      .then(setPrices)
      .catch(() => setPrices(null))
  }, [acc?.balance])

  const left = acc ? Math.max(0, acc.balance) : 0
  const pct = acc?.monthly ? Math.min(100, (left / acc.monthly) * 100) : 0
  const moves = history?.filter(visible) ?? []
  const features = (prices?.features ?? []).filter((f) => f.calls >= 3).sort((a, b) => b.average - a.average)

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-6 lg:pr-6 lg:pl-7">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold text-foreground">Plato tokens</h1>
        <p className="text-sm text-text-secondary">Tokens pay for Plato&apos;s AI and the job boards it searches. Each action costs what it really takes, so a short reply costs a token or two and a deep search across paid job boards costs more.</p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-4 rounded-lg border bg-card p-6">
          {!acc ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-2 w-full" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                <Coins className="size-4 text-primary" />
                Left this month · {acc.plan[0].toUpperCase() + acc.plan.slice(1)} plan
              </div>
              <p className="text-4xl font-bold tabular-nums text-foreground" data-ai="tokens.balance">
                {formatTokens(left)}
                <span className="ml-2 text-base font-medium text-text-tertiary">/ {formatTokens(acc.monthly)}</span>
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className={cn("h-full rounded-full", pct < 15 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
              </div>
              <p className="flex items-start gap-1.5 text-sm text-text-secondary">
                <RefreshCw className="mt-[3px] size-3.5 shrink-0" />
                <span>
                  Refills to {formatTokens(acc.monthly)} on <span className="font-semibold text-foreground">{resetLabel(acc.resetsAt)}</span>. Unused tokens don&apos;t carry over.
                </span>
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground">What things cost</h2>
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex justify-between gap-3 text-text-secondary">
              <span>Browsing jobs, applications and your profile</span>
              <span className="font-medium text-success">Free</span>
            </li>
            {prices && (
              <li className="flex justify-between gap-3 text-text-secondary">
                <span>Voice interview</span>
                <span className="tabular-nums text-foreground">≈ {formatTokens(prices.voicePerMinute)} / minute</span>
              </li>
            )}
            {features.slice(0, 6).map((f) => (
              <li key={f.feature} className="flex justify-between gap-3 text-text-secondary">
                <span>{f.label}</span>
                <span className="tabular-nums text-foreground">≈ {f.average < 1 ? "<1" : formatTokens(f.average)}</span>
              </li>
            ))}
            {prices && prices.boards.length > 0 && (
              <li className="flex justify-between gap-3 text-text-secondary">
                <span>Job-board search, per 40 results</span>
                <span className="tabular-nums text-foreground">
                  {formatTokens(Math.min(...prices.boards.map((b) => b.perResult * 40 + b.perRun)))}–{formatTokens(Math.max(...prices.boards.map((b) => b.perResult * 40 + b.perRun)))}
                </span>
              </li>
            )}
          </ul>
          <p className="text-xs text-text-tertiary">When your tokens run low, searches use the free job sources and voice calls get shorter instead of stopping.</p>
        </div>
      </section>

      <section className="rounded-lg border bg-card px-5 py-1">
        <h2 className="pt-4 pb-2 text-sm font-semibold text-foreground">History</h2>
        {history === null && (
          <ul aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="flex items-center justify-between border-b border-divider py-3.5 last:border-b-0">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-12" />
              </li>
            ))}
          </ul>
        )}
        {history !== null && moves.length === 0 && <p className="py-8 text-center text-sm text-text-secondary">Nothing spent yet.</p>}
        <ul>
          {moves.map((m) => {
            const gain = m.amount > 0
            return (
              <li key={m.id} className="flex items-center gap-3 border-b border-divider py-3.5 last:border-b-0">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", gain ? "bg-success-soft text-success" : "bg-primary-soft text-primary")}>{gain ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{m.label}</span>
                  <span className="block text-xs text-text-tertiary">{timeAgo(m.at)}</span>
                </span>
                <span className={cn("text-sm font-semibold tabular-nums", gain ? "text-success" : "text-foreground")}>
                  {gain ? "+" : "−"}
                  {Math.abs(m.amount) < 1 ? Math.abs(m.amount).toFixed(1) : formatTokens(Math.abs(m.amount))}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
