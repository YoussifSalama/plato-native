"use client"

import { useSyncExternalStore } from "react"

// Results of the hub's practice modules, kept in this browser until the server stores them.
// Mock interviews for a matched job are already saved on the server (lib/interviews/api.ts).

export type HubKind = "assessment" | "interview" | "simulation" | "proof"
export type HubItem = { label: string; answer?: string; score: number; max: number; feedback: string }
export type HubResult = {
  id: string
  kind: HubKind
  title: string
  subtitle: string
  // The skill this result is evidence for (assessments, proofs).
  skill?: string
  score: number
  breakdown: { label: string; score: number }[]
  strengths: string[]
  improve: string[]
  items: HubItem[]
  // Where "Try again" goes.
  retryHref: string
  createdAt: string
  minutes?: number
  // Proofs: the work as submitted.
  submission?: string
  // Assessments: how the seeker rated themselves before starting (1-5).
  selfRating?: number
}
export type Draft = { text: string; startedAt: string; updatedAt: string }
type State = { results: HubResult[]; drafts: Record<string, Draft> }

const KEY = "plato.career-hub.v1"
const EVENT = "plato:career-hub"
const EMPTY: State = { results: [], drafts: {} }

let raw: string | null = null
let cached: State = EMPTY
function read(): State {
  let next: string | null = null
  try {
    next = localStorage.getItem(KEY)
  } catch {
    return cached
  }
  if (next === raw) return cached
  raw = next
  try {
    const parsed = next ? (JSON.parse(next) as Partial<State>) : null
    cached = { results: parsed?.results ?? [], drafts: parsed?.drafts ?? {} }
  } catch {
    cached = EMPTY
  }
  return cached
}
function write(update: (s: State) => State) {
  const next = update(read())
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode or full storage: keep it for this page view at least.
    raw = null
    cached = next
  }
  window.dispatchEvent(new Event(EVENT))
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener("storage", cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener("storage", cb)
  }
}

export const useHubState = () => useSyncExternalStore(subscribe, read, () => EMPTY)

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
export function saveResult(r: Omit<HubResult, "id" | "createdAt">): string {
  const id = newId()
  write((s) => ({ ...s, results: [{ ...r, id, createdAt: new Date().toISOString() }, ...s.results] }))
  return id
}
export const getResult = (id: string) => read().results.find((r) => r.id === id) ?? null
export function saveDraft(key: string, text: string) {
  write((s) => {
    const now = new Date().toISOString()
    return { ...s, drafts: { ...s.drafts, [key]: { text, startedAt: s.drafts[key]?.startedAt ?? now, updatedAt: now } } }
  })
}
export function clearDraft(key: string) {
  write((s) => {
    const drafts = { ...s.drafts }
    delete drafts[key]
    return { ...s, drafts }
  })
}
