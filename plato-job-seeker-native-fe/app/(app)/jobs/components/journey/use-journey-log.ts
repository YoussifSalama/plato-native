"use client"

import { useEffect, useMemo, useState } from "react"
import { useReducedMotion } from "motion/react"
import type { DiscoveryRun, RunProgress } from "@/lib/jobs/api"
import { deriveSteps, type Step, type StepId } from "./journey-steps"

const REVEAL_GAP_MS = 520

export type Journey = {
  shown: StepId[]
  notes: Step[]
  current: Step | undefined
  totalSteps: number
  finished: boolean
  reduced: boolean
}

// Real events → arrival-ordered step log → paced reveal. One instance per
// page so the canvas overlay and the side board read the same log.
export function useJourneyLog(progress: RunProgress | null, query: DiscoveryRun["query"] | undefined): Journey {
  const reduced = !!useReducedMotion()
  const steps = useMemo(() => (progress ? deriveSteps(progress, query ?? { titles: [], locations: [], remoteTypes: [] }) : []), [progress, query])
  const [seen, setSeen] = useState<StepId[]>([])
  const [revealed, setRevealed] = useState(0)

  // Derived-state-during-render: append ids we haven't logged, in the order
  // they showed up (live) or canonical order (snapshot replay). A new run
  // (no overlap with the log) starts a fresh log.
  const ids = steps.map((s) => s.id)
  const fresh = ids.filter((id) => !seen.includes(id))
  if (seen.length && ids.length && !ids.includes(seen[0])) {
    setSeen(ids)
    setRevealed(0)
  } else if (fresh.length) setSeen([...seen, ...fresh])

  useEffect(() => {
    if (revealed >= seen.length) return
    const t = setTimeout(() => setRevealed((r) => r + 1), reduced ? 0 : REVEAL_GAP_MS)
    return () => clearTimeout(t)
  }, [seen, revealed, reduced])

  const shown = seen.slice(0, revealed)
  const byId = new Map(steps.map((s) => [s.id, s]))
  const notes = shown.map((id) => byId.get(id)).filter((s): s is Step => !!s)
  return {
    shown,
    notes,
    current: notes.at(-1),
    totalSteps: seen.length,
    finished: shown.includes("done") || shown.includes("failed"),
    reduced,
  }
}
