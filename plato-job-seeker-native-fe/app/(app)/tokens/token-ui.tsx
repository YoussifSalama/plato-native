"use client"

import { useEffect } from "react"
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react"
import { FileText, Gift, MessageCircle, MessagesSquare, Mic, Plus, RefreshCw, Search, UserRound, type LucideIcon } from "lucide-react"
import { formatTokens, type TokenMove } from "@/lib/credits/api"
import { ease } from "@/lib/motion-system"

// What a seeker spends tokens on, in their words. One colour per kind of work,
// taken from the app palette, so the breakdown bar and the history agree.
export type Category = { key: string; label: string; icon: LucideIcon; tone: string; bar: string }
export const CATEGORIES: Category[] = [
  { key: "search", label: "Job searches", icon: Search, tone: "bg-primary-soft text-primary", bar: "bg-primary" },
  { key: "career", label: "Career chat", icon: MessageCircle, tone: "bg-info-soft text-info", bar: "bg-info" },
  { key: "resume", label: "Resumes", icon: FileText, tone: "bg-teal-soft text-teal", bar: "bg-teal" },
  { key: "interview", label: "Mock interviews", icon: MessagesSquare, tone: "bg-rose-soft text-rose", bar: "bg-rose" },
  { key: "voice", label: "Voice interviews", icon: Mic, tone: "bg-warning-soft text-warning", bar: "bg-warning" },
  { key: "profile", label: "Profile setup", icon: UserRound, tone: "bg-muted text-text-secondary", bar: "bg-lavender" },
]
const OTHER: Category = { key: "other", label: "Other", icon: MessageCircle, tone: "bg-muted text-text-secondary", bar: "bg-lavender" }

export function categoryOf(feature: string | null): Category {
  const f = feature ?? ""
  const key = /^(chat\.orchestrator|discovery\.)/.test(f) ? "search" : /^career\.voice/.test(f) ? "voice" : /^career\./.test(f) ? "career" : /^resume\./.test(f) ? "resume" : /^interview\./.test(f) ? "interview" : /^(onboarding\.|chat\.onboarding)/.test(f) ? "profile" : "other"
  return CATEGORIES.find((c) => c.key === key) ?? OTHER
}

// A line of history: what it was and how it looks.
export function describeMove(m: TokenMove): { title: string; icon: LucideIcon; tone: string } {
  if (m.kind === "grant") return { title: m.label === "Monthly tokens" ? "Monthly tokens arrived" : m.label, icon: RefreshCw, tone: "bg-success-soft text-success" }
  if (m.kind === "topup") return { title: "Top-up added", icon: Plus, tone: "bg-success-soft text-success" }
  if (m.kind === "adjust") return { title: m.amount >= 0 ? "A gift from the Plato team" : "Adjustment by Plato", icon: Gift, tone: "bg-success-soft text-success" }
  const c = categoryOf(m.feature)
  return { title: m.label, icon: c.icon, tone: c.tone }
}

// Counts up to a number on arrival (a motion value, so no re-render per frame); instant for reduced motion.
export function CountUp({ value, className }: { value: number; className?: string }) {
  const reduced = !!useReducedMotion()
  const mv = useMotionValue(reduced ? value : 0)
  const text = useTransform(mv, (v) => formatTokens(v))
  useEffect(() => {
    const controls = animate(mv, value, { duration: reduced ? 0 : 1.1, ease: ease.out })
    return () => controls.stop()
  }, [mv, value, reduced])
  return <motion.span className={className}>{text}</motion.span>
}

// Share of the month left, drawn as a ring that fills in on arrival.
export function BalanceRing({ share, size = 176, low }: { share: number; size?: number; low: boolean }) {
  const reduced = !!useReducedMotion()
  const stroke = 12
  const r = (size - stroke) / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <defs>
        <linearGradient id="plato-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={low ? "var(--warning)" : "var(--azure)"} />
          <stop offset="100%" stopColor={low ? "#f59e0b" : "var(--primary)"} />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary-soft)" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#plato-ring)"
        strokeWidth={stroke}
        strokeLinecap="round"
        initial={{ pathLength: reduced ? Math.max(0.001, share) : 0 }}
        animate={{ pathLength: Math.max(0.001, share) }}
        transition={{ duration: reduced ? 0 : 1.2, ease: ease.out, delay: reduced ? 0 : 0.15 }}
      />
    </svg>
  )
}

export const daysUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
export const dayLabel = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  const y = new Date(today)
  y.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === y.toDateString()) return "Yesterday"
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
}
