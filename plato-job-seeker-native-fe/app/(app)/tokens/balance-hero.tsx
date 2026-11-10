"use client"

import { motion, useReducedMotion } from "motion/react"
import { ArrowDown, FileText, MessageCircle, MessagesSquare, Mic, Search, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CARD } from "@/components/plato-ui"
import { resetLabel } from "@/components/plato-tokens"
import { formatTokens, type EstimateAction, type TokenAccount, type TokenEstimate } from "@/lib/credits/api"
import { ease } from "@/lib/motion-system"
import { InfoTip } from "@/components/info-tip"
import { CountUp, daysUntil } from "./token-ui"

// What the balance buys, in things a person does, not units.
const ENOUGH_FOR: { action: EstimateAction; label: string; one: string; icon: LucideIcon }[] = [
  { action: "career_message", label: "Career chat replies", one: "career chat reply", icon: MessageCircle },
  { action: "resume", label: "Tailored resumes", one: "tailored resume", icon: FileText },
  { action: "mock_interview", label: "Mock interviews", one: "mock interview", icon: MessagesSquare },
  { action: "voice_minute", label: "Minutes of voice interview", one: "minute of voice interview", icon: Mic },
  { action: "deep_search", label: "New job searches", one: "new job search", icon: Search },
]

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

export function BalanceHero({ acc, estimates }: { acc: TokenAccount | null; estimates: TokenEstimate[] | null }) {
  const reduced = !!useReducedMotion()
  if (!acc) return <HeroSkeleton />
  const left = Math.max(0, acc.balance)
  const bought = Math.min(acc.topup, left)
  const monthlyLeft = left - bought
  const share = acc.monthly ? Math.min(1, monthlyLeft / acc.monthly) : 0
  const days = daysUntil(acc.resetsAt)
  const empty = left < 1
  const low = !empty && share < 0.15 && bought < 1
  const planName = acc.plan[0].toUpperCase() + acc.plan.slice(1)
  const topPlan = acc.plan === "max"
  // Running low or out: the top-up is the quick way forward, so it takes the solid button.
  const topUpFirst = empty || low || topPlan
  const enough = ENOUGH_FOR.map((e) => {
    const est = estimates?.find((x) => x.action === e.action)
    return { ...e, about: est?.about ?? null, n: est ? Math.floor(left / est.about) : null }
  })

  const upgrade = (
    <a key="plans" href="#plans" data-ai="tokens.see-plans" className={buttonVariants({ variant: topUpFirst ? "outline" : "default" })}>
      Upgrade plan
    </a>
  )
  const topUp = (
    <a key="topup" href="#top-ups" data-ai="tokens.see-topups" className={buttonVariants({ variant: topUpFirst ? "default" : "outline" })}>
      Top up
    </a>
  )

  return (
    <section aria-label="Your balance" className={cn(CARD, "relative isolate overflow-hidden")}>
      {/* The soft brand glow every page hero shares (cobalt top-left, azure bottom-right). */}
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_120%_at_0%_0%,color-mix(in_oklch,var(--primary)_9%,transparent),transparent_60%),radial-gradient(50%_90%_at_100%_100%,color-mix(in_oklch,var(--azure)_10%,transparent),transparent_65%)]" />
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Where the balance stands: the number, this month's share, plan, refill, bought tokens. */}
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:justify-center">
          <div className="flex flex-col gap-2">
            <span className="eyebrow flex items-center gap-1.5">
              Balance
              <InfoTip text="This month's tokens plus any you bought. The bar shows how much of this month's refill is left; bought tokens are used last." label="What the balance includes" />
            </span>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span data-ai="tokens.balance">
                <CountUp value={left} className="text-[40px] leading-none font-semibold tracking-tight text-foreground tabular-nums" />
              </span>
              <span className="text-[15px] text-text-secondary">tokens left</span>
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary-soft" role="progressbar" aria-label="This month's tokens left" aria-valuemin={0} aria-valuemax={acc.monthly} aria-valuenow={Math.round(monthlyLeft)}>
              <motion.div className={cn("h-full rounded-full", low || empty ? "bg-warning" : "bg-primary")} initial={{ width: reduced ? `${share * 100}%` : 0 }} animate={{ width: `${share * 100}%` }} transition={{ duration: reduced ? 0 : 0.9, ease: ease.out, delay: reduced ? 0 : 0.15 }} />
            </div>
            <span className="type-meta flex items-center gap-1.5 text-text-secondary tabular-nums">
              {(low || empty) && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warning" />}
              {empty ? `This month's tokens are used up. Browsing jobs and applications stays free.` : `${formatTokens(monthlyLeft)} of ${formatTokens(acc.monthly)} monthly tokens left${low ? ", running low" : ""}`}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="type-meta text-text-tertiary">Plan</dt>
              <dd className="type-card-title text-foreground">
                {planName} <span className="font-normal text-text-secondary tabular-nums">· {formatTokens(acc.monthly)} / month</span>
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="type-meta flex items-center gap-1.5 text-text-tertiary">
                Refills
                <InfoTip text="On this date your balance resets to your plan's monthly tokens. Unused monthly tokens don't carry over; bought tokens are kept." label="How the refill works" />
              </dt>
              <dd className="type-card-title text-foreground">
                {resetLabel(acc.resetsAt)} <span className="font-normal text-text-secondary tabular-nums">· {days === 0 ? "today" : `in ${plural(days, "day")}`}</span>
              </dd>
            </div>
            {bought >= 1 && (
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="type-meta text-text-tertiary">Bought tokens</dt>
                <dd className="type-card-title text-foreground tabular-nums" title="Bought tokens are used after your monthly tokens and never expire">
                  {formatTokens(bought)} <span className="font-normal text-text-secondary">· never expire</span>
                </dd>
              </div>
            )}
          </dl>

          <div className="flex flex-wrap gap-2 pt-1">{topPlan ? [topUp] : topUpFirst ? [topUp, upgrade] : [upgrade, topUp]}</div>
        </div>

        {/* What the balance is enough for, one action per row. */}
        <div className="flex flex-col gap-2 border-t border-divider p-5 sm:p-6 lg:border-t-0 lg:border-l">
          <span className="eyebrow flex items-center gap-1.5">
            Enough for about
            <InfoTip text="Rough counts if you spent your whole balance on that one thing, at what each action has cost on average over the last 30 days." label="How these counts are worked out" />
          </span>
          <ul className="flex flex-col divide-y divide-divider">
            {enough.map(({ action, label, one, icon: Icon, n, about }, i) => (
              <li key={action} className="flex items-center gap-3 py-2.5 animate-in fade-in-0 fill-mode-both duration-500 motion-reduce:animate-none" style={{ animationDelay: `${150 + i * 60}ms` }}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-foreground">{n === 0 ? `Not enough for a ${one}` : label}</span>
                  {n === 0 && about !== null && <span className="type-meta text-text-tertiary tabular-nums">Needs about {formatTokens(about)} tokens</span>}
                </span>
                {n === null ? <Skeleton className="h-4 w-12" /> : n > 0 && <span className="text-sm font-semibold text-foreground tabular-nums">≈ {formatTokens(n)}</span>}
              </li>
            ))}
          </ul>
          {!topPlan && (
            <a href="#plans" className="group mt-1 inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-primary transition-colors duration-200 hover:text-primary-hover">
              Compare what each plan covers
              <ArrowDown className="size-3.5 transition-transform duration-200 group-hover:translate-y-0.5" />
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

function HeroSkeleton() {
  return (
    <section aria-busy="true" aria-label="Your balance" className={cn(CARD, "grid lg:grid-cols-2")}>
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-1.5 w-full rounded-full" />
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-divider p-5 sm:p-6 lg:border-t-0 lg:border-l">
        <Skeleton className="h-3 w-28" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </section>
  )
}
