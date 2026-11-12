"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"
import { PAGE_DOCK, PageHeader } from "@/components/page-header"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { PillTabs, type PillTab } from "@/components/pill-tabs"
import { InfoTip } from "@/components/info-tip"
import { getDiscoveryStats, getMatches, type DiscoveryStats, type JobMatch, type MatchTab, type ThreadSummary } from "@/lib/jobs/api"
import { threadHref } from "@/lib/jobs/links"
import { ResultsView } from "./components/results-view"
import { SearchesSidebar } from "./components/searches-sidebar"

// All jobs: the same page as one search's results (sidebar | results), over every search at once.
const TAB_KEYS = ["discover", "saved", "applied", "hidden"] as const

function JobsContent() {
  const router = useRouter()
  const params = useSearchParams()
  // Old links (/jobs?search=<id>) open the search's own page, the one place a search lives.
  const searchId = params.get("search")
  useEffect(() => {
    if (searchId) router.replace(threadHref(searchId))
  }, [searchId, router])
  // "See roles" on Following opens this page for one company: it starts as the search text.
  const company = params.get("company")?.trim() || ""
  const [q, setQ] = useState(company)
  // The tab lives in the URL (/jobs?tab=saved), so Back from a job lands on it again.
  const tab: MatchTab = TAB_KEYS.find((t) => t === params.get("tab")) ?? "discover"
  const setTab = (next: MatchTab) => {
    const p = new URLSearchParams(params.toString())
    if (next === "discover") p.delete("tab")
    else p.set("tab", next)
    router.replace(p.toString() ? `/jobs?${p}` : "/jobs", { scroll: false })
  }

  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [stats, setStats] = useState<DiscoveryStats | null>(null)
  const [appliedTotal, setAppliedTotal] = useState<number | null>(null)
  const [shown, setShown] = useState<number | null>(null)
  useEffect(() => {
    getDiscoveryStats()
      .then(setStats)
      .catch(() => setStats(null))
    // The Applied tab's count is what that tab lists (every status), not only the sent ones.
    getMatches({ tab: "applied", take: 1 })
      .then((r) => setAppliedTotal(r.total))
      .catch(() => setAppliedTotal(null))
  }, [])
  const onState = useCallback((s: { items: JobMatch[] }) => setShown(s.items.length), [])

  const TABS: PillTab<MatchTab>[] = [
    { key: "discover", label: "For you" },
    { key: "saved", label: "Saved", count: stats?.saved },
    { key: "applied", label: "Applied", count: appliedTotal ?? undefined },
    { key: "hidden", label: "Hidden" },
  ]
  // Which screen the page tour explains: no searches yet, an empty tab, or a tab with jobs.
  const screen = shown === null ? undefined : threads?.length === 0 ? "jobs.new" : shown === 0 ? `jobs.${tab}.empty` : `jobs.${tab}`

  if (searchId) return null
  return (
    <div className={PAGE_DOCK} data-tour-state={screen}>
      <PageHeader
        title="All jobs"
        actions={
          <InputGroup data-tour="results-search" className="w-80 max-w-full rounded-full bg-card">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search all jobs" placeholder="Search title, company, place or skill" />
          </InputGroup>
        }
      />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <SearchesSidebar activeId={null} onThreads={setThreads} />
        <div className="flex min-w-0 flex-col gap-5">
          <ResultsView
            tab={tab}
            q={q}
            command={null}
            onState={onState}
            tabs={
              <div data-tour="results-tabs" className="flex items-center gap-1.5">
                <PillTabs id="jobs-tabs" tabs={TABS} value={tab} onChange={setTab} label="Jobs" dataAi="jobs.tab" />
                <InfoTip text="For you is every match from all your searches. Saved, Applied and Hidden are the jobs you bookmarked, sent and passed on." label="What these lists show" />
              </div>
            }
          />
        </div>
      </div>
    </div>
  )
}

export default function JobsPage() {
  return (
    <Suspense>
      <JobsContent />
    </Suspense>
  )
}
