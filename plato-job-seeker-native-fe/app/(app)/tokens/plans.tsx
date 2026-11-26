"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { AxiosError } from "axios"
import { Check, Coins, Infinity as Forever, Layers, Loader2, Mail, Sparkles, Zap } from "lucide-react"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PlatoMark } from "@/components/plato-orb"
import { SectionHeader } from "@/components/plato-ui"
import { formatTokens, startCheckout, SUPPORT_EMAIL, type TokenEstimate, type TokenPrices } from "@/lib/credits/api"
import { InfoTip } from "@/components/info-tip"
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

// The checkout is not open yet: say so kindly, keep what they picked in view, and give a real way to get it
// (the server has recorded the request for the team either way).
type Picked = { what: string; detail: string }
const mailto = (p: Picked) =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Plato: ${p.what}`)}&body=${encodeURIComponent(`Hi Plato team,\n\nI'd like ${p.what} (${p.detail}). Please set it up for me.\n\nThanks`)}`
function PaymentSoonDialog({ picked, onClose }: { picked: Picked | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (picked && !el.open) el.showModal()
    if (!picked && el.open) el.close()
  }, [picked])
  return (
    <dialog ref={ref} data-ai-skip onCancel={(e) => (e.preventDefault(), onClose())} onClick={(e) => e.target === ref.current && onClose()} className="m-auto w-[min(460px,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-card p-0 text-foreground shadow-[0_28px_70px_-28px_rgba(11,63,122,0.45)] backdrop:bg-foreground/30 backdrop:backdrop-blur-sm">
      {picked && (
        <div className="relative flex flex-col items-center gap-4 px-7 pt-8 pb-6 text-center">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 glow-top" />
          <PlatoMark size={48} live />
          <div className="relative flex flex-col gap-2">
            <h2 className="text-lg font-bold">Online checkout opens soon</h2>
            <p className="text-sm leading-relaxed text-text-secondary">
              Thanks for choosing <span className="font-semibold text-foreground">{picked.what}</span> ({picked.detail}). Online payment isn&apos;t open yet, so nothing is charged here. We&apos;ve noted your request{" "}
              {SUPPORT_EMAIL ? (
                <>
                  and the Plato team sets it up with you by email. Write to us at <span className="font-medium text-foreground">{SUPPORT_EMAIL}</span>.
                </>
              ) : (
                "and the Plato team will email you at the address on your account to set it up."
              )}
            </p>
          </div>
          {SUPPORT_EMAIL && (
            <a href={mailto(picked)} className={cn(buttonVariants(), "relative w-full")}>
              <Mail className="size-4" />
              Email the Plato team
            </a>
          )}
          <Button variant={SUPPORT_EMAIL ? "outline" : "default"} onClick={onClose} className="relative w-full" autoFocus={!SUPPORT_EMAIL}>
            {SUPPORT_EMAIL ? "Not now" : "Got it"}
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
  // One solid button per view: the next plan up from yours. Every other upgrade is an outline.
  const next = ORDER.find((k) => plans[k] && k !== "free" && (current === null ? k === "pro" : rank(k) > rank(current)))
  return (
    <section id="plans" className="flex scroll-mt-6 flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <SectionHeader title="Plans" icon={Layers} accent="cobalt" />
        <p className="text-sm text-text-secondary">Every plan refills each month. Online payment opens soon; until then the Plato team sets up a plan with you by email, and it starts with a fresh month of tokens.</p>
      </div>
      <motion.div variants={staggerContainer} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        {ORDER.filter((k) => plans[k]).map((k) => {
          const p = plans[k]
          const mine = current === k
          const featured = k === next
          const perks = perMonth(p.monthly, estimates).slice(0, 3)
          const downgrade = current !== null && rank(k) < rank(current)
          return (
            <motion.div
              key={k}
              variants={reduced ? undefined : fadeUpItem}
              data-ai={`tokens.plan.${k}`}
              aria-current={mine ? "true" : undefined}
              className={cn(
                "relative flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card transition-[box-shadow,border-color] duration-200 sm:p-6",
                mine ? "border-primary ring-1 ring-primary/20" : featured ? "border-primary-line" : "hover:border-primary-line",
              )}
            >
              <div className="flex min-h-6 items-center justify-between gap-2">
                <span className="type-card-title flex items-center gap-2 text-foreground">
                  {k === "max" ? <Zap className="size-4 text-primary" /> : k === "pro" ? <Sparkles className="size-4 text-primary" /> : <Coins className="size-4 text-text-tertiary" />}
                  {p.label}
                </span>
                {mine ? (
                  <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
                    <Check className="size-3" />
                    Your plan
                  </span>
                ) : k === "pro" ? (
                  <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">Most popular</span>
                ) : null}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-[32px] leading-none font-semibold tracking-tight text-foreground tabular-nums">{p.priceUsd ? `$${p.priceUsd}` : "$0"}</span>
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
                <div className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-muted text-sm font-medium text-text-secondary">
                  <Check className="size-4 text-primary" />
                  Your current plan
                </div>
              ) : k === "free" || downgrade ? (
                <div className="flex h-10 items-center justify-center text-[13px] text-text-tertiary">{downgrade ? "Your plan already includes more" : "Always available"}</div>
              ) : (
                <Button
                  variant={featured ? "default" : "outline"}
                  onClick={() => void go(k, { plan: k as "pro" | "max" }, { what: `the ${p.label} plan`, detail: `$${p.priceUsd} a month, ${formatTokens(p.monthly)} tokens` })}
                  disabled={!!busy}
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
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5">
          <SectionHeader title="Top up" icon={Coins} accent="cobalt" />
          <InfoTip text="“Save” compares a pack's price per 1,000 tokens with the priciest pack's." label="How top-up savings work" />
        </span>
        <p className="text-sm text-text-secondary">
          Need more before your refill? Buy a pack once. Bought tokens <span className="font-medium text-foreground">never expire</span> and are used after your monthly ones.
          {monthlyPricePer1k !== null && " For steady use, a plan works out cheaper."}
        </p>
      </div>
      <motion.div variants={staggerContainer} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="grid gap-3 lg:grid-cols-3">
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
              aria-label={`Buy ${formatTokens(p.tokens)} tokens for $${p.priceUsd}`}
              className="group relative flex items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-card transition-[box-shadow,border-color] duration-200 hover:border-primary-line hover:shadow-[0_18px_44px_-28px_rgba(11,63,122,0.45)] disabled:opacity-60"
            >
              <span className="relative flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                {busy === key ? <Loader2 className="size-5 animate-spin" /> : <Coins className="size-5 transition-transform duration-200 group-hover:-rotate-12" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <span className="text-base font-bold text-foreground tabular-nums">{formatTokens(p.tokens)}</span>
                  <span className="text-sm text-text-tertiary">tokens</span>
                  {saving > 0 && <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-success">Save {saving}%</span>}
                </span>
                <span className="flex items-center gap-1 text-xs text-text-tertiary">
                  <Forever className="size-3" />${per1k(p).toFixed(2)} per 1,000 tokens
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className="text-lg font-semibold text-foreground tabular-nums">${p.priceUsd}</span>
                <span className="type-meta text-text-tertiary">one time</span>
              </span>
              {/* ponytail: the whole card is the button; this is its visible label */}
              <span aria-hidden className="inline-flex h-9 shrink-0 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90">
                Buy
              </span>
            </motion.button>
          )
        })}
      </motion.div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {dialog}
    </section>
  )
}

// While prices load: the same three plan cards and three packs, so nothing jumps.
export function PlansSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-40" />
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-80 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
