"use client"

import { useEffect } from "react"
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react"
import { FileText, Gift, MessageCircle, MessagesSquare, Mic, Plus, RefreshCw, Search, UserRound, type LucideIcon } from "lucide-react"
import { formatTokens, type TokenMove } from "@/lib/credits/api"
import { ease } from "@/lib/motion-system"

// What a seeker spends tokens on, in their words. Kinds of work are told apart by
// icon and label, not colour: the page stays brand cobalt (colour is kept for meaning).
export type Category = { key: string; label: string; icon: LucideIcon }
export const CATEGORIES: Category[] = [
  { key: "search", label: "Job searches", icon: Search },
  { key: "career", label: "Career chat", icon: MessageCircle },
  { key: "resume", label: "Resumes", icon: FileText },
  { key: "interview", label: "Mock interviews", icon: MessagesSquare },
  { key: "voice", label: "Voice interviews", icon: Mic },
  { key: "profile", label: "Profile setup", icon: UserRound },
]
const OTHER: Category = { key: "other", label: "Other", icon: MessageCircle }

export function categoryOf(feature: string | null): Category {
  const f = feature ?? ""
  const key = /^(chat\.orchestrator|discovery\.)/.test(f) ? "search" : /^career\.voice/.test(f) ? "voice" : /^career\./.test(f) ? "career" : /^resume\./.test(f) ? "resume" : /^interview\./.test(f) ? "interview" : /^(onboarding\.|chat\.onboarding)/.test(f) ? "profile" : "other"
  return CATEGORIES.find((c) => c.key === key) ?? OTHER
}

// A line of history: what it was and how it looks. Tokens coming in are the only coloured rows (green = added).
const SPEND = "bg-muted text-text-secondary"
const GAIN = "bg-success-soft text-success"
export function describeMove(m: TokenMove): { title: string; icon: LucideIcon; tone: string } {
  if (m.kind === "grant") return { title: m.label === "Monthly tokens" ? "Monthly tokens arrived" : m.label, icon: RefreshCw, tone: GAIN }
  if (m.kind === "topup") return { title: "Top-up added", icon: Plus, tone: GAIN }
  if (m.kind === "adjust") return { title: m.amount >= 0 ? "A gift from the Plato team" : "Adjustment by Plato", icon: Gift, tone: m.amount >= 0 ? GAIN : SPEND }
  const c = categoryOf(m.feature)
  return { title: m.label, icon: c.icon, tone: SPEND }
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
