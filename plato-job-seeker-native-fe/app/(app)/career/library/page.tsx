"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { ArrowRight, Mic, Search, SearchX } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { CARD, EmptyState, StatIcon } from "@/components/plato-ui"
import { PillTabs } from "@/components/pill-tabs"
import { CareerNav } from "@/components/career-nav"
import { SOFT_CTA } from "@/components/career-hub"
import { CATALOG, CAT_ACCENT, PRACTICE_CATS, startHref, type PracticeCat } from "@/lib/career-hub/catalog"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"

type Cat = "All" | PracticeCat

// Every test and non-interview practice in one place. Items with their own screen open it;
// the rest start the career coach chat with the request filled in.
export default function LibraryPage() {
  const [cat, setCat] = useState<Cat>("All")
  const [q, setQ] = useState("")
  const query = q.trim().toLowerCase()
  const matches = useMemo(() => CATALOG.filter((p) => !query || `${p.title} ${p.body} ${p.cat}`.toLowerCase().includes(query)), [query])
  const list = matches.filter((p) => cat === "All" || p.cat === cat)
  const tabs = (["All", ...PRACTICE_CATS] as Cat[]).map((c) => ({ key: c, label: c, count: c === "All" ? matches.length : matches.filter((p) => p.cat === c).length }))

  return (
    <div className={PAGE}>
      <PageHeader title="Practice library" description="Every test, skill and resume exercise in Career. Pick one and start; scores land in your results." />
      <CareerNav />

      <div data-tour="library-filters" className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs id="library-cat" label="Category" dataAi="library.cat" tabs={tabs} value={cat} onChange={setCat} />
        <label className="flex h-10 w-full items-center gap-2 rounded-xl border bg-card px-3 transition-colors duration-200 focus-within:border-primary-line sm:max-w-[280px]">
          <Search className="size-4 text-text-tertiary" />
          <span className="sr-only">Search practice</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} data-ai="library.search" placeholder="Search practice" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-tertiary" />
        </label>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={SearchX}
          className="bg-card"
          title="Nothing matches that search"
          hint="Try a shorter word, or look through all categories."
          action={
            <button type="button" data-ai="library.clear" onClick={() => (setQ(""), setCat("All"))} className={SOFT_CTA}>
              Clear search
            </button>
          }
        />
      ) : (
        <motion.ul key={`${cat}-${query}`} data-tour="library-list" variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <motion.li key={p.id} variants={fadeUpItem} className="min-w-0">
              <Link href={startHref(p)} data-ai={`library.start:${p.id}`} className={cn(CARD, "card-lift group flex h-full min-w-0 flex-col gap-2 p-4")}>
                <span className="flex items-center justify-between gap-2">
                  <StatIcon icon={p.icon} accent={CAT_ACCENT[p.cat]} />
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-text-secondary">{p.cat}</span>
                </span>
                <b className="type-card-title mt-1 leading-snug text-foreground">{p.title}</b>
                <span className="text-[13px] leading-relaxed text-text-secondary">{p.body}</span>
                <span className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <span className="type-meta truncate text-text-secondary">{p.meta}</span>
                  <span className={cn(SOFT_CTA, "group-hover:bg-primary group-hover:text-primary-foreground")}>
                    {p.href ? "Open" : "Start"}
                    <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </span>
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      )}
      {/* Interviews have their own place now: one flow for every kind of interview. */}
      <Link href="/career/interviews/new" data-ai="library.interviews" className={cn(CARD, "group flex items-center gap-3 p-4 transition-colors duration-200 hover:border-primary-line")}>
        <StatIcon icon={Mic} accent="cobalt" />
        <span className="min-w-0 flex-1">
          <b className="block text-[14.5px] text-foreground">Looking for interview practice?</b>
          <span className="block text-[13px] text-text-secondary">Job interviews, general practice, salary negotiation, case interviews, pitches and business English all start from Interviews.</span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-text-tertiary transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
      </Link>
      <p className="text-xs text-text-tertiary">Items marked Start open your career coach with the request ready; the others have their own screen.</p>
    </div>
  )
}
