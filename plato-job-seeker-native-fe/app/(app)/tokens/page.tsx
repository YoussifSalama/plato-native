"use client"

import { useEffect, useState } from "react"
import { ArrowDownLeft, ArrowUpRight, Check, Coins, Loader2, RefreshCw } from "lucide-react"
import { AxiosError } from "axios"
import { Button } from "@/components/ui/button"
import { cn } from "cn"
import { timeAgo } from "@/lib/jobs/links"
import { Skeleton } from "@/components/ui/skeleton"
import { resetLabel, useEstimates, useTokens } from "@/components/plato-tokens"
import { formatTokens, getTokenPrices, getTokens, startCheckout, type TokenMove, type TokenPrices } from "@/lib/credits/api"

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
  const estimates = useEstimates()

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
                  Refills to {formatTokens(acc.monthly)} on <span className="font-semibold text-foreground">{resetLabel(acc.resetsAt)}</span>. Unused monthly tokens don&apos;t carry over.
                </span>
              </p>
              {acc.topup >= 1 && (
                <p className="text-sm text-text-secondary">
                  Includes <span className="font-semibold text-foreground">{formatTokens(acc.topup)}</span> bought tokens. They are used after your monthly tokens and never expire.
                </p>
              )}
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
            {estimates?.map((e) => (
              <li key={e.action} title={e.note} className="flex justify-between gap-3 text-text-secondary">
                <span>{e.label}</span>
                <span className="shrink-0 tabular-nums text-foreground">
                  {e.about === e.upTo ? `≈ ${formatTokens(e.about)}` : `≈ ${formatTokens(e.about)}, up to ${formatTokens(e.upTo)}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-tertiary">Estimates; real use varies a little. A new search often costs much less when Plato already has matching jobs. When your tokens run low, searches use the free job sources and voice calls get shorter instead of stopping.</p>
        </div>
      </section>

      {prices && <Plans plans={prices.plans} current={acc?.plan ?? null} />}
      {prices?.topups && <TopUps packs={prices.topups} />}

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

const ORDER = ["free", "pro", "max"] as const
const BLURB: Record<string, string> = {
  free: "Try Plato: a few searches, chats and a short voice interview each month.",
  pro: "For an active job search: deep searches across paid boards, tailored resumes and regular interview practice.",
  max: "For a full-time search: the most job-board searches and voice interviews.",
}

// The plans and an upgrade that goes to the payment provider's checkout.
function Plans({ plans, current }: { plans: TokenPrices["plans"]; current: string | null }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const upgrade = async (plan: "pro" | "max") => {
    setBusy(plan)
    setNote(null)
    try {
      const { url } = await startCheckout({ plan })
      window.location.assign(url)
    } catch (e) {
      setNote(e instanceof AxiosError ? (e.response?.data?.message ?? "Could not start the payment.") : "Could not start the payment.")
    } finally {
      setBusy(null)
    }
  }
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">Plans</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {ORDER.filter((k) => plans[k]).map((k) => {
          const p = plans[k]
          const mine = current === k
          return (
            <div key={k} data-ai={`tokens.plan.${k}`} className={cn("flex flex-col gap-3 rounded-lg border bg-card p-5", mine && "border-primary ring-1 ring-primary/30")}>
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-foreground">{p.label}</span>
                {mine && <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">Your plan</span>}
              </div>
              <p className="text-2xl font-bold text-foreground">
                {p.priceUsd ? `$${p.priceUsd}` : "Free"}
                {p.priceUsd > 0 && <span className="text-sm font-medium text-text-tertiary"> / month</span>}
              </p>
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Check className="size-4 text-success" />
                {formatTokens(p.monthly)} Plato tokens every month
              </p>
              <p className="flex-1 text-sm text-text-secondary">{BLURB[k]}</p>
              {k !== "free" && !mine && (
                <Button onClick={() => void upgrade(k as "pro" | "max")} disabled={!!busy} className="mt-1">
                  {busy === k && <Loader2 className="size-4 animate-spin" />}
                  Upgrade to {p.label}
                </Button>
              )}
            </div>
          )
        })}
      </div>
      {note && <p className="text-sm text-warning">{note}</p>}
    </section>
  )
}

// One-time packs: tokens that never expire, used after the monthly ones.
function TopUps({ packs }: { packs: TokenPrices["topups"] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const buy = async (pack: string) => {
    setBusy(pack)
    setNote(null)
    try {
      const { url } = await startCheckout({ pack })
      window.location.assign(url)
    } catch (e) {
      setNote(e instanceof AxiosError ? (e.response?.data?.message ?? "Could not start the payment.") : "Could not start the payment.")
    } finally {
      setBusy(null)
    }
  }
  const entries = Object.entries(packs)
  const best = Math.min(...entries.map(([, p]) => p.priceUsd / p.tokens))
  return (
    <section id="top-ups" className="flex scroll-mt-6 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-foreground">Top up</h2>
        <p className="text-sm text-text-secondary">Need more before your refill? Buy a pack once. Bought tokens never expire and are used after your monthly tokens.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {entries.map(([key, p]) => (
          <div key={key} data-ai={`tokens.topup.${key}`} className="flex flex-col gap-3 rounded-lg border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-foreground">{formatTokens(p.tokens)} tokens</span>
              {p.priceUsd / p.tokens === best && entries.length > 1 && <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success">Best value</span>}
            </div>
            <p className="text-2xl font-bold text-foreground">${p.priceUsd}</p>
            <p className="text-xs text-text-tertiary">One-time · never expires</p>
            <Button variant="outline" onClick={() => void buy(key)} disabled={!!busy} className="mt-auto">
              {busy === key && <Loader2 className="size-4 animate-spin" />}
              Buy {p.label.toLowerCase()} pack
            </Button>
          </div>
        ))}
      </div>
      {note && <p className="text-sm text-warning">{note}</p>}
    </section>
  )
}
