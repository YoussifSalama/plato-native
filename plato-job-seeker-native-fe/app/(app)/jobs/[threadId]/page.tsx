"use client"

import { PAGE_DOCK, PageHeader } from "@/components/page-header"
import { use, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import {
  getRun,
  getThread,
  runEventsUrl,
  type ChatThread,
  type DiscoveryRun,
  type RunProgress,
  type MatchTab,
  type JobMatch,
  type MatchFilters,
  type MatchSort,
  type OrchestratorEvent,
  type UiCommand,
  type ChatUiContext,
} from "@/lib/jobs/api"
import { JOBS_HOME, PAGE_PATH, threadHref } from "@/lib/jobs/links"
import { runPageEvent } from "@/lib/page-map"
import { cursorTo } from "@/components/agent-cursor"
import { setSearchHost, type SearchHost } from "@/lib/assistant/search-host"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
// The live journey pulls in the flow-diagram library; load it only when a search is running.
const SearchingView = dynamic(() => import("../components/searching-view").then((m) => m.SearchingView), { loading: () => <Skeleton className="h-[560px] w-full rounded-2xl" /> })
import { useJourneyLog } from "../components/journey/use-journey-log"
import { ResultsView } from "../components/results-view"
import { SearchesSidebar } from "../components/searches-sidebar"
import { PillTabs } from "@/components/pill-tabs"
import { InfoTip } from "@/components/info-tip"

const TABS: { key: MatchTab; label: string }[] = [
  { key: "discover", label: "Discover" },
  { key: "saved", label: "Saved" },
  { key: "applied", label: "Applied" },
  { key: "recommended", label: "Recommended" },
]
const POLL_MS = 4000
// The live flow diagram of the job sites being read; hidden for now (owner, 2026-11-13), not deleted.
const SHOW_JOURNEY = false

export default function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const runParam = searchParams.get("run")

  const [thread, setThread] = useState<ChatThread | null>(null)
  const [run, setRun] = useState<DiscoveryRun | null>(null)
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  // A list command from the assistant (filter, open job); ResultsView applies each once.
  const [command, setCommand] = useState<UiCommand | null>(null)
  // What the results list shows right now; read when a message is sent, so no re-render.
  const onScreen = useRef<{
    items: JobMatch[]
    filters: MatchFilters
    sort: MatchSort
  } | null>(null)
  const reportScreen = useCallback((s: { items: JobMatch[]; filters: MatchFilters; sort: MatchSort }) => {
    onScreen.current = s
  }, [])
  // The active tab lives in the URL: /jobs/<id>?tab=saved
  const tabParam = searchParams.get("tab")
  const tab: MatchTab = TABS.some((t) => t.key === tabParam) ? (tabParam as MatchTab) : "discover"
  const setTab = useCallback(
    (next: MatchTab) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set("tab", next)
      router.replace(`${threadHref(threadId)}?${params.toString()}`, {
        scroll: false,
      })
    },
    [router, searchParams, threadId],
  )
  // The journey keeps the stage until its payoff beat has played; a run
  // that was already finished when we arrived skips straight to results.
  const [journeyDone, setJourneyDone] = useState(false)

  // A deep link can name a specific run; otherwise the thread's latest one.
  const adoptThread = useCallback((t: ChatThread, runId?: string | null) => {
    setThread(t)
    const picked = (runId && t.discovery_runs.find((r) => r.id === runId)) || t.discovery_runs[0] || null
    setRun(picked)
    setProgress(picked?.progress ?? null)
    setJourneyDone(!picked || picked.status !== "RUNNING")
  }, [])

  useEffect(() => {
    let cancelled = false
    getThread(threadId)
      .then((t) => {
        if (!cancelled) adoptThread(t, runParam)
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load this search")
      })
    return () => {
      cancelled = true
    }
  }, [threadId, runParam, adoptThread])

  // Live progress over SSE while a run is in flight; poll as a fallback.
  useEffect(() => {
    if (!run || run.status !== "RUNNING") return
    const runId = run.id
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      getRun(runId)
        .then(setRun)
        .catch(() => {})
    }
    const es = new EventSource(runEventsUrl(runId), { withCredentials: true })
    let poll: ReturnType<typeof setInterval> | null = null
    es.onmessage = (e) => {
      const p = JSON.parse(e.data) as RunProgress
      setProgress(p)
      if (p.stage === "done" || p.stage === "failed") {
        es.close()
        finish()
      }
    }
    es.onerror = () => {
      es.close()
      poll ??= setInterval(() => {
        getRun(runId)
          .then((r) => {
            if (r.progress) setProgress(r.progress)
            if (r.status !== "RUNNING") {
              if (poll) clearInterval(poll)
              setRun(r)
            }
          })
          .catch(() => {})
      }, POLL_MS)
    }
    return () => {
      es.close()
      if (poll) clearInterval(poll)
    }
  }, [run])

  // New search is its own page (no chat); an empty search is set up there too.
  const newSearch = () => router.push("/jobs/new")

  const view = !run ? "chat" : run.status === "RUNNING" || !journeyDone ? "searching" : "results"
  // A search under way opens on the search page itself: the sentence, the details and the live side panel.
  // This page shows results only. A search under way, or one never started, lives on the search page; an old link
  // that lands here moves on at once, with nothing shown in between.
  const elsewhere = !SHOW_JOURNEY && !!thread && (!run || run.status === "RUNNING")
  useEffect(() => {
    if (elsewhere) router.replace(run ? `/jobs/search?thread=${threadId}&run=${run.id}` : `/jobs/search?thread=${threadId}`)
  }, [elsewhere, run, router, threadId])
  useEffect(() => {
    if (view === "results" && !tabParam) setTab("discover")
  }, [view, tabParam, setTab])
  const messages = thread?.messages ?? []
  // Which screen the page tour explains: the first chat, the chat under way, the live search, or the results (by tab, or failed).
  const screen = !thread ? undefined : view === "chat" ? (messages.some((m) => m.role === "USER") ? "search.chat" : "search.start") : view === "searching" ? "search.running" : run?.status === "FAILED" ? "search.failed" : tab === "discover" ? "search.results" : `search.${tab}`
  const journey = useJourneyLog(view === "searching" ? progress : null, run?.query)

  // What the assistant asked the app to do. Navigation first; list commands wait for the results view.
  async function runAssistantActions(events: OrchestratorEvent[]) {
    for (const e of events) {
      if (e.type === "navigate") {
        if (e.page === "jobs" && e.tab) {
          await cursorTo(`[data-ai="results.tab.${e.tab}"]`, `Opening ${e.tab}`)
          setTab(e.tab)
        } else await runPageEvent({ type: "goto", path: PAGE_PATH[e.page] }, router.push)
      } else if (e.type === "click" || e.type === "type_text" || e.type === "goto") {
        await runPageEvent(e, router.push)
      } else if (e.type === "open_extension_progress") window.dispatchEvent(new Event("plato:open-extension-progress"))
      else if (e.type !== "search_started") {
        // Point at what is about to change, then change it.
        await cursorTo(e.type === "open_job" ? `#job-row-${e.position}` : e.type === "propose_apply" ? '[data-ai="results.apply-top"]' : '[data-ai="results.filters"]', e.type === "open_job" ? `Job #${e.position}` : e.type === "propose_apply" ? "Applying" : "Filtering")
        if (e.type === "apply_filter" && e.q) setQ(e.q)
        setCommand({ id: Date.now() + Math.random(), event: e })
      }
    }
  }

  // What the results list shows right now, for the assistant.
  function uiContext(): ChatUiContext {
    return {
      view,
      tab: view === "results" ? tab : undefined,
      q: view === "results" && q ? q : undefined,
      ...(view === "results" &&
        onScreen.current && {
          visible: onScreen.current.items.slice(0, 10).map((m) => ({
            title: m.job.title,
            company: m.job.company,
            location: m.job.location,
            remote: m.job.remote_type,
          })),
          filters: Object.fromEntries(Object.entries(onScreen.current.filters).filter(([, v]) => v !== undefined && v !== false)) as Record<string, string | number | boolean>,
          sort: onScreen.current.sort,
        }),
    }
  }

  async function adoptStarted(events: OrchestratorEvent[]) {
    const started = events.find((e) => e.type === "search_started")
    if (!started) return
    const r = await getRun(started.runId)
    setJourneyDone(false)
    setRun(r)
    setProgress(r.progress)
  }

  // The one Plato AI panel (components/global-assistant.tsx) works in this search's thread while
  // the page is open: it reads the list from here and hands the list commands back.
  const host = useRef<SearchHost | null>(null)
  useEffect(() => {
    host.current = thread
    ? {
        threadId: thread.id,
        view,
        context: uiContext,
        act: async (events) => {
          await runAssistantActions(events)
          await adoptStarted(events)
        },
        refresh: () => void getThread(thread.id).then((t) => setThread((cur) => (cur ? { ...cur, messages: t.messages } : t))).catch(() => {}),
      }
    : null
  })
  const threadKey = thread?.id
  useEffect(() => {
    if (!threadKey) return
    setSearchHost({ threadId: threadKey, view, context: () => host.current!.context(), act: (e) => host.current!.act(e), refresh: () => host.current?.refresh() })
    return () => setSearchHost(null)
  }, [threadKey, view])

  function finishJourney() {
    setJourneyDone(true)
    // Plato's closing line landed in the thread server-side; pull it in.
    if (thread)
      getThread(thread.id)
        .then((t) => setThread((cur) => (cur ? { ...cur, messages: t.messages } : t)))
        .catch(() => {})
  }

  return (
    <div className={PAGE_DOCK} data-tour-state={screen}>
      <PageHeader
        crumbs={[{ label: "Jobs", href: JOBS_HOME }]}
        title={thread?.title ?? "Search"}
        description={view === "results" ? undefined : view === "searching" ? "Plato is searching every board. You can leave and come back; it keeps going." : "Set up this search, then Plato searches every board."}
        actions={
          <>
            {view === "results" && (
              <InputGroup data-tour="results-search" className="w-80 max-w-full rounded-full bg-card">
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search results" placeholder="Search title, company, place or skill" />
              </InputGroup>
            )}
            {/* On results the sidebar has New search; one button, not two. */}
            {view !== "results" && (
              <Button variant="outline" onClick={newSearch} className="gap-1.5 rounded-full">
                <Plus className="size-4" />
                New search
              </Button>
            )}
          </>
        }
      />

      {loadError && <p role="alert" className="rounded-xl border border-l-4 border-l-destructive bg-card px-4 py-3 text-sm text-foreground shadow-card">{loadError}</p>}
      {(!thread || elsewhere) && !loadError && <Skeleton className="h-[calc(100dvh-220px)] min-h-[420px] w-full rounded-2xl" />}

      

      {/* While it runs: the progress card. The flow diagram of the sites being read is hidden (owner, 2026-11-13), kept for later. */}
      {thread && run && view === "searching" && progress && SHOW_JOURNEY && <SearchingView run={run} progress={progress} journey={journey} onFinished={finishJourney} />}

      {/* Results share the Jobs sidebar: every search, All jobs and Following one click away. */}
      {thread && run && view === "results" && (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <SearchesSidebar activeId={thread.id} />
          <div className="flex min-w-0 flex-col gap-5">
            {run.status === "FAILED" && <p data-tour="search-failed" role="alert" className="rounded-xl border border-l-4 border-l-destructive bg-card px-4 py-3 text-sm text-foreground shadow-card">The last search failed: {run.error}. Ask Plato to try again.</p>}
            <ResultsView
              run={run}
              threadId={thread.id}
              tab={tab}
              q={q}
              command={command}
              onState={reportScreen}
              tabs={
                <div data-tour="results-tabs" className="flex items-center gap-1.5">
                  <PillTabs id="results-tabs" tabs={TABS} value={tab} onChange={setTab} label="Results" dataAi="results.tab" />
                  <InfoTip text="Discover is this search. Saved and Applied gather jobs from all your searches. Recommended for you: 75% match or more across all searches, minus ones you hid or applied to." label="What these lists show" />
                </div>
              }
            />
          </div>
        </div>
      )}
      {/* Searching and results: the one Plato AI panel (layout) takes over this thread. */}
    </div>
  )
}
