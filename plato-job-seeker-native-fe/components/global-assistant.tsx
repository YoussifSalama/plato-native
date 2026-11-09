"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { createThread, getThread, listThreads, sendThreadMessage, type ChatThread, type OrchestratorEvent, type ThreadMessage } from "@/lib/jobs/api"
import { PAGE_PATH, threadHref } from "@/lib/jobs/links"
import { buildPageMap, CONTINUE_TEXT, MAX_STEPS, needsMore, runPageEvent, settle } from "@/lib/page-map"
import { cursorTo } from "@/components/agent-cursor"
import { PlatoDock } from "@/app/(app)/jobs/components/plato-dock"

// Three suggestions that fit the page the seeker is on, and its name for the panel header.
const PAGE_HELP: { match: (p: string) => boolean; name: string; prompts: string[] }[] = [
  { match: (p) => p === "/", name: "Home", prompts: ["What should I do today?", "Apply to my top 3 matches", "How is my job hunt going?"] },
  { match: (p) => p.startsWith("/jobs/review"), name: "Tailor & apply", prompts: ["Which resume needs my attention?", "Why is this one a weak fit?", "Take me back to jobs"] },
  { match: (p) => p.startsWith("/jobs"), name: "Jobs", prompts: ["Only remote jobs I can apply to from Egypt", "Find new jobs that fit my CV", "Show my saved jobs"] },
  { match: (p) => p.startsWith("/applications"), name: "Applications", prompts: ["What needs me right now?", "Why didn't some go through?", "Follow up on applications older than 2 weeks"] },
  { match: (p) => p.startsWith("/following") || p.startsWith("/insights"), name: "Following", prompts: ["Follow companies hiring for my role", "What's new from companies I follow?", "Send my digest weekly"] },
  { match: (p) => p.startsWith("/career"), name: "Career", prompts: ["Score my resume", "Practice an interview for my next application", "Which skill should I learn next?"] },
  { match: (p) => p.startsWith("/profile"), name: "Profile", prompts: ["Make my resume bullets stronger", "What is missing from my profile?", "Open my application answers"] },
  { match: (p) => p.startsWith("/tokens"), name: "Plan & credits", prompts: ["How many tokens does applying cost?", "When do my tokens refill?", "Take me to Home"] },
  { match: (p) => p.startsWith("/extension"), name: "Extension", prompts: ["How do I link Chrome?", "Is my browser linked?", "Take me to Applications"] },
]
const helpFor = (p: string) => PAGE_HELP.find((h) => h.match(p)) ?? { name: "", prompts: ["Find jobs that fit my CV", "What needs me right now?", "Take me to my profile"] }

// Only a search thread carries its own dock (it also drives the result list). Every
// other page, Jobs home and Career included, gets this one next to the page's own chat.
export const hasOwnAssistant = (path: string) => path.startsWith("/jobs/") && !path.startsWith("/jobs/review")

// The same Plato AI as in a search, reachable from every other page.
// The command palette (Ctrl/Cmd+K) can hand it a question. It continues your latest search conversation.
// ponytail: list commands (filter, open job) need the results view, so they are ignored here; the assistant is told to navigate first.
function GlobalAssistant() {
  const path = usePathname()
  const router = useRouter()
  const [thread, setThread] = useState<ChatThread | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bumped by the shortcut; remounts the dock open.
  const [openKey, setOpenKey] = useState(0)
  const hidden = hasOwnAssistant(path)

  useEffect(() => {
    if (hidden) return
    let cancelled = false
    listThreads()
      .then((all) => (all[0] ? getThread(all[0].id) : null))
      .then((t) => !cancelled && t && setThread(t))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [hidden])

  // The command palette (Ctrl/Cmd+K) hands over "ask Plato" here. Cancelling the event
  // tells it this assistant took the request.
  const pending = useRef<string | null>(null)
  useEffect(() => {
    if (hidden) return
    const onAsk = (e: Event) => {
      e.preventDefault()
      const text = (e as CustomEvent<{ text: string }>).detail.text
      pending.current = text
      setOpenKey((k) => k + 1)
    }
    window.addEventListener("plato:ask", onAsk)
    return () => window.removeEventListener("plato:ask", onAsk)
  }, [hidden])
  // Remounted open by the event above; send once the dock is up and the thread is known.
  useEffect(() => {
    if (!pending.current || busy) return
    const text = pending.current
    pending.current = null
    if (text) void send(text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey])

  async function act(events: OrchestratorEvent[], threadId: string) {
    const fail = (m: string | null) => m && setError(m)
    for (const e of events) {
      if (e.type === "search_started") router.push(threadHref(threadId))
      else if (e.type === "navigate") {
        const target = e.page === "jobs" && e.tab ? `${threadHref(threadId)}?tab=${e.tab}` : PAGE_PATH[e.page]
        if (target.includes("?")) {
          await cursorTo(`nav a[href="${PAGE_PATH.jobs}"]`, "Opening jobs")
          router.push(target)
        } else await runPageEvent({ type: "goto", path: target }, router.push)
      } else if (e.type === "open_extension_progress") window.dispatchEvent(new Event("plato:open-extension-progress"))
      else fail(await runPageEvent(e, router.push))
    }
  }

  // `step` > 0: the app is continuing a multi-step task by itself after a page change.
  async function send(content: string, step = 0, threadId?: string) {
    const auto = step > 0
    setBusy(true)
    if (!auto) setError(null)
    try {
      // First message from a user with no conversation yet starts one.
      const t = threadId ? { id: threadId, messages: [] } : (thread ?? (await createThread()))
      if (!auto) {
        const optimistic: ThreadMessage = { id: `tmp-${Date.now()}`, role: "USER", content, created_at: new Date().toISOString() }
        setThread({ ...(t as ChatThread), messages: [...t.messages, optimistic] })
      }
      const { message, events } = await sendThreadMessage(t.id, content, { page: location.pathname === "/" ? "home" : location.pathname.slice(1).split("/")[0], pageMap: buildPageMap(), ...(auto && { auto: true }) })
      setThread((cur) => (cur && cur.id === t.id ? { ...cur, messages: [...cur.messages, message] } : cur))
      await act(events, t.id)
      if (needsMore(events) && step < MAX_STEPS) {
        await settle()
        await send(CONTINUE_TEXT, step + 1, t.id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  // The thread page hands over multi-step tasks here: this assistant lives in the layout, so it survives page changes.
  const latest = useRef(send)
  latest.current = send
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ threadId: string; step: number }>).detail
      void latest.current(CONTINUE_TEXT, d.step, d.threadId)
    }
    window.addEventListener("plato:continue", on)
    return () => window.removeEventListener("plato:continue", on)
  }, [])

  if (hidden) return null
  const help = helpFor(path)
  return <PlatoDock key={openKey} defaultOpen={openKey > 0} messages={thread?.messages ?? []} onSend={(t) => void send(t)} busy={busy} error={error} quickPrompts={help.prompts} context={help.name} status="idle" />
}

export { GlobalAssistant }
