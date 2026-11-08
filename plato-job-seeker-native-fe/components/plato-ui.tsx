import type { ReactNode } from "react"
import { cn } from "cn"
import { PlatoMark } from "@/components/plato-orb"

// The small pieces every page of the redesign shares (design/new-ui/SPEC.md §3).
// They sit inside .glass-scope, so cards pick up the spatial glass automatically.

// "Plato says": what Plato did or knows. `panel` is the full block, `inline` is one line
// with the P badge (job reasons), `headline` is the line under a page title.
export function PlatoNote({ label, children, variant = "panel", className }: { label?: string; children: ReactNode; variant?: "panel" | "inline" | "headline"; className?: string }) {
  if (variant !== "panel")
    return (
      <div className={cn("flex items-start gap-2 text-text-secondary", variant === "inline" ? "text-[13.5px]" : "text-[15px]", className)}>
        <PlatoMark size={variant === "inline" ? 18 : 20} className="mt-px" />
        <span className="min-w-0">{children}</span>
      </div>
    )
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border border-primary-line bg-primary-tint/80 px-4 py-3.5", className)}>
      <PlatoMark size={28} />
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">
        {label && <p className="mb-1 text-xs font-bold tracking-[0.04em] text-primary uppercase">{label}</p>}
        {children}
      </div>
    </div>
  )
}

export type Tone = "success" | "warning" | "info" | "neutral" | "danger" | "primary"
const TONE: Record<Tone, string> = {
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  info: "bg-info-soft text-info",
  neutral: "bg-muted text-text-secondary",
  danger: "bg-danger-soft text-destructive",
  primary: "bg-primary-soft text-primary",
}
export function StatusPill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold whitespace-nowrap", TONE[tone], className)}>{children}</span>
}

// Company monogram: first letters, uppercase, max 3.
export const monogram = (name: string) => {
  const words = name.replace(/[^\p{L}\p{N}\s&]/gu, "").split(/\s+/).filter(Boolean)
  // One word gets its first two letters (Mozn → MZ is the owner's style; MO is the honest version).
  const m = words.length > 1 ? words.slice(0, 2).map((w) => w[0]).join("") : (words[0] ?? "").slice(0, words[0]?.length <= 3 ? 3 : 2)
  return m.toUpperCase() || "?"
}
export function MonoTile({ name, size = "md", className }: { name: string; size?: "sm" | "md"; className?: string }) {
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center border border-border bg-card font-bold tracking-wide text-text-secondary", size === "sm" ? "size-[34px] rounded-[9px] text-[11px]" : "size-10 rounded-[10px] text-[12.5px]", className)}>
      {monogram(name)}
    </span>
  )
}

export function MatchPill({ value, className }: { value: number; className?: string }) {
  return <span className={cn("rounded-full bg-primary-soft px-2.5 py-1 text-[13px] font-bold text-primary tabular-nums", className)}>{Math.round(value)}%</span>
}

export function MatchRing({ value, size = 48, label }: { value: number; size?: number; label?: ReactNode }) {
  const p = Math.max(0, Math.min(100, value))
  return (
    <span className="relative grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, background: `conic-gradient(var(--primary) ${p}%, var(--divider) 0)` }}>
      <span className="absolute rounded-full bg-card" style={{ inset: Math.max(4, size * 0.1) }} />
      <span className="relative text-[12.5px] font-bold text-primary tabular-nums">{label ?? `${Math.round(p)}%`}</span>
    </span>
  )
}

// Big number + label. `need` is the amber "needs you" tile, `hi` the highlighted one.
export function StatTile({ value, label, tone, className }: { value: ReactNode; label: string; tone?: "need" | "hi"; className?: string }) {
  return (
    <div className={cn("min-w-[118px] rounded-2xl border px-4 py-3 text-left", tone === "need" ? "border-warning-line bg-warning-soft text-warning-ink" : tone === "hi" ? "border-primary-line bg-primary-soft text-primary" : "bg-card text-foreground shadow-card", className)}>
      <b className="block text-2xl leading-tight font-extrabold tracking-tight tabular-nums">{value}</b>
      <span className={cn("text-[12.5px]", tone ? "" : "text-text-secondary")}>{label}</span>
    </div>
  )
}

// Segmented filter for a list (U1: the only tab style besides Profile's underline tabs).
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex flex-wrap gap-0.5 rounded-xl bg-foreground/[0.05] p-1", className)}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)} className={cn("rounded-[9px] px-3 py-1.5 text-sm whitespace-nowrap transition-colors", value === o.value ? "bg-card font-semibold text-foreground shadow-sm" : "font-medium text-text-secondary hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
