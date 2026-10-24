"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { cn } from "cn"
import type { DiscoveryRun, RunProgress } from "@/lib/jobs/api"
import { sourceOf, visibleSources, type StepId } from "./journey-steps"
import { ADAPTER_GAP, ADAPTER_H, ADAPTER_W, nodeTypes, STAGE_H, STAGE_W, type JourneyNode, type NodeState } from "./journey-nodes"
import { edgeTypes, type EdgeKind, type JourneyEdge } from "./journey-edges"
import { NotesList } from "./journey-notes"
import type { Journey } from "./use-journey-log"
import { spring } from "@/lib/motion-system"
import { Bot, ChevronDown, ChevronUp } from "lucide-react"

const PAYOFF_BEAT_MS = 1100
const GAP_Y = 56
// Source cards wrap into rows so a full Canada + US run stays readable.
const MAX_PER_ROW = 8

export function buildGraph(shown: StepId[], progress: RunProgress, query: DiscoveryRun["query"], onAction: () => void) {
  const has = (id: StepId) => shown.includes(id)
  const nodes: JourneyNode[] = []
  const edges: JourneyEdge[] = []
  let y = 0
  let last: string | null = null

  const stage = (id: string, data: Omit<Extract<JourneyNode, { type: "stage" }>["data"], "onAction">, edge: EdgeKind, active: boolean, action?: () => void) => {
    nodes.push({ id, type: "stage", position: { x: 0, y }, data: { ...data, onAction: action }, draggable: false })
    if (last) edges.push({ id: `${last}->${id}`, source: last, target: id, type: "journey", data: { kind: edge, active } })
    last = id
    y += STAGE_H + GAP_Y
  }

  const sources = visibleSources(progress)
  const allAdaptersSettled = sources.every((s) => has(`adapter:${s.key}`))
  const later = (id: StepId, next: StepId): NodeState => (has(next) ? "done" : has("failed") ? "failed" : has(id) ? "working" : "waking")
  const titles = query?.titles ?? []
  const locations = query?.locations ?? []
  // ISO codes -> names; the country is what decides which boards run.
  const regionNames = new Intl.DisplayNames(["en"], { type: "region" })
  const countries = (query?.countries ?? []).map((c) => regionNames.of(c) ?? c)

  if (has("ai"))
    stage("ai", { kind: "ai", eyebrow: "Plato AI", title: "Understanding your request", description: "Reading your profile and the roles you asked for.", state: has("stage") ? "done" : "working" }, "ai", false)

  if (has("stage")) {
    stage(
      "stage",
      {
        kind: "stage",
        eyebrow: "Stage 01",
        title: "Searching jobs",
        // Up to 8 planned titles: name a few, count the rest.
        description: `${titles.length > 3 ? `${titles.slice(0, 2).join(" · ")} +${titles.length - 2} more titles` : titles.join(" · ") || "Saved roles"}${locations.length ? ` · ${locations.join(", ")}` : ""}${countries.length ? ` · ${countries.join(" + ")}` : ""}`,
        state: has("merge") || has("failed") ? (has("failed") && !allAdaptersSettled ? "failed" : "done") : "working",
      },
      "ai",
      !has("adapters"),
    )
    // Source rows are wider than the stage card; centre each underneath.
    const rowCount = Math.ceil(sources.length / MAX_PER_ROW)
    const perRow = Math.ceil(sources.length / rowCount)
    sources.forEach((s, i) => {
      const row = Math.floor(i / perRow)
      const inRow = Math.min(perRow, sources.length - row * perRow)
      const rowW = ADAPTER_W * inRow + ADAPTER_GAP * (inRow - 1)
      const x = (STAGE_W - rowW) / 2 + (i % perRow) * (ADAPTER_W + ADAPTER_GAP)
      const sp = sourceOf(progress, s.key)
      const state: NodeState = !has("adapters") ? "waking" : !progress.sources[s.key] ? "done" : !has(`adapter:${s.key}`) ? "working" : sp.status === "DONE" ? "done" : "failed"
      const id = `adapter:${s.key}`
      nodes.push({ id, type: "adapter", position: { x, y: y + row * (ADAPTER_H + ADAPTER_GAP) }, data: { source: s.key, label: s.label, state, fetched: sp.fetched, error: sp.error }, draggable: false })
      edges.push({ id: `stage->${id}`, source: "stage", target: id, type: "journey", data: { kind: "fan", active: state === "working" } })
    })
    y += (rowCount - 1) * (ADAPTER_H + ADAPTER_GAP)
    y += ADAPTER_H + GAP_Y
    last = null
  }

  if (has("merge")) {
    const id = "merge"
    nodes.push({
      id,
      type: "stage",
      position: { x: 0, y },
      data: { kind: "merge", eyebrow: "Result 01", title: progress.merged !== null ? `${progress.merged} jobs collected` : "Merging results", description: "One pool from every source, deduplicated.", state: later("merge", "filter") },
      draggable: false,
    })
    for (const s of sources)
      edges.push({ id: `adapter:${s.key}->merge`, source: `adapter:${s.key}`, target: id, type: "journey", data: { kind: "converge", active: !has("filter") } })
    last = id
    y += STAGE_H + GAP_Y
  }

  if (has("filter"))
    stage("filter", { kind: "filter", eyebrow: "Stage 02", title: progress.filtered !== null ? `${progress.merged ?? "?"} → ${progress.filtered} shortlisted` : "Cross-checking your profile", description: "Keyword relevance against your skills, titles and experience.", state: later("filter", "rank") }, "flow", !has("rank"))

  if (has("rank"))
    stage("rank", { kind: "rank", eyebrow: "Stage 03", title: progress.ranked !== null ? "Best matches first" : "Ranking the shortlist", description: "Scoring each posting so the strongest fits lead.", state: later("rank", "done") }, "flow", !has("done"))

  if (has("done"))
    stage("done", { kind: "done", eyebrow: "Final result", title: `${progress.ranked ?? 0} jobs ready for you`, description: "The journey is complete. Your matches are waiting below.", state: "done" }, "final", false, onAction)

  if (has("failed"))
    stage("failed", { kind: "failed", eyebrow: "Stopped", title: "The search couldn't finish", description: progress.error ?? "Unknown error", state: "failed" }, "flow", false)

  return { nodes, edges }
}

type CanvasProps = { run: DiscoveryRun; progress: RunProgress; journey: Journey; onFinished: () => void }

function Canvas({ run, progress, journey, onFinished }: CanvasProps) {
  const { shown, notes, totalSteps, finished, reduced } = journey
  const { nodes, edges } = useMemo(() => buildGraph(shown, progress, run.query, onFinished), [shown, progress, run.query, onFinished])
  const { fitView } = useReactFlow()

  // Camera follows the journey: each new node re-frames the scene.
  useEffect(() => {
    const t = setTimeout(() => void fitView({ padding: 0.15, duration: reduced ? 0 : 600 }), 50)
    return () => clearTimeout(t)
  }, [nodes.length, fitView, reduced])

  // Payoff beat runs off the real final event, independent of the notes panel.
  const finishedRef = useRef(false)
  useEffect(() => {
    if (!finished || finishedRef.current) return
    finishedRef.current = true
    const t = setTimeout(onFinished, reduced ? 0 : PAYOFF_BEAT_MS * 2)
    return () => clearTimeout(t)
  }, [finished, onFinished, reduced])

  // Plato's notes: collapsed icon top-left, unread dot when a new note lands.
  const [notesOpen, setNotesOpen] = useState(false)
  const [readCount, setReadCount] = useState(0)
  const unread = notesOpen ? 0 : notes.length - readCount

  return (
    <div className="relative h-[620px] overflow-hidden rounded-xl border bg-muted/20">
      <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-2">
        <button
          type="button"
          aria-expanded={notesOpen}
          aria-label={notesOpen ? "Hide Plato's notes" : "Show Plato's notes"}
          onClick={() => {
            setReadCount(notes.length)
            setNotesOpen((o) => !o)
          }}
          className="relative flex h-10 items-center gap-2 rounded-sm border bg-card/95 px-3 text-sm font-medium text-foreground shadow-sm backdrop-blur hover:bg-card"
        >
          <Bot className="size-5 text-primary" />
          <span className="hidden sm:inline">Plato&apos;s notes</span>
          <span className="flex items-center gap-1 text-xs text-primary">
            <span className={cn("size-1.5 rounded-full bg-primary", !finished && "animate-pulse")} />
            {finished ? "Done" : "Live"}
          </span>
          {notesOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
          {!notesOpen && unread > 0 && (
            <motion.span
              key={unread}
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={spring.micro}
              className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
            >
              {unread}
            </motion.span>
          )}
        </button>

        <AnimatePresence>
          {notesOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={reduced ? { duration: 0.15 } : spring.enter}
              className="w-[min(420px,calc(100vw-4rem))] rounded-md border bg-card/95 shadow-md backdrop-blur"
            >
              <div className="flex items-center justify-between border-b px-4 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                <span>What Plato is doing</span>
                <span className="font-medium normal-case tracking-normal">
                  {notes.length} / {totalSteps}
                </span>
              </div>
              <NotesList journey={journey} className="max-h-72 px-4 py-3" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        minZoom={0.4}
        maxZoom={1.2}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        className="[&_.react-flow__attribution]:text-[10px]"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-transparent" />
      </ReactFlow>
    </div>
  )
}

function JourneyCanvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}

export { JourneyCanvas }
