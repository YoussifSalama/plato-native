"use client"

import { detailsHref } from "@/lib/readiness-link"
import { useEffect, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { ArrowRight, BellRing, Check, ChevronDown, FileText, Puzzle, Search, UserCheck, X } from "lucide-react"
import { cn } from "cn"
import { buttonVariants } from "@/components/ui/button"
import { CARD } from "@/components/plato-ui"
import { InfoTip } from "@/components/info-tip"
import { getExtensionProgress } from "@/lib/extension/api"
import { getInsights } from "@/lib/insights/api"
import { getApplyReadiness, type DiscoveryStats } from "@/lib/jobs/api"

// The path through Plato, in the order it has to happen. Each step is checked
// against the seeker's real data, the first open one is "Next", and the card
// gives way, once everything is done (or when they hide it), to the one thing to do now (`then`).
type Step = { key: string; title: string; body: string; href: string; cta: string; icon: typeof Search; done: boolean | null }
export type NextAction = { title: string; body: string; href: string; cta: string }

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

// compact: Home's small setup card beside its action card (the action is Home's own); nothing once setup is done or hidden.
export function NextSteps({ stats, onNewSearch, then, compact }: { stats: DiscoveryStats | null; onNewSearch: () => void; then?: NextAction | null; compact?: boolean }) {
  const [ready, setReady] = useState<boolean | null>(null)
  const [linked, setLinked] = useState<boolean | null>(null)
  const [alerts, setAlerts] = useState<boolean | null>(null)
  const [missing, setMissing] = useState<{ key: string }[]>([])
  const [open, setOpen] = useState(true)
  const hidden = useSyncExternalStore((cb) => (hideListeners.add(cb), () => hideListeners.delete(cb)), readHidden, () => false)

  useEffect(() => {
    getApplyReadiness().then((r) => (setReady(r.ready), setMissing(r.missing))).catch(() => setReady(null))
    getExtensionProgress().then((p) => setLinked(p.linked)).catch(() => setLinked(null))
    getInsights().then((i) => setAlerts(i.alerts.length > 0)).catch(() => setAlerts(null))
  }, [])

  const applied = stats ? Object.values(stats.applications).reduce((n, c) => n + (c ?? 0), 0) > 0 : null
  const steps: Step[] = [
    { key: "profile", title: "Make your profile ready to apply", body: "Plato fills every form from it, so it needs your details once.", href: detailsHref(missing, "/"), cta: "Complete my details", icon: UserCheck, done: ready },
    { key: "extension", title: "Link the browser extension", body: "It applies in your own browser, in tabs you can watch, and presses Submit once per job.", href: "/extension", cta: "Link my browser", icon: Puzzle, done: linked },
    { key: "search", title: "Run your first search", body: "Say the role in your own words. Plato searches every board and ranks the results.", href: "#new-search", cta: "Start a search", icon: Search, done: stats ? stats.threads > 0 : null },
    { key: "apply", title: "Apply to your best matches", body: "Open a search and send the top jobs to Plato in one go.", href: "/jobs", cta: "Pick jobs to apply", icon: FileText, done: applied },
    { key: "alerts", title: "Turn on a job alert", body: "New jobs in your roles, in one digest. Free.", href: "/following", cta: "Set an alert", icon: BellRing, done: alerts },
  ]
  const known = steps.every((s) => s.done !== null)
  const doneCount = steps.filter((s) => s.done).length
  const next = steps.find((s) => s.done === false)
  if (hidden || (known && !next)) return compact ? null : then ? <NextActionCard a={then} /> : null
  const pct = Math.round((doneCount / steps.length) * 100)
  if (compact) {
    const go = next?.href === "#new-search" ? { onClick: onNewSearch } : null
    const arrow = "flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary-line text-primary transition-colors duration-200 hover:bg-primary-soft"
    return (
      <motion.section data-tour="next-steps" aria-label="Setup" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn(CARD, "relative flex items-center gap-4 p-5 lg:w-[380px]")}>
        <div className="relative size-14 shrink-0">
          <svg viewBox="0 0 36 36" className="size-14 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--primary-soft)" strokeWidth="3.5" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--primary)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 97.4} 97.4`} className="transition-[stroke-dasharray] duration-700" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[13px] font-extrabold text-foreground tabular-nums">
            {doneCount}/{steps.length}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <span className="eyebrow">Setup</span>
          <p className="truncate text-[15px] font-bold text-foreground">{next ? next.title : "Checking your account…"}</p>
          {next && <p className="line-clamp-2 text-xs text-text-secondary">{next.body}</p>}
        </div>
        {next &&
          (go ? (
            <button type="button" data-ai="home.next-step" aria-label={next.cta} onClick={go.onClick} className={arrow}>
              <ArrowRight className="size-4" />
            </button>
          ) : (
            <Link href={next.href} data-ai="home.next-step" aria-label={next.cta} className={arrow}>
              <ArrowRight className="size-4" />
            </Link>
          ))}
        <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss setup" title="Dismiss" className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-muted hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </motion.section>
    )
  }

  return (
    <motion.section data-tour="next-steps" aria-label="Your next steps" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn(CARD, "relative overflow-hidden")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-5">
        <div className="relative size-11 shrink-0">
          <svg viewBox="0 0 36 36" className="size-11 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--primary-soft)" strokeWidth="3.5" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="url(#ns-grad)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 97.4} 97.4`} />
            <defs>
              <linearGradient id="ns-grad" x1="0" x2="1">
                <stop offset="0%" style={{ stopColor: "var(--primary)" }} />
                <stop offset="100%" style={{ stopColor: "var(--azure)" }} />
              </linearGradient>
            </defs>
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[11.5px] font-semibold text-foreground tabular-nums">
            {doneCount}/{steps.length}
          </span>
        </div>
        <div className="min-w-[200px] flex-1">
          <span className="flex items-center gap-1.5">
            <span className="eyebrow">Your next steps</span>
            <InfoTip text="The setup path through Plato. Each step is checked against your account and ticks itself off; the card goes away when all five are done or you dismiss it." label="How next steps work" />
          </span>
          <p className="type-card-title mt-0.5 text-foreground">{next ? next.title : "Checking your account…"}</p>
          {next && <p className="mt-0.5 text-[13px] text-text-secondary">{next.body}</p>}
        </div>
        {next &&
          (next.href === "#new-search" ? (
            <button type="button" data-ai="home.next-step" onClick={onNewSearch} className={cn(buttonVariants({ size: "sm" }), "group/cta")}>
              {next.cta}
              <ArrowRight className="transition-transform group-hover/cta:translate-x-0.5" />
            </button>
          ) : (
            <Link href={next.href} data-ai="home.next-step" className={cn(buttonVariants({ size: "sm" }), "group/cta")}>
              {next.cta}
              <ArrowRight className="transition-transform group-hover/cta:translate-x-0.5" />
            </Link>
          ))}
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Hide the steps" : "Show all steps"} className="flex size-8 items-center justify-center rounded-lg text-text-tertiary transition-colors duration-200 hover:bg-muted hover:text-foreground">
            <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
          </button>
          <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss next steps" title="Dismiss" className="flex size-8 items-center justify-center rounded-lg text-text-tertiary transition-colors duration-200 hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      </div>
      {open && (
        <ol className="grid grid-cols-1 gap-1.5 border-t border-divider p-3 sm:grid-cols-2 xl:grid-cols-5">
          {steps.map((s, i) => {
            const isNext = s === next
            const inner = (
              <>
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums", s.done ? "bg-success text-white" : isNext ? "bg-primary text-primary-foreground" : "bg-muted text-text-tertiary")}>{s.done ? <Check className="size-3.5" /> : i + 1}</span>
                <span className="min-w-0">
                  <span className={cn("block text-[13px] leading-snug font-semibold", s.done ? "text-text-tertiary line-through decoration-text-tertiary/40" : "text-foreground")}>{s.title}</span>
                  <span className="block text-xs text-text-tertiary">{s.done ? "Done" : isNext ? "Next" : s.done === null ? "…" : "To do"}</span>
                </span>
              </>
            )
            const cls = cn("flex h-full items-start gap-2.5 rounded-lg p-2.5 transition-colors duration-200", isNext ? "bg-primary-tint ring-1 ring-primary-line" : s.done ? "" : "hover:bg-muted/60")
            return (
              <li key={s.key} className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300" style={{ animationDelay: `${i * 50}ms` }}>
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

// After setup: one line, one button. Not dismissible: it is the page's main call to action.
function NextActionCard({ a }: { a: NextAction }) {
  return (
    <motion.section data-tour="next-action" aria-label="What to do now" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn(CARD, "flex flex-wrap items-center gap-x-4 gap-y-3 border-primary-line p-5")}>
      <div className="min-w-[200px] flex-1">
        <span className="eyebrow">Next for you</span>
        <p className="type-card-title mt-0.5 text-foreground">{a.title}</p>
        <p className="mt-0.5 text-[13px] text-text-secondary">{a.body}</p>
      </div>
      <Link href={a.href} data-ai="home.next-action" className={cn(buttonVariants({ size: "sm" }), "group/cta")}>
        {a.cta}
        <ArrowRight className="transition-transform group-hover/cta:translate-x-0.5" />
      </Link>
    </motion.section>
  )
}
