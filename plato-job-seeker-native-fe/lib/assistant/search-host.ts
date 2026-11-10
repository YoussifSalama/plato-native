"use client"

import { useSyncExternalStore } from "react"
import type { ChatUiContext, OrchestratorEvent } from "@/lib/jobs/api"

// A search page (/jobs/<id>) hosts the one Plato AI panel: while it is open, the panel's
// conversation is that search's thread, messages carry what the results list shows, and the
// list commands the agent sends (filter, open job, apply, tab, search started) are handed to
// the page. The panel lives in the layout; the page registers itself here.
export type SearchHost = {
  threadId: string
  // "chat": the page's own first-contact chat fills the screen, so the panel stays out of the way.
  view: "chat" | "searching" | "results"
  // What the results list shows right now (read when a message is sent).
  context: () => ChatUiContext
  // Carries out the events only the page can (list commands, its tab, a new run).
  act: (events: OrchestratorEvent[]) => Promise<void>
  // The thread changed in the panel: the page re-reads it.
  refresh: () => void
}

// The events a search page applies itself; every other event is the panel's (page actions).
export const isListEvent = (e: OrchestratorEvent) => e.type === "open_job" || e.type === "apply_filter" || e.type === "remove_filter" || e.type === "propose_apply" || e.type === "search_started" || (e.type === "navigate" && e.page === "jobs" && !!e.tab)

let host: SearchHost | null = null
const listeners = new Set<() => void>()

export function setSearchHost(next: SearchHost | null) {
  host = next
  listeners.forEach((l) => l())
}
export const getSearchHost = () => host

export function useSearchHost() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => host,
    () => null,
  )
}
