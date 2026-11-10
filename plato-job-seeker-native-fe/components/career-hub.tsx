"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowRight, BriefcaseBusiness, ClipboardCheck, FileText, GraduationCap, Hammer, Mic, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { timeAgo } from "@/lib/jobs/links"
import type { Activity, Recommendation } from "@/lib/career-hub/snapshot"
import type { HubKind } from "@/lib/career-hub/store"

// Pieces shared by the Career hub and its practice screens. Built from the same tokens and
// card style as the rest of the app (white card, 1px border, primary-soft icon tiles).

export const KIND: Record<HubKind | "resume" | "learn", { label: string; icon: LucideIcon }> = {
  assessment: { label: "Skill assessment", icon: ClipboardCheck },
  interview: { label: "AI interview", icon: Mic },
  simulation: { label: "Job simulation", icon: BriefcaseBusiness },
  proof: { label: "Proof of skills", icon: Hammer },
  resume: { label: "Resume", icon: FileText },
  learn: { label: "Learn", icon: GraduationCap },
}

export const scoreTone = (n: number) => (n >= 75 ? "text-success-ink" : n >= 55 ? "text-warning-ink" : "text-destructive")
const barTone = (n: number) => (n >= 75 ? "bg-success" : n >= 55 ? "bg-warning" : "bg-destructive")

export function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary", className)}>
      <Icon className="size-[18px]" />
    </span>
  )
}

// A labelled 0-100 bar. `tone` colours it by score; otherwise primary.
export function Meter({ label, value, hint, tone, href }: { label: ReactNode; value: number | null; hint?: ReactNode; tone?: boolean; href?: string }) {
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-2 text-[13.5px]">
        <span className="truncate font-semibold text-foreground">{label}</span>
        <b className={cn("tabular-nums", value === null ? "text-text-tertiary" : tone ? scoreTone(value) : "text-primary")}>{value === null ? "—" : value}</b>
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-divider">
        <span className={cn("block h-full rounded-full transition-[width] duration-700", value === null ? "" : tone ? barTone(value) : "bg-primary")} style={{ width: `${value ?? 0}%` }} />
      </span>
      {hint && <span className="truncate text-xs text-text-secondary">{hint}</span>}
    </>
  )
  return href ? (
    <Link href={href} className="flex min-w-0 flex-col gap-1.5 rounded-lg transition-opacity hover:opacity-80">
      {body}
    </Link>
  ) : (
    <div className="flex min-w-0 flex-col gap-1.5">{body}</div>
  )
}

// Scores over time as a small line. Points link to their result.
export function Trend({ points, height = 72 }: { points: Activity[]; height?: number }) {
  if (points.length < 2) return <p className="text-[13px] text-text-secondary">Complete two activities to see your trend.</p>
  const pts = points.slice(-10)
  const w = 300
  const x = (i: number) => 8 + (i * (w - 16)) / (pts.length - 1)
  const y = (v: number) => 6 + (1 - v / 100) * (height - 12)
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full" role="img" aria-label="Scores over time">
      {[25, 50, 75].map((g) => (
        <line key={g} x1={0} x2={w} y1={y(g)} y2={y(g)} stroke="var(--divider)" strokeWidth={1} />
      ))}
      <path d={`${d} L${x(pts.length - 1)},${height} L${x(0)},${height} Z`} fill="var(--primary-soft)" opacity={0.6} />
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <a key={p.id} href={p.href}>
          <circle cx={x(i)} cy={y(p.score)} r={4} fill="var(--card)" stroke="var(--primary)" strokeWidth={2}>
            <title>{`${p.title}: ${p.score}`}</title>
          </circle>
        </a>
      ))}
    </svg>
  )
}

export function ActivityRow({ a, compact }: { a: Activity; compact?: boolean }) {
  const k = KIND[a.kind]
  return (
    <Link href={a.href} data-ai={`career.result:${a.id}`} className="flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 transition-colors hover:border-primary-line">
      <IconTile icon={k.icon} />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[14.5px]">{a.title}</b>
        <span className="block truncate text-xs text-text-secondary">
          {k.label} · {timeAgo(a.at)}
          {!compact && a.subtitle ? ` · ${a.subtitle}` : ""}
        </span>
      </span>
      <b className={cn("shrink-0 text-[15px] tabular-nums", scoreTone(a.score))}>{a.score}</b>
      <ArrowRight className="size-4 shrink-0 text-text-tertiary" />
    </Link>
  )
}

export function RecommendationCard({ r, primary, index }: { r: Recommendation; primary?: boolean; index: number }) {
  const k = KIND[r.kind]
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-2xl border bg-card p-4", primary && "border-primary-line bg-primary-tint/70")}>
      <div className="flex items-center justify-between gap-2">
        <IconTile icon={k.icon} className={primary ? "bg-primary text-white" : undefined} />
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", r.impact === "High" ? "bg-primary-soft text-primary" : "bg-muted text-text-secondary")}>{r.impact} impact</span>
      </div>
      <b className="text-[15px] leading-snug">{r.title}</b>
      <p className="text-[13px] leading-relaxed text-text-secondary">
        <span className="font-semibold text-foreground">Why: </span>
        {r.why}
      </p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="text-[12.5px] font-medium text-text-secondary">
          {k.label} · {r.minutes} min
        </span>
        <Link href={r.href} data-ai={`career.rec:${index}`} className={cn("shrink-0 rounded-lg border px-3 py-1.5 text-sm font-semibold", primary ? "border-primary bg-primary text-white hover:bg-primary-hover" : "bg-card hover:border-primary-line")}>
          {r.cta}
        </Link>
      </div>
    </div>
  )
}

export function Delta({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (!value) return <span className="text-xs font-semibold text-text-tertiary">no change</span>
  const up = value > 0
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-bold tabular-nums", up ? "text-success-ink" : "text-destructive")}>
      {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
      {up ? "+" : ""}
      {value}
      {suffix}
    </span>
  )
}

// A titled white card section, the hub's standard block.
export function Section({ title, action, children, className, tour }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string; tour?: string }) {
  return (
    <section data-tour={tour} className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

// Top of every practice screen: progress through the session and a way back to Career.
export function SessionBar({ label, step, total, onExit }: { label: string; step: number; total: number; onExit?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="flex items-center gap-3 text-text-secondary">
          <span className="tabular-nums">
            {Math.min(step, total)} of {total}
          </span>
          {onExit}
        </span>
      </div>
      <span className="h-1.5 overflow-hidden rounded-full bg-divider">
        <span className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(Math.min(step, total) / total) * 100}%` }} />
      </span>
    </div>
  )
}

// Results are practice scores kept on this device until the server stores them; say so once.
export function DeviceNote({ className }: { className?: string }) {
  return <p className={cn("text-xs text-text-tertiary", className)}>Practice scores from fixed rules, saved in this browser. Job-specific interviews are saved to your account.</p>
}
