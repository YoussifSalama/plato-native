"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { AxiosError } from "axios"
import { Check, Coins, Infinity as Forever, Loader2, Sparkles, Zap } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { PlatoMark } from "@/components/plato-orb"
import { formatTokens, startCheckout, type TokenEstimate, type TokenPrices } from "@/lib/credits/api"
import { spring } from "@/lib/motion-system"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"

const ORDER = ["free", "pro", "max"] as const
const PITCH: Record<string, string> = {
  free: "Get to know Plato. Enough for a few searches, chats and some interview practice.",
  pro: "For an active search: deep searches across paid boards, a tailored resume per application, regular practice.",
  max: "For a full-time search: room for daily deep searches and long voice interviews.",
}

// A month of tokens in things a person does: "≈ 280 tailored resumes, or 14 new searches".
function perMonth(tokens: number, estimates: TokenEstimate[] | null) {
  const n = (a: TokenEstimate["action"]) => {
    const e = estimates?.find((x) => x.action === a)
    return e ? Math.floor(tokens / e.about) : null
  }
  return [
    { label: "tailored resumes", n: n("resume") },
    { label: "mock interviews", n: n("mock_interview") },
    { label: "minutes of voice practice", n: n("voice_minute") },
    { label: "new job searches", n: n("deep_search") },
  ].filter((x) => x.n !== null && x.n > 0)
}

// The checkout is not open yet: say so kindly, keep what they picked in view.
type Picked = { what: string; detail: string }
function PaymentSoonDialog({ picked, onClose }: { picked: Picked | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (picked && !el.open) el.showModal()
    if (!picked && el.open) el.close()
  }, [picked])
  return (
    <dialog ref={ref} data-ai-skip onCancel={(e) => (e.preventDefault(), onClose())} onClick={(e) => e.target === ref.current && onClose()} className="m-auto w-[min(460px,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-card p-0 text-foreground shadow-[0_28px_70px_-28px_rgba(0,91,167,0.45)] backdrop:bg-foreground/30 backdrop:backdrop-blur-sm">
      {picked && (
        <div className="relative flex flex-col items-center gap-4 px-7 pt-8 pb-6 text-center">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 glow-top" />
          <PlatoMark size={48} live />
          <div className="relative flex flex-col gap-2">
            <h2 className="text-lg font-bold">Online checkout opens soon</h2>
            <p className="text-sm leading-relaxed text-text-secondary">
              Thanks for choosing <span className="font-semibold text-foreground">{picked.what}</span> ({picked.detail}). We&apos;re finishing secure payments right now. Until they open, the Plato team can set this up for you by hand, and nothing is charged here.
            </p>
          </div>
          <Button onClick={onClose} className="relative w-full" autoFocus>
            Got it
          </Button>
        </div>
      )}
    </dialog>
  )
}

function useCheckout() {
  const [busy, setBusy] = useState<string | null>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [error, setError] = useState<string | null>(null)
  const go = async (key: string, item: Parameters<typeof startCheckout>[0], what: Picked) => {
    setBusy(key)
    setError(null)
    try {
      const { url } = await startCheckout(item)
      window.location.assign(url)
    } catch (e) {
      const code = e instanceof AxiosError ? (e.response?.data as { code?: string } | undefined)?.code : undefined
      if (code === "payments_unavailable") setPicked(what)
      else setError(e instanceof AxiosError ? ((e.response?.data as { message?: string } | undefined)?.message ?? "Could not start the payment.") : "Could not start the payment.")
    } finally {
      setBusy(null)
    }
  }
  return { busy, go, error, dialog: <PaymentSoonDialog picked={picked} onClose={() => setPicked(null)} /> }
}

export function Plans({ plans, current, estimates }: { plans: TokenPrices["plans"]; current: string | null; estimates: TokenEstimate[] | null }) {
  const reduced = !!useReducedMotion()
  const { busy, go, error, dialog } = useCheckout()
  const rank = (k: string) => ORDER.indexOf(k as (typeof ORDER)[number])
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-foreground">Plans</h2>
        <p className="text-sm text-text-secondary">Every plan refills each month. Switching takes effect right away, with a fresh month of tokens.</p>
      </div>
      <motion.div variants={staggerContainer} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="grid gap-4 md:grid-cols-3 md:items-stretch">
        {ORDER.filter((k) => plans[k]).map((k) => {
          const p = plans[k]
          const mine = current === k
          const featured = k === "pro"
          const perks = perMonth(p.monthly, estimates).slice(0, 3)
          const downgrade = current !== null && rank(k) < rank(current)
          return (
            <motion.div
              key={k}
              variants={reduced ? undefined : fadeUpItem}
              whileHover={reduced ? undefined : { y: -4 }}
              transition={spring.settle}
              data-ai={`tokens.plan.${k}`}
              className={cn(
                "relative flex flex-col gap-4 rounded-xl border bg-card p-6 transition-shadow",
                featured ? "border-primary/40 shadow-[0_24px_60px_-30px_rgba(0,91,167,0.55)]" : "hover:shadow-[0_18px_44px_-28px_rgba(0,91,167,0.4)]",
                mine && !featured && "border-primary/30",
              )}
            >
              {featured && <div aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />}
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-base font-bold text-foreground">
                  {k === "max" ? <Zap className="size-4 text-primary" /> : k === "pro" ? <Sparkles className="size-4 text-primary" /> : <Coins className="size-4 text-text-tertiary" />}
                  {p.label}
                </span>
                {mine ? (
                  <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
                    <Check className="size-3" />
                    Your plan
                  </span>
                ) : featured ? (
                  <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">Most popular</span>
                ) : null}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-foreground">{p.priceUsd ? `$${p.priceUsd}` : "$0"}</span>
                <span className="text-sm text-text-tertiary">/ month</span>
              </div>
              <p className="text-sm leading-relaxed text-text-secondary">{PITCH[k]}</p>
              <div className="h-px bg-divider" />
              <ul className="flex flex-1 flex-col gap-2.5 text-sm">
                <li className="flex items-center gap-2.5 font-semibold text-foreground">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {formatTokens(p.monthly)} tokens every month
                </li>
                {perks.map((x) => (
                  <li key={x.label} className="flex items-center gap-2.5 text-text-secondary">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    <span>
                      about <span className="font-semibold text-foreground tabular-nums">{formatTokens(x.n!)}</span> {x.label}
                    </span>
                  </li>
                ))}
              </ul>
              {mine ? (
                <div className="flex h-11 items-center justify-center rounded-lg bg-muted text-sm font-medium text-text-secondary">You&apos;re on this plan</div>
              ) : k === "free" || downgrade ? (
                <div className="flex h-11 items-center justify-center text-xs text-text-tertiary">{k === "free" ? "Always available" : "Included in your plan"}</div>
              ) : (
                <Button
                  variant={featured ? "default" : "outline"}
                  onClick={() => void go(k, { plan: k as "pro" | "max" }, { what: `the ${p.label} plan`, detail: `$${p.priceUsd} a month, ${formatTokens(p.monthly)} tokens` })}
                  disabled={!!busy}
                  className={cn(featured && "shadow-[0_12px_30px_-14px_rgba(0,91,167,0.8)]")}
                >
                  {busy === k && <Loader2 className="size-4 animate-spin" />}
                  Upgrade to {p.label}
                </Button>
              )}
            </motion.div>
          )
        })}
      </motion.div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {dialog}
    </section>
  )
}

export function TopUps({ packs, monthlyPricePer1k }: { packs: TokenPrices["topups"]; monthlyPricePer1k: number | null }) {
  const reduced = !!useReducedMotion()
  const { busy, go, error, dialog } = useCheckout()
  const entries = Object.entries(packs)
  const per1k = (p: { tokens: number; priceUsd: number }) => (p.priceUsd / p.tokens) * 1000
  const base = Math.max(...entries.map(([, p]) => per1k(p)))
  return (
    <section id="top-ups" className="flex scroll-mt-6 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-foreground">Top up</h2>
        <p className="text-sm text-text-secondary">
          Need more before your refill? Buy a pack once. Bought tokens <span className="font-medium text-foreground">never expire</span> and are used after your monthly ones.
          {monthlyPricePer1k !== null && " For steady use, a plan works out cheaper."}
        </p>
      </div>
      <motion.div variants={staggerContainer} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="grid gap-3 sm:grid-cols-3">
        {entries.map(([key, p]) => {
          const saving = Math.round((1 - per1k(p) / base) * 100)
          return (
            <motion.button
              key={key}
              type="button"
              variants={reduced ? undefined : fadeUpItem}
              whileHover={reduced ? undefined : { y: -3 }}
              whileTap={reduced ? undefined : { scale: 0.98 }}
              transition={spring.settle}
              disabled={!!busy}
              onClick={() => void go(key, { pack: key }, { what: `${formatTokens(p.tokens)} tokens`, detail: `$${p.priceUsd}, one time, never expire` })}
              data-ai={`tokens.topup.${key}`}
              className="group relative flex items-center gap-4 rounded-xl border bg-card p-4 text-left transition-shadow hover:border-primary/30 hover:shadow-[0_18px_44px_-28px_rgba(0,91,167,0.45)] disabled:opacity-60"
            >
              <span className="relative flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                {busy === key ? <Loader2 className="size-5 animate-spin" /> : <Coins className="size-5 transition-transform group-hover:-rotate-12" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <span className="text-base font-bold text-foreground tabular-nums">{formatTokens(p.tokens)}</span>
                  <span className="text-sm text-text-tertiary">tokens</span>
                  {saving > 0 && <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">Save {saving}%</span>}
                </span>
                <span className="flex items-center gap-1 text-xs text-text-tertiary">
                  <Forever className="size-3" />${per1k(p).toFixed(2)} per 1,000 · never expire
                </span>
              </span>
              <span className="text-lg font-bold text-foreground">${p.priceUsd}</span>
            </motion.button>
          )
        })}
      </motion.div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {dialog}
    </section>
  )
}
