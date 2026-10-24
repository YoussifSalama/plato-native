"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { createThread, getThread, listThreads, sendThreadMessage, type ChatThread, type OrchestratorEvent, type ThreadMessage } from "@/lib/jobs/api"
import { PAGE_PATH, threadHref } from "@/lib/jobs/links"
import { buildPageMap, CONTINUE_TEXT, MAX_STEPS, needsMore, runPageEvent, settle } from "@/lib/page-map"
import { cursorTo } from "@/components/agent-cursor"
import { PlatoDock } from "@/app/(app)/jobs/components/plato-dock"

const QUICK_PROMPTS = ["Find remote jobs", "Show my saved jobs", "Take me to my profile"]

// Only a search thread carries its own dock (it also drives the result list). Every
// other page, Jobs home and Career included, gets this one next to the page's own chat.
export const hasOwnAssistant = (path: string) => path.startsWith("/jobs/")

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
  return <PlatoDock key={openKey} defaultOpen={openKey > 0} messages={thread?.messages ?? []} onSend={(t) => void send(t)} busy={busy} error={error} quickPrompts={QUICK_PROMPTS} status="idle" />
}

export { GlobalAssistant }
