import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowRight, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { PlatoMark } from "@/components/plato-orb"
import { CountUp } from "@/components/count-up"

// The small pieces every page of the redesign shares (design/new-ui/SPEC.md §3).
//
// The scale every page follows (globals.css holds the tokens):
//   type    type-page-title 28 · type-section-title 18 · type-card-title 15 · body 14 · type-meta 12.5 · type-stat 26
//   radius  cards rounded-2xl (16) · controls and inner tiles rounded-lg (10) · chips rounded-full / rounded-md
//   space   card padding p-5 (20, p-6 for heroes) · gaps on the 8px grid (gap-2/3/4/6) · section gap 24
//   surface CARD below: 1px border, white, shadow-card. Never a bordered box inside a bordered box.
//   buttons sm 36 · default 40 · lg 44; icon buttons size-9 / size-10

// The one card surface. Add padding and layout at the call site.
export const CARD = "fx rounded-2xl border bg-card shadow-card"

// A section's title with its one "see more" link, the same on every page.
// Section icons are always brand cobalt: a page never takes its sidebar colour (the accent prop is ignored on purpose).
export function SectionHeader({ title, href, action, dataAi, as: H = "h2", icon, className }: { title: ReactNode; href?: string; action?: ReactNode; dataAi?: string; as?: "h2" | "h3"; icon?: LucideIcon; accent?: Accent; className?: string }) {
  return (
    <div className={cn("flex min-h-7 items-center justify-between gap-3", className)}>
      <span className="flex min-w-0 items-center gap-2.5">
        {icon && <StatIcon icon={icon} accent="cobalt" className="size-8 rounded-lg [&_svg]:size-4" />}
        <H className="type-section-title min-w-0 text-balance text-foreground">{title}</H>
      </span>
      {href && action && (
        <Link href={href} data-ai={dataAi} className="group/see inline-flex shrink-0 items-center gap-1 rounded-md text-[13px] font-semibold text-primary transition-colors hover:text-primary-hover">
          {action}
          <ArrowRight className="size-3.5 transition-transform group-hover/see:translate-x-0.5" />
        </Link>
      )}
    </div>
  )
}

// Nothing to show yet: an icon, one line on what is missing, one line on what happens next, and a way forward.
export function EmptyState({ icon: Icon, title, hint, action, className }: { icon: LucideIcon; title: ReactNode; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-5 py-6 text-center", className)}>
      <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Icon className="size-[18px]" strokeWidth={1.75} />
      </span>
      <div className="flex max-w-[44ch] flex-col gap-1">
        <p className="type-card-title text-foreground">{title}</p>
        {hint && <p className="text-[13px] leading-relaxed text-text-secondary">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

// Small grey fact on a card: location, posted time.
export function MetaChip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary", className)}>{children}</span>
}

// "Plato says": what Plato did or knows. `panel` is the full block, `inline` is one line
// with the P badge (job reasons), `headline` is the line under a page title.
export function PlatoNote({ label, children, variant = "panel", className }: { label?: string; children: ReactNode; variant?: "panel" | "inline" | "headline"; className?: string }) {
  if (variant !== "panel")
    return (
      <div className={cn("flex items-start gap-2 text-text-secondary", variant === "inline" ? "text-[13px] leading-relaxed" : "text-[15px]", className)}>
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
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONE[tone], className)}>{children}</span>
}

// Company monogram, the owner's way: a short name stays as written (PwC, SAP, EY);
// anything longer shows the first two letters of its first word (Lean Technologies → LE).
export const monogram = (name: string) => {
  const clean = name.replace(/[^\p{L}\p{N}\s&]/gu, "").trim()
  if (clean.length > 0 && clean.length <= 3) return clean
  return (clean.split(/\s+/)[0] ?? "").slice(0, 2).toUpperCase() || "?"
}
// Company badges get a pastel from the palette, picked from the name so a company keeps its colour everywhere.
const MONO_TONES = ["bg-primary-soft text-primary", "bg-info-soft text-info", "bg-teal-soft text-teal", "bg-success-soft text-success-ink", "bg-warning-soft text-warning-ink", "bg-rose-soft text-rose"]
const monoTone = (name: string) => MONO_TONES[[...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % MONO_TONES.length]
export function MonoTile({ name, size = "md", className }: { name: string; size?: "sm" | "md"; className?: string }) {
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-lg font-semibold tracking-tight ring-1 ring-foreground/5 ring-inset", monoTone(name), size === "sm" ? "size-8 text-[11px]" : "size-10 text-[13px]", className)}>
      {monogram(name)}
    </span>
  )
}

export function MatchPill({ value, className }: { value: number; className?: string }) {
  return <span className={cn("rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary tabular-nums", className)}>{Math.round(value)}%</span>
}

// Circular % ring. The track is always visible (an empty goal still reads as a ring),
// and the label scales with the ring so "100%" fits at any size.
export function MatchRing({ value, size = 44, label, stroke }: { value: number; size?: number; label?: ReactNode; stroke?: number }) {
  const p = Math.max(0, Math.min(100, value))
  const w = stroke ?? Math.max(3, Math.round(size / 13))
  const r = (size - w) / 2
  const c = 2 * Math.PI * r
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary-soft)" strokeWidth={w} />
        {p > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary)" strokeWidth={w} strokeLinecap="round" strokeDasharray={`${(p / 100) * c} ${c}`} />}
      </svg>
      <span className="relative font-semibold tracking-tight text-primary tabular-nums" style={{ fontSize: Math.max(10, Math.round(size * 0.25)) }}>
        {label ?? (
          <>
            {Math.round(p)}
            <span className="text-[0.7em]">%</span>
          </>
        )}
      </span>
    </span>
  )
}

// Big number + label as a standalone bordered tile. `need` is the amber "needs you" tile, `hi` the highlighted one.
// Analytics accents: palette colours only (cobalt, azure, teal, green, amber; rose sparingly).
// Each stat card gets an icon tile with a soft gradient in its accent and a faint glow in the corner.
export type Accent = "cobalt" | "azure" | "teal" | "green" | "amber" | "rose"
const ACCENT: Record<Accent, { color: string; soft: string }> = {
  cobalt: { color: "var(--primary)", soft: "var(--primary-soft)" },
  azure: { color: "var(--info)", soft: "var(--info-soft)" },
  teal: { color: "var(--teal)", soft: "var(--teal-soft)" },
  green: { color: "var(--success)", soft: "var(--success-soft)" },
  amber: { color: "var(--warning)", soft: "var(--warning-soft)" },
  rose: { color: "var(--rose)", soft: "var(--rose-soft)" },
}
export function StatIcon({ icon: Icon, accent = "cobalt", className }: { icon: LucideIcon; accent?: Accent; className?: string }) {
  const a = ACCENT[accent]
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset", className)} style={{ color: a.color, backgroundImage: `linear-gradient(135deg, ${a.soft}, color-mix(in oklch, ${a.soft} 35%, white))`, ["--tw-ring-color" as string]: `color-mix(in oklch, ${a.color} 14%, transparent)` }}>
      <Icon className="size-[18px]" strokeWidth={2} />
    </span>
  )
}
// Cards fade up one after another: pass the card's index as `index`.
const enter = (index = 0) => ({ className: "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 motion-reduce:animate-none", style: { animationDelay: `${index * 70}ms` } })
const glow = (accent: Accent) => `radial-gradient(120% 90% at 100% 0%, color-mix(in oklch, ${ACCENT[accent].color} 9%, transparent), transparent 60%)`

export function StatTile({ value, label, tone, icon, accent = "cobalt", index, className }: { value: ReactNode; label: string; tone?: "need" | "hi"; icon?: LucideIcon; accent?: Accent; index?: number; className?: string }) {
  const e = enter(index)
  return (
    // "need" stays a white tile: only the number and a dot carry the warning colour, so pages don't turn yellow.
    <div className={cn("flex min-w-[118px] items-start gap-3 rounded-xl border px-4 py-3 text-left", tone === "hi" ? "border-primary-line bg-primary-soft text-primary" : "bg-card text-foreground shadow-card", e.className, className)} style={{ ...e.style, ...(icon && tone !== "hi" ? { backgroundImage: glow(accent) } : {}) }}>
      <span className="min-w-0 flex-1">
        <b className={cn("type-stat block", tone === "need" && "text-warning-ink")}>
          <CountUp value={value} />
        </b>
        <span className={cn("type-meta mt-1 flex items-center gap-1.5", tone === "hi" ? "" : "text-text-secondary")}>
          {tone === "need" && <span className="size-1.5 rounded-full bg-warning" />}
          {label}
        </span>
      </span>
      {icon && <StatIcon icon={icon} accent={accent} />}
    </div>
  )
}

// One cell of a stat strip that sits inside a card (no border of its own): number, label,
// optional visual on the right (a ring). Cells in a row share height and baseline.
export function Kpi({ value, label, tone, aside, icon, accent = "cobalt", index, className }: { value: ReactNode; label: ReactNode; tone?: "hi"; aside?: ReactNode; icon?: LucideIcon; accent?: Accent; index?: number; className?: string }) {
  const e = enter(index)
  return (
    <div className={cn("flex h-full items-center gap-3 rounded-xl px-4 py-3 transition-colors", tone === "hi" ? "bg-primary-soft text-primary" : "text-foreground", e.className, className)} style={e.style}>
      {icon && <StatIcon icon={icon} accent={accent} />}
      <span className="min-w-0 flex-1">
        <b className="type-stat block whitespace-nowrap">
          <CountUp value={value} />
        </b>
        <span className={cn("type-meta mt-1 block whitespace-nowrap", tone === "hi" ? "text-primary" : "text-text-secondary")}>{label}</span>
      </span>
      {aside}
    </div>
  )
}

