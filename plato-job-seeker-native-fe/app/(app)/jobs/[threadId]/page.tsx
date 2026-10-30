"use client"

import { use, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
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
} from "@/lib/jobs/api"
import { JOBS_HOME, PAGE_PATH, threadHref } from "@/lib/jobs/links"
import { getMe, type AuthUser } from "@/lib/auth/api"
import { getPreferences } from "@/lib/preferences/api"
import type { Preferences } from "@/lib/preferences/schema"
import { ChatHero } from "../components/chat-hero"
import { buildPageMap, needsMore, runPageEvent, settle } from "@/lib/page-map"
import { cursorTo } from "@/components/agent-cursor"
import { PlatoDock } from "../components/plato-dock"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
// The live journey pulls in the flow-diagram library; load it only when a search is running.
const SearchingView = dynamic(() => import("../components/searching-view").then((m) => m.SearchingView), { loading: () => <Skeleton className="h-[560px] w-full rounded-xl" /> })
import { useJourneyLog } from "../components/journey/use-journey-log"
import { ResultsView } from "../components/results-view"
import { NotificationBell } from "../components/notification-bell"
import { PillTabs } from "@/components/pill-tabs"

const RESULTS_PROMPTS = ["Which of these fit me best?", "Find remote jobs", "Show me more options"]
const SEARCHING_PROMPTS = ["How far along is it?", "Why is it taking long?", "What are you searching for?"]
const TABS: { key: MatchTab; label: string }[] = [
  { key: "discover", label: "Discover" },
  { key: "saved", label: "Saved" },
  { key: "applied", label: "Applied" },
  { key: "recommended", label: "Recommended for you" },
]
const POLL_MS = 4000

function initials(fullName: string) {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

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
      const { message, events } = await sendThreadMessage(thread.id, content, {
        view,
        pageMap: buildPageMap(),
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
      })
      setThread((t) => (t ? { ...t, messages: [...t.messages, message] } : t))
      await runAssistantActions(events)
      // A multi-step task carries on in the layout-level assistant, which survives page changes.
      if (needsMore(events)) {
        await settle()
        window.dispatchEvent(new CustomEvent("plato:continue", { detail: { threadId: thread.id, step: 1 } }))
      }
      const started = events.find((e) => e.type === "search_started")
      if (started) {
        const r = await getRun(started.runId)
        setJourneyDone(false)
        setRun(r)
        setProgress(r.progress)
      }
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
    <div className="flex flex-1 flex-col gap-5 px-6 pt-6 pb-28 lg:pr-6 lg:pl-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <Link href={JOBS_HOME} data-ai="results.all-searches" className="flex w-fit items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-primary">
            <ArrowLeft className="size-4" />
            All searches
          </Link>
          <h1 className="text-2xl font-bold text-foreground">{thread?.title ?? "Search"}</h1>
          {view === "results" && (
            <PillTabs id="results-tabs" tabs={TABS} value={tab} onChange={setTab} label="Results" dataAi="results.tab" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3.5">
          {view === "results" && (
            <label className="hidden h-10 w-80 items-center gap-2.5 rounded-md border bg-card px-3.5 md:flex">
              <Search className="size-4 text-lavender" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, company, or keyword" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-lavender" />
            </label>
          )}
          <Button variant="outline" size="sm" onClick={newSearch} className="gap-1.5 rounded-md">
            <Plus className="size-4" />
            New search
          </Button>
          <NotificationBell />
          {me && (
            <span className="relative">
              <span className="flex size-10 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">{initials(me.full_name)}</span>
              <span className="absolute -right-px -bottom-px size-[11px] rounded-full border-2 border-card bg-[#2ECC71]" aria-hidden />
            </span>
          )}
        </div>
      </header>

      {loadError && <p className="rounded-sm border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{loadError}</p>}
      {!thread && !loadError && <Skeleton className="h-[calc(100dvh-220px)] min-h-[420px] w-full rounded-xl" />}

      {thread && view === "chat" && <ChatHero firstName={me?.full_name.split(" ")[0] ?? null} preferences={preferences} messages={messages} onSend={send} busy={sending} error={chatError} />}

      {thread && run && view === "searching" && progress && <SearchingView run={run} progress={progress} journey={journey} onFinished={finishJourney} />}

      {thread && run && view === "results" && (
        <>
          {run.status === "FAILED" && <p className="rounded-sm border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">The last search failed: {run.error}. Ask Plato to try again.</p>}
          <ResultsView run={run} threadId={thread.id} tab={tab} q={q} command={command} onState={reportScreen} />
        </>
      )}

      {thread && run && view !== "chat" && (
        <PlatoDock
          messages={messages}
          onSend={send}
          busy={sending}
          error={chatError}
          quickPrompts={view === "searching" ? SEARCHING_PROMPTS : RESULTS_PROMPTS}
          steps={view === "searching" ? { journey, startedAt: run.started_at } : undefined}
          status={view === "searching" ? "searching" : "done"}
        />
      )}
    </div>
  )
}
