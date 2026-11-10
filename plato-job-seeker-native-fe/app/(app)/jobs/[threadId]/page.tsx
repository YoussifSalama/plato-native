"use client"

import { PAGE_DOCK, PageHeader } from "@/components/page-header"
import { use, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import {
  createThread,
  getRun,
  getThread,
  runEventsUrl,
  sendThreadMessage,
  type ChatThread,
  type DiscoveryRun,
  type RunProgress,
  type MatchTab,
  type JobMatch,
  type MatchFilters,
  type MatchSort,
  type OrchestratorEvent,
  type ThreadMessage,
  type UiCommand,
  type ChatUiContext,
} from "@/lib/jobs/api"
import { JOBS_HOME, PAGE_PATH, threadHref } from "@/lib/jobs/links"
import { getMe, type AuthUser } from "@/lib/auth/api"
import { getPreferences } from "@/lib/preferences/api"
import type { Preferences } from "@/lib/preferences/schema"
import { ChatHero } from "../components/chat-hero"
import { buildPageMap, needsMore, runPageEvent, settle } from "@/lib/page-map"
import { cursorTo } from "@/components/agent-cursor"
import { setSearchHost, type SearchHost } from "@/lib/assistant/search-host"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
// The live journey pulls in the flow-diagram library; load it only when a search is running.
const SearchingView = dynamic(() => import("../components/searching-view").then((m) => m.SearchingView), { loading: () => <Skeleton className="h-[560px] w-full rounded-2xl" /> })
import { useJourneyLog } from "../components/journey/use-journey-log"
import { ResultsView } from "../components/results-view"
import { PillTabs } from "@/components/pill-tabs"
import { InfoTip } from "@/components/info-tip"

const TABS: { key: MatchTab; label: string }[] = [
  { key: "discover", label: "Discover" },
  { key: "saved", label: "Saved" },
  { key: "applied", label: "Applied" },
  { key: "recommended", label: "Recommended for you" },
]
const POLL_MS = 4000

export default function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const runParam = searchParams.get("run")

  const [thread, setThread] = useState<ChatThread | null>(null)
  const [me, setMe] = useState<AuthUser | null>(null)
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [run, setRun] = useState<DiscoveryRun | null>(null)
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
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

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => {})
    getPreferences()
      .then(setPreferences)
      .catch(() => {})
  }, [])

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

  async function newSearch() {
    const t = await createThread()
    router.push(threadHref(t.id))
  }

  const view = !run ? "chat" : run.status === "RUNNING" || !journeyDone ? "searching" : "results"
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
        const problem = await runPageEvent(e, router.push)
        if (problem) setChatError(problem)
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

  async function send(content: string) {
    if (!thread) return
    const optimistic: ThreadMessage = {
      id: `tmp-${Date.now()}`,
      role: "USER",
      content,
      created_at: new Date().toISOString(),
    }
    setThread({ ...thread, messages: [...thread.messages, optimistic] })
    setSending(true)
    setChatError(null)
    try {
      const { message, events } = await sendThreadMessage(thread.id, content, { ...uiContext(), pageMap: buildPageMap() })
      setThread((t) => (t ? { ...t, messages: [...t.messages, message] } : t))
      await runAssistantActions(events)
      // A multi-step task carries on in the layout-level assistant, which survives page changes.
      if (needsMore(events)) {
        await settle()
        window.dispatchEvent(new CustomEvent("plato:continue", { detail: { threadId: thread.id, step: 1 } }))
      }
      await adoptStarted(events)
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setSending(false)
    }
  }

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
        description={view === "results" ? "Ranked against your profile. Save the ones you like, then apply to the best in one go." : view === "searching" ? "Plato is searching every board. You can leave and come back; it keeps going." : "Tell Plato the role you want in your own words."}
        actions={
          <>
            {view === "results" && (
              <InputGroup data-tour="results-search" className="w-72 max-w-full rounded-full bg-card">
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search results" placeholder="Search by title, company, or keyword" />
              </InputGroup>
            )}
            <Button variant="outline" onClick={newSearch} className="gap-1.5 rounded-full">
              <Plus className="size-4" />
              New search
            </Button>
          </>
        }
      >
        {view === "results" && (
          <div data-tour="results-tabs" className="flex flex-wrap items-center gap-2">
            <PillTabs id="results-tabs" tabs={TABS} value={tab} onChange={setTab} label="Results" dataAi="results.tab" />
            <InfoTip text="Recommended for you gathers jobs at 75% match or more from all your searches, leaving out ones you hid or already applied to." label="What Recommended for you shows" />
          </div>
        )}
      </PageHeader>

      {loadError && <p role="alert" className="rounded-xl border border-l-4 border-l-destructive bg-card px-4 py-3 text-sm text-foreground shadow-card">{loadError}</p>}
      {!thread && !loadError && <Skeleton className="h-[calc(100dvh-220px)] min-h-[420px] w-full rounded-2xl" />}

      {thread && view === "chat" && <ChatHero firstName={me?.full_name.split(" ")[0] ?? null} preferences={preferences} messages={messages} onSend={send} busy={sending} error={chatError} />}

      {thread && run && view === "searching" && progress && <SearchingView run={run} progress={progress} journey={journey} onFinished={finishJourney} />}

      {thread && run && view === "results" && (
        <>
          {run.status === "FAILED" && <p data-tour="search-failed" role="alert" className="rounded-xl border border-l-4 border-l-destructive bg-card px-4 py-3 text-sm text-foreground shadow-card">The last search failed: {run.error}. Ask Plato to try again.</p>}
          <ResultsView run={run} threadId={thread.id} tab={tab} q={q} command={command} onState={reportScreen} />
        </>
      )}
      {/* Searching and results: the one Plato AI panel (layout) takes over this thread. */}
    </div>
  )
}
