"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Bot, Gauge, Send } from "lucide-react"
import type { DiscoveryRun, RunProgress } from "@/lib/jobs/api"
import { buildGraph } from "@/app/(app)/jobs/components/journey/journey-canvas"
import { deriveSteps, type StepId } from "@/app/(app)/jobs/components/journey/journey-steps"
import { edgeTypes } from "@/app/(app)/jobs/components/journey/journey-edges"
import { nodeTypes } from "@/app/(app)/jobs/components/journey/journey-nodes"
import { TypedText } from "@/app/(app)/jobs/components/journey/typed-text"
import { PlatoMark } from "@/components/plato-orb"
import { SourceTile } from "@/components/source-tile"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"

// A scripted replay of one real search, rendered with the same nodes, edges
// and voice lines the product uses. Numbers are from a typical run.
const QUERY: DiscoveryRun["query"] = { titles: ["Full Stack Developer"], locations: ["Cairo, Egypt"], remoteTypes: ["remote"] }

type Frame = { shown: StepId[]; progress: RunProgress; hold: number }

const src = (fetched: number, status: "RUNNING" | "DONE" = "DONE") => ({ status, fetched })
const base: RunProgress = {
  stage: "crawling",
  sources: { index: src(0, "RUNNING"), linkedin: src(0, "RUNNING"), workable: src(0, "RUNNING"), lever: src(0, "RUNNING"), greenhouse: src(0, "RUNNING"), ashby: src(0, "RUNNING"), indeed: src(0, "RUNNING"), google_jobs: src(0, "RUNNING"), ziprecruiter: src(0, "RUNNING"), glassdoor: src(0, "RUNNING") },
  merged: null,
  filtered: null,
  ranked: null,
}
const all = { index: src(38), workable: src(41), lever: src(27), greenhouse: src(33), ashby: src(12), linkedin: src(96), indeed: src(64), google_jobs: src(52), ziprecruiter: src(38), glassdoor: src(29) }
const ORDER: StepId[] = ["ai", "stage", "adapters", "adapter:index", "adapter:workable", "adapter:lever", "adapter:greenhouse", "adapter:ashby", "adapter:linkedin", "adapter:indeed", "adapter:google_jobs", "adapter:ziprecruiter", "adapter:glassdoor", "merge", "filter", "rank", "done"]
const upTo = (id: StepId) => ORDER.slice(0, ORDER.indexOf(id) + 1)
const step = (id: StepId, patch: Partial<RunProgress>, hold: number): Frame => ({ shown: upTo(id), progress: { ...base, ...patch }, hold })
const FRAMES: Frame[] = [
  step("ai", {}, 1400),
  step("stage", {}, 1300),
  step("adapters", {}, 1200),
  step("adapter:index", { sources: { ...base.sources, index: src(38) } }, 1000),
  step("adapter:workable", { sources: { ...base.sources, index: src(38), workable: src(41) } }, 900),
  step("adapter:lever", { sources: { ...base.sources, index: src(38), workable: src(41), lever: src(27) } }, 900),
  step("adapter:greenhouse", { sources: { ...base.sources, index: src(38), workable: src(41), lever: src(27), greenhouse: src(33) } }, 800),
  step("adapter:ashby", { sources: { ...base.sources, index: src(38), workable: src(41), lever: src(27), greenhouse: src(33), ashby: src(12) } }, 800),
  step("adapter:linkedin", { sources: { ...all, indeed: src(0, "RUNNING"), google_jobs: src(0, "RUNNING"), ziprecruiter: src(0, "RUNNING"), glassdoor: src(0, "RUNNING") } }, 1100),
  step("adapter:indeed", { sources: { ...all, google_jobs: src(0, "RUNNING"), ziprecruiter: src(0, "RUNNING"), glassdoor: src(0, "RUNNING") } }, 800),
  step("adapter:google_jobs", { sources: { ...all, ziprecruiter: src(0, "RUNNING"), glassdoor: src(0, "RUNNING") } }, 800),
  step("adapter:ziprecruiter", { sources: { ...all, glassdoor: src(0, "RUNNING") } }, 800),
  step("adapter:glassdoor", { sources: all }, 1000),
  step("merge", { stage: "merging", sources: all, merged: 458 }, 1500),
  step("filter", { stage: "filtering", sources: all, merged: 458, filtered: 214 }, 1500),
  step("rank", { stage: "ranking", sources: all, merged: 458, filtered: 214, ranked: 214 }, 1500),
  step("done", { stage: "done", sources: all, merged: 458, filtered: 214, ranked: 214 }, 5000),
]

const noop = () => {}

function DemoCanvas() {
  const reduced = !!useReducedMotion()
  const [i, setI] = useState(reduced ? FRAMES.length - 1 : 0)
  const frame = FRAMES[i]

  // Advance on a per-frame hold; loop after the payoff. Reduced motion shows
  // the finished journey and stays there.
  useEffect(() => {
    if (reduced) return
    const t = setTimeout(() => setI((n) => (n + 1) % FRAMES.length), frame.hold)
    return () => clearTimeout(t)
  }, [i, frame.hold, reduced])

  const { nodes, edges } = useMemo(() => buildGraph(frame.shown, frame.progress, QUERY, noop), [frame])
  const voice = useMemo(() => {
    const steps = deriveSteps(frame.progress, QUERY)
    const last = frame.shown[frame.shown.length - 1]
    return steps.find((s) => s.id === last)?.voice ?? steps[0].voice
  }, [frame])
  const { fitView } = useReactFlow()

  useEffect(() => {
    const t = setTimeout(() => void fitView({ padding: 0.12, duration: reduced ? 0 : 600 }), 50)
    return () => clearTimeout(t)
  }, [nodes.length, fitView, reduced])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card/60 shadow-sm backdrop-blur">
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-full border bg-card/95 py-1 pr-3 pl-1.5 text-xs font-medium text-foreground shadow-sm">
          <PlatoMark size={20} live={frame.progress.stage !== "done"} />
          How a search runs
          <span className="flex items-center gap-1 text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            {frame.progress.stage === "done" ? "Done" : "Live"}
          </span>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          minZoom={0.25}
          maxZoom={1}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="bg-transparent!" />
        </ReactFlow>
      </div>
      <div className="flex h-10 items-start gap-2.5 px-1 text-sm text-text-secondary">
        <Bot className="mt-0.5 size-4 shrink-0 text-primary" />
        <TypedText key={voice} text={voice} msPerChar={12} className="line-clamp-2" />
      </div>
    </div>
  )
}

const PROOF = [
  { icon: Gauge, title: "Ranked against your profile", body: "Scored on your skills, titles and experience. Best fits first." },
  { icon: Send, title: "Apply to your top matches", body: "Pick the roles you like; Plato queues the applications." },
]

function AuthShowcase() {
  return (
    <motion.div initial="hidden" animate="show" variants={staggerContainer} className="flex min-h-0 flex-1 flex-col gap-5">
      <motion.div variants={fadeUpItem}>
        <Link href="/" className="flex w-fit items-center gap-2.5">
          <PlatoMark size={34} />
          <span className="text-lg font-semibold text-foreground">Plato</span>
        </Link>
      </motion.div>

      <motion.div variants={fadeUpItem} className="flex flex-col gap-2">
        <h1 className="max-w-lg text-[28px] leading-tight font-semibold text-balance text-foreground xl:text-3xl">Your AI job hunter, working in the open</h1>
        <p className="max-w-lg text-sm text-text-secondary xl:text-[15px]">
          Tell Plato what you want. It searches live job sources, ranks every posting against your profile and applies to the ones you choose.
        </p>
      </motion.div>

      <motion.div variants={fadeUpItem} className="flex min-h-0 flex-1 flex-col">
        <ReactFlowProvider>
          <DemoCanvas />
        </ReactFlowProvider>
      </motion.div>

      <motion.div variants={fadeUpItem} className="grid shrink-0 gap-3 sm:grid-cols-[auto_1fr_1fr]">
        <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Live sources</span>
          <span className="flex items-center gap-1.5">
            <SourceTile source="LINKEDIN" size={24} />
            <SourceTile source="WORKABLE" size={24} />
            <SourceTile source="LEVER" size={24} />
            <SourceTile source="INDEED" size={24} />
            <SourceTile source="GOOGLE_JOBS" size={24} />
          </span>
          <span className="text-xs text-text-secondary">Plus Glassdoor, ZipRecruiter and more. Last 30 days only.</span>
        </div>
        {PROOF.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-start gap-3 rounded-lg border bg-card p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary-soft text-primary">
              <Icon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">{title}</span>
              <span className="text-xs leading-relaxed text-text-secondary">{body}</span>
            </span>
          </div>
        ))}
      </motion.div>
    </motion.div>
  )
}

export { AuthShowcase }
