"use client"

import { motion, useReducedMotion } from "motion/react"
import { getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react"
import { cn } from "cn"
import { duration, ease } from "@/lib/motion-system"

// Kinds differ in line treatment and intensity, not mechanics: every edge
// draws itself once, then carries a data pulse while its target is working.
export type EdgeKind = "ai" | "fan" | "converge" | "flow" | "final"
export type JourneyEdge = Edge<{ kind: EdgeKind; active: boolean }, "journey">

const STROKE: Record<EdgeKind, string> = {
  ai: "stroke-primary/40 [stroke-dasharray:4_6]",
  fan: "stroke-primary/55",
  converge: "stroke-primary/55",
  flow: "stroke-primary/70",
  final: "stroke-success/80 [filter:drop-shadow(0_0_4px_rgba(31,173,109,0.5))]",
}

function JourneyEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<JourneyEdge>) {
  const reduced = !!useReducedMotion()
  const kind = data?.kind ?? "flow"
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 12 })
  const active = !!data?.active && !reduced

  return (
    <g>
      <motion.path
        id={id}
        d={path}
        fill="none"
        strokeWidth={kind === "final" ? 2.5 : 1.5}
        strokeLinecap="round"
        className={cn("react-flow__edge-path", STROKE[kind])}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={reduced ? { duration: 0.01 } : { duration: duration.connection, ease: ease.inOut }}
      />
      {active && (
        // Native SMIL: the pulse rides the exact edge path with zero JS per frame.
        <circle r={3} className="fill-primary">
          <animateMotion dur={`${duration.pulse}s`} repeatCount="indefinite" path={path} keyPoints="0;1" keyTimes="0;1" calcMode="linear" />
          <animate attributeName="opacity" values="0;1;1;0" dur={`${duration.pulse}s`} repeatCount="indefinite" />
        </circle>
      )}
    </g>
  )
}

export const edgeTypes = { journey: JourneyEdgeView }
