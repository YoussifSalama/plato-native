"use client"

import { motion, useReducedMotion } from "motion/react"
import { CalendarClock, FileText, Infinity as Forever, MessageCircle, MessagesSquare, Mic, Search, Sparkles, type LucideIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { resetLabel } from "@/components/plato-tokens"
import { formatTokens, type EstimateAction, type TokenAccount, type TokenEstimate } from "@/lib/credits/api"
import { lineReveal, nodeContent, reducedVariants, spring } from "@/lib/motion-system"
import { BalanceRing, CountUp, daysUntil } from "./token-ui"

// What the balance buys, in things a person does, not units.
const ENOUGH_FOR: { action: EstimateAction; one: string; many: string; icon: LucideIcon }[] = [
  { action: "career_message", one: "career chat reply", many: "career chat replies", icon: MessageCircle },
  { action: "resume", one: "tailored resume", many: "tailored resumes", icon: FileText },
  { action: "mock_interview", one: "mock interview", many: "mock interviews", icon: MessagesSquare },
  { action: "voice_minute", one: "minute of voice interview", many: "minutes of voice interview", icon: Mic },
  { action: "deep_search", one: "new job search", many: "new job searches", icon: Search },
]

// A sentence for where the month stands, the way a person would say it.
function mood(share: number, days: number, empty: boolean) {
  if (empty) return { title: "You've used this month's tokens", body: `They refill in ${days} day${days === 1 ? "" : "s"}. Browsing your jobs and applications stays free, or top up below to keep going now.` }
  if (share < 0.15) return { title: "Running low this month", body: `A little left to work with. Your tokens refill in ${days} day${days === 1 ? "" : "s"}, or a top-up keeps you going.` }
  if (share < 0.5) return { title: "Plenty left for focused work", body: "Spend them on what moves your search forward: tailored resumes and interview practice." }
  return { title: "You're in good shape this month", body: "Everything Plato does for you comes out of this balance. Here is what it covers right now." }
}

export function BalanceHero({ acc, estimates }: { acc: TokenAccount | null; estimates: TokenEstimate[] | null }) {
  const reduced = !!useReducedMotion()
  const v = (x: typeof lineReveal) => (reduced ? reducedVariants(x) : x)
  if (!acc) return <HeroSkeleton />
  const left = Math.max(0, acc.balance)
  const bought = Math.min(acc.topup, left)
  const monthlyLeft = left - bought
  const share = acc.monthly ? Math.min(1, monthlyLeft / acc.monthly) : 0
  const days = daysUntil(acc.resetsAt)
  const m = mood(share, days, left < 1)
  const low = share < 0.15
  const enough = ENOUGH_FOR.map((e) => {
    const est = estimates?.find((x) => x.action === e.action)
    const n = est ? Math.floor(left / est.about) : null
    return { ...e, n }
  })

  return (
    <section className="relative overflow-hidden rounded-xl border bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] bg-[size:22px_22px]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 glow-top" />
      <div className="relative grid gap-8 p-6 md:p-8 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-12">
        {/* The ring: the share of this month's tokens still left, the total in the middle. */}
        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={spring.enter} className="relative mx-auto size-44 shrink-0 lg:mx-0">
          <BalanceRing share={share} low={low} />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span data-ai="tokens.balance">
              <CountUp value={left} className="text-4xl font-bold tracking-tight text-foreground tabular-nums" />
            </span>
            <span className="mt-0.5 text-xs font-medium text-text-tertiary">tokens left</span>
          </div>
        </motion.div>

        <motion.div variants={reduced ? reducedVariants(nodeContent) : nodeContent} initial="hidden" animate="show" className="flex min-w-0 flex-col gap-5">
          <motion.div variants={v(lineReveal)} className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border bg-card/80 px-3 py-1 text-xs font-semibold text-primary backdrop-blur">
              <Sparkles className="size-3.5" />
              {acc.plan[0].toUpperCase() + acc.plan.slice(1)} plan
            </span>
            <span className="flex items-center gap-1.5 rounded-full border bg-card/80 px-3 py-1 text-xs text-text-secondary backdrop-blur">
              <CalendarClock className="size-3.5 text-primary" />
              {formatTokens(acc.monthly)} refill on <span className="font-semibold text-foreground">{resetLabel(acc.resetsAt)}</span>
              <span className="text-text-tertiary">· in {days} day{days === 1 ? "" : "s"}</span>
            </span>
            {bought >= 1 && (
              <span className="flex items-center gap-1.5 rounded-full border border-teal/25 bg-teal-soft/70 px-3 py-1 text-xs text-teal backdrop-blur" title="Bought tokens are used after your monthly tokens and never expire">
                <Forever className="size-3.5" />
                {formatTokens(bought)} bought, never expire
              </span>
            )}
          </motion.div>

          <motion.div variants={v(lineReveal)} className="flex flex-col gap-1.5">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{m.title}</h2>
            <p className="max-w-xl text-sm leading-relaxed text-text-secondary">{m.body}</p>
          </motion.div>

          {left >= 1 && (
            <motion.div variants={v(lineReveal)} className="flex flex-col gap-2.5">
              <span className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">What that&apos;s enough for</span>
              <ul className="flex flex-wrap gap-2">
                {enough.map(({ action, one, many, icon: Icon, n }, i) => (
                  <motion.li
                    key={action}
                    initial={reduced ? false : { opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ ...spring.settle, delay: reduced ? 0 : 0.35 + i * 0.06 }}
                    className="flex items-center gap-2 rounded-lg border bg-card/90 py-2 pr-3.5 pl-2 shadow-[0_10px_30px_-22px_rgba(0,91,167,0.5)] backdrop-blur"
                  >
                    <span className="flex size-7 items-center justify-center rounded-md bg-primary-soft text-primary">
                      <Icon className="size-3.5" />
                    </span>
                    {n === null ? (
                      <Skeleton className="h-4 w-28" />
                    ) : (
                      <span className="text-sm text-text-secondary">
                        <span className="font-bold text-foreground tabular-nums">{n > 0 ? `≈ ${formatTokens(n)}` : "Not quite"}</span> {n === 1 ? one : n > 0 ? many : `a ${one}`}
                      </span>
                    )}
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  )
}

function HeroSkeleton() {
  return (
    <section className="grid gap-8 rounded-xl border bg-card p-8 lg:grid-cols-[auto_1fr] lg:items-center">
      <Skeleton className="mx-auto size-44 rounded-full lg:mx-0" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-56 rounded-full" />
        <Skeleton className="h-7 w-80" />
        <Skeleton className="h-4 w-full max-w-lg" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-48 rounded-lg" />
          ))}
        </div>
      </div>
    </section>
  )
}
