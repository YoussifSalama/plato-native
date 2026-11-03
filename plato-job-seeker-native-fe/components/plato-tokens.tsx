"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { CalendarClock, ChevronRight, Coins, Sparkles } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { formatTokens, getTokenEstimates, getTokens, OUT_OF_TOKENS_EVENT, TOKENS_CHANGED_EVENT, type EstimateAction, type OutOfTokens, type TokenAccount, type TokenEstimate } from "@/lib/credits/api"

// One shared copy of the balance for the sidebar, the tokens page and anything
// that shows a cost. Refreshed after any write (charges land a moment after the
// reply, hence the delay), when the tab comes back into view, and every minute.
let account: TokenAccount | null = null
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | undefined
let started = false

export async function refreshTokens() {
  try {
    account = await getTokens()
    listeners.forEach((l) => l())
  } catch {
    // signed out or offline: keep the last known balance
  }
}
const refreshSoon = () => {
  clearTimeout(timer)
  timer = setTimeout(() => void refreshTokens(), 2500)
}
function start() {
  if (started || typeof window === "undefined") return
  started = true
  void refreshTokens()
  window.addEventListener(TOKENS_CHANGED_EVENT, refreshSoon)
  window.addEventListener(OUT_OF_TOKENS_EVENT, () => void refreshTokens())
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void refreshTokens())
  setInterval(() => document.visibilityState === "visible" && void refreshTokens(), 60_000)
}
const subscribe = (cb: () => void) => {
  start()
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useTokens() {
  return useSyncExternalStore(subscribe, () => account, () => null)
}

export const resetLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })

// Sidebar: what is left this month, at a glance.
export function TokensNav({ collapsed, itemClass }: { collapsed: boolean; itemClass: string }) {
  const acc = useTokens()
  if (!acc) return null
  const left = Math.max(0, acc.balance)
  const pct = acc.monthly ? Math.min(100, (left / acc.monthly) * 100) : 0
  const low = pct < 15
  return (
    <Link href="/tokens" data-ai="nav.tokens" title={collapsed ? `${formatTokens(left)} Plato tokens left` : undefined} className={cn(itemClass, !collapsed && "flex-col items-stretch gap-1.5 pl-1.5")}>
      <span className="flex items-center gap-3">
        <Coins className={cn("size-[17px] shrink-0", low && "text-warning")} />
        {!collapsed && (
          <span className="flex flex-1 items-baseline justify-between gap-2">
            <span>Plato tokens</span>
            <span className={cn("text-xs tabular-nums", low ? "font-semibold text-warning" : "text-text-tertiary")}>{formatTokens(left)}</span>
          </span>
        )}
      </span>
      {!collapsed && (
        <span className="ml-[29px] block h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className={cn("block h-full rounded-full", low ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
        </span>
      )}
    </Link>
  )
}

// Opens whenever a paid action was refused for lack of tokens, wherever it was.
export function OutOfTokensDialog() {
  const ref = useRef<HTMLDialogElement>(null)
  const [info, setInfo] = useState<OutOfTokens | null>(null)
  const [days, setDays] = useState(0)
  useEffect(() => {
    const on = (e: Event) => {
      const detail = (e as CustomEvent<OutOfTokens>).detail
      setDays(Math.max(0, Math.ceil((new Date(detail.resetsAt).getTime() - Date.now()) / 86_400_000)))
      setInfo(detail)
    }
    window.addEventListener(OUT_OF_TOKENS_EVENT, on)
    return () => window.removeEventListener(OUT_OF_TOKENS_EVENT, on)
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (info && !el.open) el.showModal()
    if (!info && el.open) el.close()
  }, [info])
  const close = () => setInfo(null)
  // Three honest ways forward, in the order most people take them.
  const ways = info
    ? [
        { icon: CalendarClock, title: `Wait for your refill`, body: `Your monthly tokens come back on ${resetLabel(info.resetsAt)}, in ${days} day${days === 1 ? "" : "s"}.`, href: null },
        { icon: Coins, title: "Top up now", body: "One-time packs. Bought tokens never expire.", href: "/tokens#top-ups" },
        { icon: Sparkles, title: "Move to a bigger plan", body: "More tokens every month, from the next minute.", href: "/tokens" },
      ]
    : []
  return (
    <dialog ref={ref} data-ai-skip onCancel={(e) => (e.preventDefault(), close())} onClick={(e) => e.target === ref.current && close()} className="m-auto w-[min(460px,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-card p-0 text-foreground shadow-[0_28px_70px_-28px_rgba(0,91,167,0.45)] backdrop:bg-foreground/30 backdrop:backdrop-blur-sm">
      {info && (
        <div className="relative flex flex-col gap-5 p-6">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(ellipse_at_top,rgba(217,119,6,0.14),transparent_70%)]" />
          <div className="relative flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning">
              <Coins className="size-6" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-bold">You&apos;re out of tokens for this one</h2>
              <p className="text-sm leading-relaxed text-text-secondary">
                {info.needed ? `It needs about ${formatTokens(info.needed)} tokens and you have ${formatTokens(Math.max(0, info.balance))} left.` : "This month's tokens are used up."} Browsing your jobs and applications stays free.
              </p>
            </div>
          </div>
          <ul className="relative flex flex-col gap-2">
            {ways.map(({ icon: Icon, title, body, href }) => {
              const inner = (
                <>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold text-foreground">{title}</span>
                    <span className="text-xs text-text-tertiary">{body}</span>
                  </span>
                  {href && <ChevronRight className="size-4 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />}
                </>
              )
              return (
                <li key={title}>
                  {href ? (
                    <Link href={href} onClick={close} className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/30 hover:bg-primary-tint">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 rounded-lg border border-dashed p-3">{inner}</div>
                  )}
                </li>
              )
            })}
          </ul>
          <Button variant="outline" onClick={close} className="relative" autoFocus>
            Not now
          </Button>
        </div>
      )}
    </dialog>
  )
}

// What actions are likely to cost, fetched once per page load (they move slowly).
let estimates: Promise<TokenEstimate[] | null> | null = null
export function useEstimates() {
  const [list, setList] = useState<TokenEstimate[] | null>(null)
  useEffect(() => {
    estimates ??= getTokenEstimates()
      .then((e) => e.estimates)
      .catch(() => null)
    void estimates.then(setList)
  }, [])
  return list
}
export function useEstimate(action: EstimateAction) {
  return useEstimates()?.find((e) => e.action === action) ?? null
}
export function useVoiceRate() {
  return useEstimate("voice_minute")?.about ?? null
}

// "≈ 10 tokens": a quiet hint beside an action, before the seeker spends anything.
export function TokenCost({ action, suffix = "", className }: { action: EstimateAction; suffix?: string; className?: string }) {
  const e = useEstimate(action)
  if (!e) return null
  return (
    <span title={`${e.label}: about ${formatTokens(e.about)} Plato tokens, up to ${formatTokens(e.upTo)}${e.note ? `. ${e.note}` : ""}`} className={cn("inline-flex items-center gap-1 tabular-nums", className)}>
      <Coins className="size-3 shrink-0" />≈ {formatTokens(e.about)}
      {suffix}
    </span>
  )
}

// Narrow screens have no sidebar: the balance rides in the top bar.
export function TokensChip() {
  const acc = useTokens()
  if (!acc) return null
  const low = acc.monthly > 0 && acc.balance / acc.monthly < 0.15
  return (
    <Link href="/tokens" data-ai="nav.tokens-chip" className={cn("flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums", low ? "border-warning/40 bg-warning-soft text-warning" : "bg-card text-text-secondary")}>
      <Coins className="size-3.5" />
      {formatTokens(Math.max(0, acc.balance))}
    </Link>
  )
}
