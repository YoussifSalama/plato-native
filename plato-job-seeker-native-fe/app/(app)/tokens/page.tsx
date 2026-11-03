"use client"

import { useEffect, useState } from "react"
import { PAGE, PageHeader } from "@/components/page-header"
import { useEstimates, useTokens } from "@/components/plato-tokens"
import { getTokenPrices, getTokens, type TokenMove, type TokenPrices } from "@/lib/credits/api"
import { History, SpendingBreakdown } from "./activity"
import { BalanceHero } from "./balance-hero"
import { TokensFaq } from "./faq"
import { Plans, TopUps } from "./plans"

export default function TokensPage() {
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
    <div className={PAGE}>
      <PageHeader section="Account" title="Plato tokens" description="One balance for the searches Plato runs, the resumes it writes and the interviews you practise. Applying is always free." />

      <BalanceHero acc={acc} estimates={estimates} />
      <SpendingBreakdown history={history} periodStart={acc?.periodStart ?? null} />
      {prices && <Plans plans={prices.plans} current={acc?.plan ?? null} estimates={estimates} />}
      {prices?.topups && <TopUps packs={prices.topups} monthlyPricePer1k={pro ? (pro.priceUsd / pro.monthly) * 1000 : null} />}
      <History history={history} />
      <TokensFaq />
    </div>
  )
}
