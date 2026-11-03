"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { ArrowRight, BellRing, Check, ChevronDown, FileText, Puzzle, Search, UserCheck, X } from "lucide-react"
import { cn } from "cn"
import { getExtensionProgress } from "@/lib/extension/api"
import { getInsights } from "@/lib/insights/api"
import { getApplyReadiness, type DiscoveryStats } from "@/lib/jobs/api"

// The path through Plato, in the order it has to happen. Each step is checked
// against the seeker's real data, the first open one is "Next", and the card
// disappears once everything is done (or when they hide it).
type Step = { key: string; title: string; body: string; href: string; cta: string; icon: typeof Search; done: boolean | null }

const HIDE_KEY = "plato:next-steps-hidden"
const hideListeners = new Set<() => void>()
const readHidden = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === "1"
  } catch {
    return false
  }
}
const setHidden = (v: boolean) => {
  try {
    localStorage.setItem(HIDE_KEY, v ? "1" : "0")
  } catch {}
  hideListeners.forEach((l) => l())
}

export function NextSteps({ stats, onNewSearch }: { stats: DiscoveryStats | null; onNewSearch: () => void }) {
  const [ready, setReady] = useState<boolean | null>(null)
  const [linked, setLinked] = useState<boolean | null>(null)
  const [alerts, setAlerts] = useState<boolean | null>(null)
  const [open, setOpen] = useState(true)
  const hidden = useSyncExternalStore((cb) => (hideListeners.add(cb), () => hideListeners.delete(cb)), readHidden, () => false)

  useEffect(() => {
    getApplyReadiness().then((r) => setReady(r.ready)).catch(() => setReady(null))
    getExtensionProgress().then((p) => setLinked(p.linked)).catch(() => setLinked(null))
    getInsights().then((i) => setAlerts(i.alerts.length > 0)).catch(() => setAlerts(null))
  }, [])

  const applied = stats ? Object.values(stats.applications).reduce((n, c) => n + (c ?? 0), 0) > 0 : null
  const steps: Step[] = [
    { key: "profile", title: "Make your profile ready to apply", body: "Plato fills every form from it, so it needs your details once.", href: "/onboarding?step=3", cta: "Complete my details", icon: UserCheck, done: ready },
    { key: "extension", title: "Link the browser extension", body: "It applies in your own browser. You always press Submit.", href: "/extension", cta: "Link my browser", icon: Puzzle, done: linked },
    { key: "search", title: "Run your first search", body: "Say the role in your own words. Plato searches every board and ranks the results.", href: "#new-search", cta: "Start a search", icon: Search, done: stats ? stats.threads > 0 : null },
    { key: "apply", title: "Apply to your best matches", body: "Open a search and send the top jobs to Plato in one go.", href: "/jobs", cta: "Pick jobs to apply", icon: FileText, done: applied },
    { key: "alerts", title: "Turn on a job alert", body: "New jobs in your roles, in one digest. Free.", href: "/insights", cta: "Set an alert", icon: BellRing, done: alerts },
  ]
  const known = steps.every((s) => s.done !== null)
  const doneCount = steps.filter((s) => s.done).length
  const next = steps.find((s) => s.done === false)
  if (hidden || (known && !next)) return null
  const pct = Math.round((doneCount / steps.length) * 100)

  return (
    <motion.section data-tour="next-steps" aria-label="Your next steps" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-xl border bg-card shadow-card">
      <div className="flex flex-wrap items-center gap-4 p-5">
        <div className="relative size-12 shrink-0">
          <svg viewBox="0 0 36 36" className="size-12 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--primary-soft)" strokeWidth="4" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="url(#ns-grad)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 97.4} 97.4`} />
            <defs>
              <linearGradient id="ns-grad" x1="0" x2="1">
                <stop offset="0%" stopColor="#005ba7" />
                <stop offset="100%" stopColor="#00a1e2" />
              </linearGradient>
            </defs>
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground tabular-nums">
            {doneCount}/{steps.length}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <span className="eyebrow">Your next steps</span>
          <p className="mt-0.5 text-[15px] font-bold text-foreground">{next ? next.title : "Checking your account…"}</p>
          {next && <p className="text-sm text-text-secondary">{next.body}</p>}
        </div>
        {next &&
          (next.href === "#new-search" ? (
            <button type="button" data-ai="home.next-step" onClick={onNewSearch} className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-brand hover:bg-primary-hover">
              {next.cta}
              <ArrowRight className="size-4" />
            </button>
          ) : (
            <Link href={next.href} data-ai="home.next-step" className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-brand hover:bg-primary-hover">
              {next.cta}
              <ArrowRight className="size-4" />
            </Link>
          ))}
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Hide the steps" : "Show all steps"} className="flex size-8 items-center justify-center rounded-full text-text-tertiary hover:bg-muted hover:text-foreground">
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
          <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss next steps" title="Dismiss" className="flex size-8 items-center justify-center rounded-full text-text-tertiary hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      </div>
      {open && (
        <ol className="grid grid-cols-1 gap-2 border-t border-divider p-3 sm:grid-cols-2 xl:grid-cols-5">
          {steps.map((s, i) => {
            const isNext = s === next
            const inner = (
              <>
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", s.done ? "bg-success text-white" : isNext ? "bg-primary text-primary-foreground" : "bg-muted text-text-tertiary")}>{s.done ? <Check className="size-3.5" /> : i + 1}</span>
                <span className="min-w-0">
                  <span className={cn("block text-[13px] leading-snug font-semibold", s.done ? "text-text-tertiary line-through decoration-text-tertiary/40" : "text-foreground")}>{s.title}</span>
                  <span className="block text-xs text-text-tertiary">{s.done ? "Done" : isNext ? "Next" : s.done === null ? "…" : "To do"}</span>
                </span>
              </>
            )
            const cls = cn("flex h-full items-start gap-2.5 rounded-lg p-2.5 transition-colors", isNext ? "bg-primary-tint ring-1 ring-primary-line" : "hover:bg-muted/60")
            return (
              <li key={s.key}>
                {s.done ? (
                  <div className={cls}>{inner}</div>
                ) : s.href === "#new-search" ? (
                  <button type="button" onClick={onNewSearch} className={cn(cls, "w-full text-left")}>
                    {inner}
                  </button>
                ) : (
                  <Link href={s.href} className={cls}>
                    {inner}
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </motion.section>
  )
}
