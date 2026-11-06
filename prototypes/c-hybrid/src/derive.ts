import { jobOf, P, type State } from "./engine"
import type { Job } from "./types"

// One job has one place on the board, worked out from what happened to it.
export type Stage = "new" | "saved" | "applying" | "needs" | "applied" | "hidden"
export function stageOf(s: State, id: string): Stage {
  const a = s.apps.find((x) => x.jobId === id)
  if (a) return a.status === "submitted" ? "applied" : a.status === "needs" || a.status === "manual" ? "needs" : "applying"
  if (s.hidden.includes(id)) return "hidden"
  if (s.saved.includes(id)) return "saved"
  return "new"
}

// Every job the seeker has seen: search results plus anything saved or applied to.
export function boardJobs(s: State, feed: string): Job[] {
  const ids = new Set<string>()
  s.searches.filter((x) => feed === "all" || x.id === feed).forEach((x) => x.results.forEach((id) => ids.add(id)))
  if (feed === "all") {
    s.apps.forEach((a) => ids.add(a.jobId))
    s.saved.forEach((id) => ids.add(id))
  }
  return [...ids].map((id) => jobOf(s, id)).filter((j): j is Job => !!j)
}

export function searchName(s: State, id: string) {
  const x = s.searches.find((y) => y.id === id)
  return x ? `${x.params.role ?? "Jobs"}${x.params.where[0] ? ` · ${x.params.where.slice(0, 2).join(", ")}` : ""}` : ""
}

export function readiness(s: State) {
  const items = [
    { key: "cv", label: "CV read by Plato", done: !s.fresh },
    { key: "search", label: "A search that keeps running", done: s.searches.length > 0 },
    { key: "notice", label: "Notice period", done: !!s.facts.notice },
    { key: "auth", label: "Work authorization", done: !!s.facts.workAuth },
    { key: "links", label: "LinkedIn link", done: !!s.facts.linkedin },
  ]
  const done = items.filter((i) => i.done).length
  return { items, done, total: items.length, pct: Math.round((done / items.length) * 100) }
}

export const currencyOf = (s: State) => P(s).currency
