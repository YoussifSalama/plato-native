"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Check, Loader2, X } from "lucide-react"
import { cn } from "cn"
import { getDiscoveryStats, getRun, runEventsUrl, type DiscoveryRun, type RunProgress, type RunStage } from "@/lib/jobs/api"

// While a search runs (owner, 2026-11-13): the stages, the numbers so far and the time left. Which job sites are being
// read is not shown any more; the flow diagram (journey/) stays in the code, hidden.

const STAGES: { key: RunStage; label: string; detail: string }[] = [
  { key: "crawling", label: "Searching every job site", detail: "Postings found so far" },
  { key: "merging", label: "Removing duplicates", detail: "Unique postings" },
  { key: "filtering", label: "Keeping what fits your search", detail: "Postings that fit" },
  { key: "ranking", label: "Ranking for your profile", detail: "Your best matches" },
]
const ORDER: RunStage[] = ["crawling", "merging", "filtering", "ranking", "done"]

/** Live progress of one run: Server-Sent Events, polling as the fallback. */
export function useRunProgress(run: DiscoveryRun | null) {
  const [progress, setProgress] = useState<RunProgress | null>(run?.progress ?? null)
  const [seen, setSeen] = useState(run?.id)
  if (run?.id !== seen) {
    // a run handed in later (restored after a refresh) brings its saved progress, even a finished one
    setSeen(run?.id)
    setProgress(run?.progress ?? null)
  }
  useEffect(() => {
    if (!run || run.status !== "RUNNING") return
    const es = new EventSource(runEventsUrl(run.id), { withCredentials: true })
    let poll: ReturnType<typeof setInterval> | null = null
    es.onmessage = (e) => {
      const p = JSON.parse(e.data) as RunProgress
      setProgress(p)
      if (p.stage === "done" || p.stage === "failed") es.close()
    }
    es.onerror = () => {
      es.close()
      poll ??= setInterval(() => {
        getRun(run.id)
          .then((r) => {
            if (r.progress) setProgress(r.progress)
            if (r.status !== "RUNNING" && poll) clearInterval(poll)
          })
          .catch(() => undefined)
      }, 4000)
    }
    return () => {
      es.close()
      if (poll) clearInterval(poll)
    }
  }, [run])
  return progress
}

// How long searches usually take: the median of this seeker's recent runs.
function useTypicalSeconds() {
  const [s, setS] = useState<number | null>(null)
  useEffect(() => {
    getDiscoveryStats()
      .then((st) => {
        const xs = st.recentRuns
          .map((r) => r.seconds)
          .filter((x): x is number => !!x && x > 0)
          .sort((a, b) => a - b)
        setS(xs.length ? xs[Math.floor(xs.length / 2)]! : null)
      })
      .catch(() => undefined)
  }, [])
  return s
}

const fmtLeft = (sec: number) => (sec < 45 ? "less than a minute" : sec < 90 ? "about a minute" : `about ${Math.round(sec / 60)} minutes`)

export function SearchProgressCard({ run, progress, onDone, className }: { run: DiscoveryRun; progress: RunProgress | null; onDone?: () => void; className?: string }) {
  const typical = useTypicalSeconds()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const stage = progress?.stage ?? "crawling"
  const done = stage === "done"
  const failed = stage === "failed"
  useEffect(() => {
    if (!done || !onDone) return
    const t = setTimeout(onDone, 1200) // let the finished state land before the results open
    return () => clearTimeout(t)
  }, [done, onDone])

  const at = ORDER.indexOf(stage)
  const found = Object.values(progress?.sources ?? {}).reduce((n, s) => n + (s?.fetched ?? 0), 0)
  const value: Record<string, number | null> = { crawling: found || null, merging: progress?.merged ?? null, filtering: progress?.filtered ?? null, ranking: progress?.ranked ?? null }
  const elapsed = Math.max(0, Math.round((now - new Date(run.started_at).getTime()) / 1000))
  const left = typical ? typical - elapsed : null
  const results = progress?.ranked ?? progress?.filtered ?? progress?.merged ?? (found || null)

  return (
    <section className={cn("rounded-2xl border bg-card p-5 shadow-card", className)} aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-[0.08em] text-text-tertiary uppercase">{failed ? "Search stopped" : done ? "Search complete" : "Searching"}</p>
        {!done && !failed && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" /> Live
          </span>
        )}
      </div>

      <p className="mt-3 flex items-baseline gap-2.5">
        <motion.span key={results ?? 0} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-5xl font-semibold tracking-tight text-primary tabular-nums">
          {results ?? 0}
        </motion.span>
        <span className="text-[15px] text-text-secondary">{done ? "jobs ready for you" : at >= 3 ? "matches so far" : "postings found so far"}</span>
      </p>
      <p className="mt-1 text-sm text-text-tertiary">
        {failed
          ? (progress?.error ?? "Something went wrong. Start the search again.")
          : done
            ? "Opening your results…"
            : left === null
              ? "Usually a few minutes. You can leave this page; Plato keeps going."
              : left > 0
                ? `About ${fmtLeft(left)} left. You can leave this page; Plato keeps going.`
                : "Almost there. You can leave this page; Plato keeps going."}
      </p>
      {!done && !failed && typical ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${Math.min(96, Math.max(4, (elapsed / typical) * 100))}%` }} transition={{ duration: 0.8 }} />
        </div>
      ) : null}

      <ol className="mt-5 flex flex-col gap-3 border-t border-divider pt-4">
        {STAGES.map((s, i) => {
          const state = failed && i >= at ? "stopped" : i < at || done ? "done" : i === at ? "active" : "todo"
          return (
            <li key={s.key} className="flex items-center gap-3">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border text-xs transition-colors",
                  state === "done" && "border-primary bg-primary text-primary-foreground",
                  state === "active" && "border-primary text-primary",
                  state === "todo" && "border-border text-text-tertiary",
                  state === "stopped" && "border-destructive text-destructive",
                )}
              >
                {state === "done" ? <Check className="size-3.5" /> : state === "active" ? <Loader2 className="size-3.5 animate-spin" /> : state === "stopped" ? <X className="size-3.5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm", state === "todo" ? "text-text-tertiary" : "font-medium text-foreground")}>{s.label}</span>
                <AnimatePresence>
                  {value[s.key] !== null && state !== "todo" && (
                    <motion.span initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="block text-xs text-text-tertiary">
                      {s.detail}: <span className="font-semibold text-text-secondary tabular-nums">{value[s.key]}</span>
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
