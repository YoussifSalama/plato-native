"use client"

import { type ComponentType, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { AlertTriangle, CheckCircle2, Filter, Layers, Search, Sparkles, Trophy } from "lucide-react"
import { cn } from "cn"
import { clipReveal, lineReveal, nodeContent, nodeEnter, reducedVariants, spring } from "@/lib/motion-system"
import type { JobSourceName, SourceKey } from "@/lib/jobs/api"
import { SourceTile } from "@/components/source-tile"
import { PlatoMark } from "@/components/plato-orb"

export type NodeState = "waking" | "working" | "done" | "failed"

export type StageData = {
  kind: "ai" | "stage" | "merge" | "filter" | "rank" | "done" | "failed"
  eyebrow: string
  title: string
  description: string
  state: NodeState
  onAction?: () => void
}
export type AdapterData = { source: SourceKey; label: string; state: NodeState; fetched: number; error?: string }

export type StageNode = Node<StageData, "stage">
export type AdapterNode = Node<AdapterData, "adapter">
export type JourneyNode = StageNode | AdapterNode

export const STAGE_W = 440
export const STAGE_H = 120
export const ADAPTER_W = 136
export const ADAPTER_H = 104
export const ADAPTER_GAP = 16

const ICONS: Record<StageData["kind"], ComponentType<{ className?: string }>> = {
  ai: Sparkles,
  stage: Search,
  merge: Layers,
  filter: Filter,
  rank: Trophy,
  done: CheckCircle2,
  failed: AlertTriangle,
}

function StatusDot({ state }: { state: NodeState }) {
  if (state === "done") return <CheckCircle2 className="size-4 text-success" />
  if (state === "failed") return <AlertTriangle className="size-4 text-destructive" />
  return (
    <span className="relative flex size-3.5 items-center justify-center">
      <span className={cn("absolute inset-0 rounded-full bg-primary/40", state === "working" && "animate-ping")} />
      <span className="relative size-2 rounded-full bg-primary" />
    </span>
  )
}

const handleClass = "!size-1.5 !border-0 !bg-primary/40"


function Shell({ state, prominent, children }: { state: NodeState; prominent?: boolean; children: ReactNode }) {
  const reduced = !!useReducedMotion()
  return (
    <motion.div
      variants={reduced ? reducedVariants(nodeEnter) : nodeEnter}
      initial="hidden"
      animate="show"
      style={{ transformStyle: "preserve-3d", width: STAGE_W, minHeight: STAGE_H }}
      className={cn(
        "relative rounded-lg border bg-card px-5 py-4 text-left shadow-sm",
        state === "working" && "border-primary/40 shadow-[0_18px_50px_-24px_rgba(78,8,252,0.45)]",
        state === "done" && "border-success/30",
        state === "failed" && "border-destructive/40",
        prominent && "bg-gradient-to-b from-success-soft/60 to-card",
      )}
    >
      {state === "working" && !reduced && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      {children}
    </motion.div>
  )
}

// A stage in the journey. Internal hierarchy reveals top-down: eyebrow →
// title (clip) → description → action.
function StageNodeView({ data }: NodeProps<StageNode>) {
  const reduced = !!useReducedMotion()
  const v = (x: typeof nodeEnter) => (reduced ? reducedVariants(x) : x)
  const Icon = ICONS[data.kind]
  const prominent = data.kind === "done"
  const accent =
    data.kind === "done" ? "bg-success-soft text-success" : data.kind === "failed" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"

  return (
    <Shell state={data.state} prominent={prominent}>
      <Handle type="target" position={Position.Top} className={handleClass} />
      <motion.div variants={v(nodeContent)} initial="hidden" animate="show" className="flex items-start gap-3.5">
        <motion.span variants={v(lineReveal)} className={cn("mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md", accent)}>
          <Icon className="size-5" />
        </motion.span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <motion.div variants={v(lineReveal)} className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{data.eyebrow}</span>
            <StatusDot state={data.state} />
          </motion.div>
          <motion.p variants={v(clipReveal)} className={cn("leading-snug font-semibold text-foreground", prominent ? "text-xl" : "text-[17px]")}>
            {data.title}
          </motion.p>
          <motion.p variants={v(lineReveal)} className="truncate text-[13px] leading-relaxed text-muted-foreground" title={data.description}>
            {data.description}
          </motion.p>
        </div>
      </motion.div>
      <motion.div variants={v(nodeContent)} initial="hidden" animate="show">
        {data.onAction && (
          <motion.div variants={v(lineReveal)} className="pt-3 pl-13.5">
            <motion.button
              type="button"
              onClick={data.onAction}
              whileTap={{ scale: 0.98 }}
              transition={spring.micro}
              className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Show my jobs →
            </motion.button>
          </motion.div>
        )}
      </motion.div>
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </Shell>
  )
}

// A live system node: dim while standing by, energized while retrieving,
// settles into its count.
function AdapterNodeView({ data }: NodeProps<AdapterNode>) {
  const reduced = !!useReducedMotion()
  const { state } = data
  return (
    <motion.div
      variants={reduced ? reducedVariants(nodeEnter) : nodeEnter}
      initial="hidden"
      animate="show"
      style={{ width: ADAPTER_W }}
    >
      <Handle type="target" position={Position.Top} className={handleClass} />
      <motion.div
        animate={
          state === "working" && !reduced
            ? { boxShadow: ["0 0 0 0 rgba(78,8,252,0.28)", "0 0 0 10px rgba(78,8,252,0)"] }
            : { boxShadow: "0 0 0 0 rgba(78,8,252,0)" }
        }
        transition={{ duration: 1.6, repeat: state === "working" && !reduced ? Infinity : 0, ease: "easeOut" }}
        style={{ height: ADAPTER_H }}
        className={cn(
          "relative flex flex-col justify-between overflow-hidden rounded-md border bg-card p-3",
          state === "waking" && "border-dashed opacity-50",
          state === "working" && "border-primary/50",
          state === "done" && "border-success/30",
          state === "failed" && "border-destructive/40",
        )}
      >
        {state === "working" && !reduced && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-primary/10 to-transparent"
            initial={{ x: "-100%" }}
            animate={{ x: "400%" }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
          />
        )}
        <div className="flex items-start justify-between">
          {data.source === "index" ? <PlatoMark size={28} live={state === "working"} /> : <SourceTile source={data.source.toUpperCase() as JobSourceName} size={28} />}
          <StatusDot state={state} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="truncate text-[13px] leading-tight font-semibold text-foreground">{data.label}</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={state}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className={cn("truncate text-xs tabular-nums", state === "done" ? "text-success" : state === "failed" ? "text-destructive" : "text-muted-foreground")}
              title={state === "failed" ? data.error : undefined}
            >
              {state === "waking" ? "Standing by" : state === "working" ? "Retrieving…" : state === "done" ? `${data.fetched} postings` : (data.error ?? "No response")}
            </motion.p>
          </AnimatePresence>
        </div>
      </motion.div>
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </motion.div>
  )
}

export const nodeTypes = { stage: StageNodeView, adapter: AdapterNodeView }
