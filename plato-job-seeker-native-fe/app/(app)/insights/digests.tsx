"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowUpRight, ChevronDown, Globe2, Mail, MailCheck, MapPin, Sparkles } from "lucide-react"
import { cn } from "cn"
import { CompanyAvatar } from "@/components/company-avatar"
import { Skeleton } from "@/components/ui/skeleton"
import type { Digest } from "@/lib/insights/api"
import { timeAgo } from "@/lib/jobs/links"
import { ease, spring } from "@/lib/motion-system"
import { dayLabel } from "../tokens/token-ui"

// What was sent, newest first. The digest a notification pointed at opens on arrival.
export function Digests({ digests, focus }: { digests: Digest[] | null; focus: string | null }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(focus ? [focus] : []))
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const first = digests?.[0]?.id
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-foreground">Your digests</h2>
        <p className="text-sm text-text-secondary">Everything your alerts found, as it was sent. A job that has closed since is marked.</p>
      </div>
      {digests === null ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : digests.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg bg-primary-tint p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Sparkles className="size-4" />
          </span>
          <p className="text-sm text-text-secondary">
            <span className="font-semibold text-foreground">No digests yet.</span> Your first one arrives once your alerts find new jobs.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {digests.map((d, i) => (
            <DigestCard key={d.id} d={d} open={open.has(d.id) || (!focus && d.id === first && open.size === 0)} focused={d.id === focus} onToggle={() => toggle(d.id)} index={i} />
          ))}
        </ul>
      )}
    </section>
  )
}

function DigestCard({ d, open, focused, onToggle, index }: { d: Digest; open: boolean; focused: boolean; onToggle: () => void; index: number }) {
  const reduced = !!useReducedMotion()
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" })
  }, [focused, reduced])
  const companies = [...new Set(d.jobs.map((j) => j.company))].slice(0, 4)
  return (
    <motion.li ref={ref} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.settle, delay: reduced ? 0 : Math.min(index, 6) * 0.04 }} className={cn("scroll-mt-6 overflow-hidden rounded-lg border transition-shadow", open && "shadow-[0_18px_40px_-30px_rgba(0,91,167,0.6)]", focused && "border-primary/40")}>
      <button type="button" onClick={onToggle} aria-expanded={open} data-ai={`insights.digest:${d.id}`} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary-tint">
        <span className="flex -space-x-2">
          {companies.map((c) => (
            <CompanyAvatar key={c} name={c} size={28} className="ring-2 ring-card" />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">
            {d.jobs.length} job{d.jobs.length === 1 ? "" : "s"} · {d.headline}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
            {dayLabel(d.at)}
            {d.emailed && (
              <>
                <span aria-hidden>·</span>
                <MailCheck className="size-3" /> Emailed
              </>
            )}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-text-tertiary transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduced ? 0 : 0.25, ease: ease.out }} className="border-t border-divider">
            {d.jobs.map((j) => (
              <li key={j.id} className="border-b border-divider last:border-b-0">
                <a href={j.url} target="_blank" rel="noreferrer" data-ai={`insights.job:${j.id}`} className={cn("group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-primary-tint", j.closed && "opacity-60")}>
                  <CompanyAvatar name={j.company} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{j.title}</span>
                      {j.closed && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-text-secondary">Closed</span>}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-text-tertiary">
                      <span className="font-medium text-text-secondary">{j.company}</span>
                      {j.remote ? (
                        <span className="flex items-center gap-1"><Globe2 className="size-3" />Remote</span>
                      ) : j.location ? (
                        <span className="flex items-center gap-1"><MapPin className="size-3" />{j.location}</span>
                      ) : null}
                      {j.posted_at && <span>Posted {timeAgo(j.posted_at)}</span>}
                    </span>
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-lavender transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                </a>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

export function EmailNote() {
  return (
    <p className="flex items-center gap-2 text-xs text-text-tertiary">
      <Mail className="size-3.5" />
      Every email has a one-click link to stop them. Alerts in Plato keep working.
    </p>
  )
}
