"use client"

import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { useEstimates, useTokens } from "@/components/plato-tokens"
import { getTokenPrices, getTokens, type TokenMove, type TokenPrices } from "@/lib/credits/api"
import { lineReveal, reducedVariants } from "@/lib/motion-system"
import { History, SpendingBreakdown } from "./activity"
import { BalanceHero } from "./balance-hero"
import { TokensFaq } from "./faq"
import { Plans, TopUps } from "./plans"

export default function TokensPage() {
  const reduced = !!useReducedMotion()
  const acc = useTokens()
  const estimates = useEstimates()
  const [history, setHistory] = useState<TokenMove[] | null>(null)
  const [prices, setPrices] = useState<TokenPrices | null>(null)

  // The full history once, and again whenever the balance moves (a charge, a refill, a top-up).
  useEffect(() => {
    getTokens(100)
      .then((a) => setHistory(a.history))
      .catch(() => setHistory([]))
  }, [acc?.balance])
  useEffect(() => {
    getTokenPrices()
      .then(setPrices)
      .catch(() => setPrices(null))
  }, [])

  const pro = prices?.plans.pro
  return (
    <div className="flex flex-1 flex-col gap-8 px-6 py-6 lg:pr-6 lg:pl-7">
      <motion.header variants={reduced ? reducedVariants(lineReveal) : lineReveal} initial="hidden" animate="show" className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold text-foreground">Plato tokens</h1>
        <p className="max-w-2xl text-sm text-text-secondary">One balance for everything Plato does for you: the searches it runs, the resumes it writes and the interviews you practise. Here is where you stand, and how to get more when you need it.</p>
      </motion.header>

      <BalanceHero acc={acc} estimates={estimates} />
      <SpendingBreakdown history={history} periodStart={acc?.periodStart ?? null} />
      {prices && <Plans plans={prices.plans} current={acc?.plan ?? null} estimates={estimates} />}
      {prices?.topups && <TopUps packs={prices.topups} monthlyPricePer1k={pro ? (pro.priceUsd / pro.monthly) * 1000 : null} />}
      <History history={history} />
      <TokensFaq />
    </div>
  )
}
