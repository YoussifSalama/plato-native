"use client"

import { useCallback, useEffect, useState } from "react"
import { PAGE, PageHeader } from "@/components/page-header"
import { useEstimates, useTokens } from "@/components/plato-tokens"
import { getTokenPrices, getTokens, type TokenMove, type TokenPrices } from "@/lib/credits/api"
import { History, SpendingBreakdown } from "./activity"
import { BalanceHero } from "./balance-hero"
import { TokensFaq } from "./faq"
import { Plans, PlansSkeleton, TopUps } from "./plans"

export default function TokensPage() {
  const acc = useTokens()
  const estimates = useEstimates()
  const [history, setHistory] = useState<TokenMove[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  // undefined while loading, null when the prices could not be fetched (the sections are left out).
  const [prices, setPrices] = useState<TokenPrices | null | undefined>(undefined)

  // The first page of history, again whenever the balance moves (a charge, a refill, a top-up); older pages on demand.
  useEffect(() => {
    getTokens(40)
      .then((a) => (setHistory(a.history), setNext(a.nextBefore)))
      .catch(() => setHistory([]))
  }, [acc?.balance])
  const more = useCallback(async () => {
    if (!next) return
    const a = await getTokens(40, next).catch(() => null)
    if (!a) return
    setHistory((h) => [...(h ?? []), ...a.history])
    setNext(a.nextBefore)
  }, [next])
  useEffect(() => {
    getTokenPrices()
      .then(setPrices)
      .catch(() => setPrices(null))
  }, [])

  const pro = prices?.plans.pro
  return (
    <div className={PAGE}>
      <PageHeader section="Account" title="Plan & credits" description="Your plan and your Plato tokens: one balance for the searches Plato runs, the resumes it writes and the interviews you practise. Applying is always free." />

      <BalanceHero acc={acc} estimates={estimates} />
      <SpendingBreakdown spent={acc?.spent ?? null} />
      {prices === undefined && <PlansSkeleton />}
      {prices && <Plans plans={prices.plans} current={acc?.plan ?? null} estimates={estimates} />}
      {prices?.topups && <TopUps packs={prices.topups} monthlyPricePer1k={pro ? (pro.priceUsd / pro.monthly) * 1000 : null} />}
      <History history={history} onMore={next ? more : null} />
      <TokensFaq />
    </div>
  )
}
