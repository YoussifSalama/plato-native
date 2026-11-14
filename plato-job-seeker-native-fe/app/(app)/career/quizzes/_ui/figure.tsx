"use client"

import { useId } from "react"
import { cn } from "cn"
import type { Figure } from "@/lib/quizzes/contract"

// A pattern question's figure: up to a few shapes in a 100x100 box, drawn as SVG (no images, crisp at any size).
type Shape = Figure["shapes"][number]

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo))

function polygon(n: number, r: number, start = -90) {
  return Array.from({ length: n }, (_, i) => {
    const a = ((start + (360 / n) * i) * Math.PI) / 180
    return `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`
  }).join(" ")
}
function star(r: number) {
  return Array.from({ length: 10 }, (_, i) => {
    const a = ((-90 + 36 * i) * Math.PI) / 180
    const rr = i % 2 ? r * 0.45 : r
    return `${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`
  }).join(" ")
}

function ShapeEl({ s, fill }: { s: Shape; fill: string }) {
  const r = clamp(s.size, 5, 60) / 2
  const common = { fill, stroke: "currentColor", strokeWidth: 2.2, vectorEffect: "non-scaling-stroke" as const, strokeLinejoin: "round" as const }
  switch (s.shape) {
    case "circle":
      return <circle r={r} {...common} />
    case "square":
      return <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={1.5} {...common} />
    case "rectangle":
      return <rect x={-r} y={-r * 0.55} width={r * 2} height={r * 1.1} rx={1.5} {...common} />
    case "triangle":
      return <polygon points={polygon(3, r * 1.1, -90)} {...common} />
    case "diamond":
      return <polygon points={polygon(4, r * 1.1, -90)} {...common} />
    case "hexagon":
      return <polygon points={polygon(6, r, 0)} {...common} />
    case "star":
      return <polygon points={star(r * 1.1)} {...common} />
    case "arrow":
      return <path d={`M ${-r} ${-r * 0.2} H ${r * 0.2} V ${-r * 0.55} L ${r} 0 L ${r * 0.2} ${r * 0.55} V ${r * 0.2} H ${-r} Z`} {...common} />
    case "line":
      return <line x1={-r} y1={0} x2={r} y2={0} stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    case "cross":
      return <path d={`M ${-r * 0.3} ${-r} H ${r * 0.3} V ${-r * 0.3} H ${r} V ${r * 0.3} H ${r * 0.3} V ${r} H ${-r * 0.3} V ${r * 0.3} H ${-r} V ${-r * 0.3} H ${-r * 0.3} Z`} {...common} />
    default:
      return null
  }
}

export function FigureSvg({ figure, size = 88, className, label }: { figure: Figure; size?: number; className?: string; label?: string }) {
  const id = useId().replace(/:/g, "")
  const fillOf = (f: Shape["fill"]) => (f === "solid" ? "currentColor" : f === "striped" ? `url(#st-${id})` : f === "dotted" ? `url(#dt-${id})` : "none")
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label ?? "Figure"} className={cn("text-foreground", className)}>
      <defs>
        <pattern id={`st-${id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="2" />
        </pattern>
        <pattern id={`dt-${id}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.2" fill="currentColor" />
        </pattern>
      </defs>
      {(figure.shapes ?? []).slice(0, 12).map((s, i) => (
        <g key={i} transform={`translate(${clamp(s.x, 0, 100)} ${clamp(s.y, 0, 100)}) rotate(${s.rotation ?? 0})`}>
          <ShapeEl s={s} fill={fillOf(s.fill)} />
        </g>
      ))}
    </svg>
  )
}
